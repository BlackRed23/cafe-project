# Phase 9 mock baseline freeze and demo readiness

**READY · 2026-11-09 · D01–D11 MOCK_VERIFIED**

The Café AI System demo uses deterministic, in-memory fixtures. PostgreSQL persistence remains **BLOCKED**. The binding mock manifest has **27 business tables and 16 ENUMs**.

## Accepted baseline

Phase 8D recorded **229 passed, 0 failed, 0 skipped, 0 cancelled, 0 todo**, including **9/9 real Edge cases**. Five forced sequential builds and all six direct TypeScript checks passed. Phase 9 rehearsed the compiled startup and role flow on Windows with Node 24.21.0 and npm 11.19.0. The Phase 8D full-suite result is the freeze baseline. [Phase 8D evidence and D01–D11 matrix](PHASE_07_ACCEPTANCE.md)

Run from the repository root with installed workspace dependencies and local Edge or Playwright Chromium process access. The older HTTP harness uses `TEST_IN_PROCESS`. Browser and process cases still use loopback sockets.

```powershell
$env:DATA_PROVIDER = 'mock'
$env:TEST_IN_PROCESS = '1'
npm test -- --test-concurrency=1
npm run build -- --force --concurrency=1

$configs = @(
  'apps/agent/tsconfig.json',
  'apps/api/tsconfig.json',
  'apps/web/tsconfig.app.json',
  'apps/web/tsconfig.node.json',
  'packages/database/tsconfig.json',
  'packages/types/tsconfig.json'
)
foreach ($config in $configs) {
  node node_modules/typescript/bin/tsc --project $config --noEmit
  if ($LASTEXITCODE -ne 0) { throw "TypeScript check failed for $config" }
}
git diff --check
```

## Windows PowerShell startup

Open a dedicated PowerShell session at the repository root. Use the existing Phase 8D build output, or run the serial build above after any source change. Agent starts inside the mock API and uses its Backend BusinessPort. The demo has two listeners.

```powershell
$demoRepo = (Get-Location).Path
$demoNode = (Get-Command node.exe -ErrorAction Stop).Source
foreach ($file in @('apps/api/dist/workflows/server.js', 'apps/agent/dist/workflows/agent-workflow.js', 'node_modules/vite/bin/vite.js')) {
  if (-not (Test-Path -LiteralPath (Join-Path $demoRepo $file) -PathType Leaf)) {
    throw "Missing $file. Use the repository root and build with installed dependencies."
  }
}
foreach ($port in 5000,5100,5173) {
  $socket = [Net.Sockets.TcpClient]::new([Net.Sockets.AddressFamily]::InterNetwork)
  try {
    $socket.Connect([Net.IPAddress]::Loopback, $port)
  } catch {
    if ($_.Exception.InnerException.SocketErrorCode -eq [Net.Sockets.SocketError]::ConnectionRefused) { continue }
    throw
  } finally {
    $socket.Dispose()
  }
  throw "Loopback port $port is already in use."
}

$env:DATA_PROVIDER = 'mock'
$env:VITE_DATA_PROVIDER = 'mock'
$env:NODE_ENV = 'development'
$env:MOCK_PORT = '5100'
$env:MOCK_NOW = '2026-11-07T00:00:00.000Z'
$env:MOCK_STATE_PERSISTENCE = 'false'
Remove-Item Env:MOCK_STATE_PATH -ErrorAction SilentlyContinue
$env:JWT_SECRET = & $demoNode -p "require('node:crypto').randomBytes(32).toString('hex')"
if ($LASTEXITCODE -ne 0 -or $env:JWT_SECRET.Length -lt 32) { throw 'Demo signing key generation failed.' }

$demoLogs = Join-Path $env:TEMP ('cafe-mock-demo-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $demoLogs | Out-Null

function Wait-CafeDemoHttp($process, [string]$url) {
  for ($i = 0; $i -lt 60; $i++) {
    if ($process.HasExited) { throw "Demo process exited. Check $demoLogs." }
    try {
      $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
      if ($response.StatusCode -eq 200) { return }
    } catch {}
    Start-Sleep -Milliseconds 250
  }
  throw "Demo endpoint unavailable at $url. Check $demoLogs."
}

function Start-CafeDemoApi {
  Start-Process -FilePath $demoNode -ArgumentList 'apps/api/dist/workflows/server.js' `
    -WorkingDirectory $demoRepo -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $demoLogs 'api.out.log') `
    -RedirectStandardError (Join-Path $demoLogs 'api.err.log')
}

$demoApi = $null
$demoWeb = $null
try {
  $demoApi = Start-CafeDemoApi
  Wait-CafeDemoHttp $demoApi 'http://127.0.0.1:5100/health'
  $health = Invoke-RestMethod 'http://127.0.0.1:5100/health'
  if ($health.data.provider -ne 'mock' -or $health.data.postgres -ne 'POSTGRES_NOT_VERIFIED') {
    throw 'Unexpected API health identity.'
  }
  $demoWeb = Start-Process -FilePath $demoNode `
    -ArgumentList @('../../node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5173','--strictPort','--mode','mock-demo') `
    -WorkingDirectory (Join-Path $demoRepo 'apps/web') -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $demoLogs 'web.out.log') `
    -RedirectStandardError (Join-Path $demoLogs 'web.err.log')
  Wait-CafeDemoHttp $demoWeb 'http://127.0.0.1:5173/login'
} catch {
  foreach ($process in @($demoWeb, $demoApi)) {
    if ($process -and -not $process.HasExited) { Stop-Process -InputObject $process -ErrorAction SilentlyContinue }
  }
  throw
}
```

Open [mock sign-in](http://127.0.0.1:5173/login). Use separate browser profiles or one normal and one InPrivate window for the two roles. Run the following from the same PowerShell session. Tokens expire after **30 minutes of wall-clock time**. Paste each token before copying the next, and keep tokens out of logs, screenshots and chat.

```powershell
function Copy-CafeDemoToken([ValidateSet('staff','admin')][string]$role) {
  $token = & $demoNode (Join-Path $demoRepo 'apps/api/dist/workflows/server.js') --token $role
  if ($LASTEXITCODE -ne 0 -or -not $token) { throw "Token issuance failed for $role." }
  Set-Clipboard -Value $token
}
Copy-CafeDemoToken staff
# Paste and sign in as STAFF, then issue the ADMIN token for the second profile.
Copy-CafeDemoToken admin
# After pasting the ADMIN token, clear the clipboard.
Set-Clipboard -Value ' '
```

Optional Agent smoke in the same session runs a fresh in-memory recommendation and exits. Its output contains status and provider identity.

```powershell
& $demoNode (Join-Path $demoRepo 'apps/api/dist/workflows/server.js') --scan-once
```

Expected output is `SUCCEEDED`, provider `mock`, PostgreSQL `POSTGRES_NOT_VERIFIED`. The compiled entrypoint explicitly selects the mock HTTP composition and fixture JWT authentication. It uses the built-in MockLLM and mock payment event handlers. The API listens on loopback and the mock frontend routes to port 5100. Port 5000 stays unused. The rehearsal intercepted browser requests and observed zero legacy API or external-origin requests. [Mock boundary and entrypoints](../../MOCK_FIRST_BACKEND.md)

## Deterministic presenter scenarios

Start each standalone scenario from the reset procedure below. Recipe, Order and Inventory can share one run in that order. Copy record IDs from the visible lists because IDs depend on the sequence of commands.

| Scenario | Inputs and actions | Visible result |
| --- | --- | --- |
| Recipe · ADMIN | **Menu & Recipes** → **Save recipe draft**. Product `demo-coffee`, name `Demo Coffee`, price `30`, yield `1`, required ingredient `beans`, quantity `18`, unit `g`. **Publish recipe** for `demo-coffee`. | Published active recipe and version. `demo-coffee` becomes orderable. |
| Order · STAFF or ADMIN | **Orders** → **Create order**. Two items, `demo-coffee` and `coffee`, one serving each, POS gross `60`. Use **Change order state** → `prepare` with the displayed order ID. | Two frozen recipe snapshots. The order moves to `PREPARING`, early-lot allocations become consumed, and COGS is `3.60`. |
| Inventory · STAFF or ADMIN | **Inventory**. Inspect `early` and `late` beans lots, and the milk recommendation. In a fresh fixture the lots start at `100 g` each. In the Recipe/Order run, inspect after preparation. | Early lot `64 g`, late lot `100 g` after the two-item order. With zero milk on hand, recommendation is `1000 ml`. |
| Purchase · STAFF or ADMIN | **Purchases & Receipts** → **Create purchase request**. Supplier `full-supplier`, ingredient `milk`, base quantity `1000`, cost per base unit `0.02`. Draft receipt for the resulting PR with milk `1000` and expiry `2027-02-01T00:00:00.000Z`. Confirm the displayed receipt ID. | One milk bottle in the proposal, receipt `CONFIRMED`, purchase `RECEIVED`, and a new inventory lot with `1000 ml`. |
| StockCount · ADMIN | **Stock Counts** → **Create stock count**. Lot `early`, actual `98`. Submit the count, then approve the same ID with reason `Demo physical check`. For the denial demonstration, try approval once with the reason blank. | Missing reason returns `SELF_APPROVAL_REASON_REQUIRED`. Successful approval shows `APPROVED`, variance `-2.000`, and early lot `98 g`. |
| Payment · ADMIN | Create a `coffee` order for one serving, POS gross `30`, then prepare and complete it. **Payments & Refunds** → **Create payment attempt** for that order, account `cash`. Inject settlement `demo-settle-01`, amount `30`, outcome `SETTLED`. Request refund `5`. Resolve it with the displayed payment and refund IDs, account `cash`, event ID `demo-refund-01`, outcome `SUCCEEDED`. Reconcile `cash` on `2026-11-07`, gross `30`, refunds `5`. | Mock payment and refund succeed. Reconciliation is `MATCHED` with gross `30.00` and refunds `5.00`. |
| AI Agent · STAFF → ADMIN → STAFF | Use the walkthrough below on a fresh fixture with zero milk. | Six verified steps, one PR, and the verified original Backend operation receipt. |

### Six-step Agent walkthrough

1. In the STAFF profile, open **Agent & Memory Learning**. To show verified learning, optionally **Remember** `purchase create`, then **Learn memory** using the displayed ID. Confidence starts at `0`.
2. Choose **Plan replenishment**. Set supplier `full-supplier`, ingredient `milk`, cost per base unit `0.25`, and tool budget `7`. Submit and inspect the six steps and dependencies in **Proposal review**.
3. Click **Analyze inventory and request approval**. Expected recommendation is one bottle, `1000 ml`, at cost `0.25` per base unit. Execution is `AWAITING_APPROVAL`. The reviewed proposal includes its source versions and hash.
4. In ADMIN, refresh **Agent & Memory Learning**, open the matching execution and choose **Use this record**, then **Review for ADMIN approval**. Review the exact proposal, hash and source versions. Set expiry `2099-01-01T00:00:00Z`, check the review box, then choose **Approve proposal**.
5. In STAFF, refresh the selected execution and click **Execute replenishment**. Expect `SUCCEEDED`, six verified tool calls, spent `7`, reserved `0`, and one PR in **Purchases & Receipts**. Open **Execution audit** to inspect the purchase call's verified receipt key and request hash. If the optional memory was created, its owner sees confidence `0.9` and the purchase evaluation reference.
6. To show cancellation, use a fresh planned or waiting execution and choose **Cancel this replenishment** before dispatch. For a dropped HTTP response, use **Retry same operation**. For execution status `UNKNOWN`, use **Recover purchase receipt**. The accepted suite covers fault and replay paths with test controls.

### Role rehearsal evidence

- An invalid token was rejected. The compiled token command signed in separate browser sessions as `staff@mock.invalid` and `admin@mock.invalid`. Authenticated session reads confirmed both roles.
- STAFF could plan and request approval. The Payments page showed Unauthorized, and a direct mock approval request returned HTTP 403. ADMIN reviewed the exact hash. The original STAFF owner executed after approval.
- The browser verified six successful steps, a single matching PR, and a verified purchase receipt. A compiled API restart restored empty purchase, execution and memory lists and the two fixture lots.
- The live rehearsal launched the same compiled API and Vite commands from a process harness. The PowerShell blocks were checked for syntax. The final PowerShell wrapper's live launch remains unverified because the sandbox denied its loopback socket preflight.

## Safe reset and shutdown

Reset clears only disposable mock business and Agent data. Close the demo tabs or profiles first so old page state and frozen pending commands cannot replay into the fresh fixture. Restart the owned API process with persistence still disabled. Vite may stay running.

```powershell
if ($env:MOCK_STATE_PERSISTENCE -ne 'false') { throw 'Reset requires in-memory mode.' }
if ($demoApi -and -not $demoApi.HasExited) {
  Stop-Process -InputObject $demoApi
  $demoApi.WaitForExit()
}
$demoApi = Start-CafeDemoApi
Wait-CafeDemoHttp $demoApi 'http://127.0.0.1:5100/health'
```

Reopen with a fresh profile or clear only site data for `http://127.0.0.1:5173` in the demo profile, then sign in again. Verify empty Orders, Purchases and Agent execution lists and the two `100 g` bean lots.

After the demo, close the browser sessions and stop the two owned processes.

```powershell
foreach ($process in @($demoWeb, $demoApi)) {
  if ($process -and -not $process.HasExited) { Stop-Process -InputObject $process }
}
Set-Clipboard -Value ' '
Remove-Item Env:JWT_SECRET -ErrorAction SilentlyContinue
```

## Presenter checklist and rollback checkpoint

- [ ] Verify Phase 8D working-tree fingerprint and build output. Check the mock banner and health identity.
- [ ] Prepare independent STAFF and ADMIN sessions. Reset fixtures before the standalone scenarios, especially Agent after receiving milk.
- [ ] Show waiting approval, exact-hash ADMIN review, one purchase, its receipt, and verified memory feedback.
- [ ] Stop only the two owned listeners. Keep the baseline working tree, including its untracked Phase 8 files.

| Checkpoint item | Frozen value |
| --- | --- |
| Git anchor | `33366f714b288310580d69247e47c58aa4ea062f` plus the accepted working-tree changes. A checkout of the anchor alone lacks the accepted implementation. |
| Runtime and test delta | 31 changed tracked files and 38 untracked source/test files. SHA-256 `46ecce35ace6b83724faf1f6075b07339396bc671fb3b4ff344fc89b1a54e697`. |
| Acceptance report SHA-256 | `9b3cf6111e3aa8d8f80bc60dff0b415b5b9a2bee9e0099e80a4aa06af0d49ba0` |
| Mock-first report SHA-256 | `3629ba51f08c8fd4fb0f611c3e6842c568473353279fb6ac38e6a2632035e427` |

To verify the delta, take changed tracked paths from `git diff --name-only --no-renames HEAD -- apps packages .gitignore package.json package-lock.json turbo.json`, plus untracked paths from `git ls-files --others --exclude-standard -- apps packages` ending in `.ts`, `.tsx`, `.cjs`, `.json` or `.css`. Deduplicate and sort paths ordinally. For each path, write the path, a tab, and the lowercase SHA-256 of its raw file bytes. Hash the UTF-8 records joined by LF with no trailing newline. The fingerprint identifies the dirty baseline. Restore source from a separately preserved copy if future edits change it. A Phase 9 document rollback consists of moving this report aside after review.

## Remaining limits

Demo data and idempotency receipts last for the running mock process. Tool budget uses mock tool units. Local compile and browser evidence covers D01–D11 in mock scope. PostgreSQL, real providers and independent C2C acceptance remain outside the verified demo boundary.

