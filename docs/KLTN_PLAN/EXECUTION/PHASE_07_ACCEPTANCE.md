# Phase 7 mock application acceptance and Phase 8D follow-up

**Current mock status MOCK_VERIFIED for D01–D11 · 2026-11-09**

Phase 7 was PARTIAL. It reviewed Phase 5–6 in the existing working tree based on `33366f7`. The C2C readiness check returned `EPERM` opening local connection state. Phase 8D integrates the Phase 8A–8C corrections and uses local source review and executable evidence. Independent C2C verification remains unavailable.

## Safety and correctness

| Check | Source and executable evidence |
| --- | --- |
| ADMIN and exact hash | `http.ts` derives the actor from the current authenticated account and restricts approval/revocation to ADMIN. `AgentWorkflow.approve` also checks Backend authority, Agent grant, waiting state, expiry and exact hash. The hash covers graph, revision, source versions and prepared proposal. The Phase 6 HTTP test and browser probe deny STAFF and reject a wrong hash. |
| Current execution authority | `executeReplenishment` checks the original owner, current Agent run grant, current Backend permissions and the approver’s current ADMIN authority. It compares versions and time-sensitive stock again before dispatch. `replenishment.test.cjs` exercises permission denial, revoked/expired approval and stale stock. `mock-http.test.cjs` covers current account lookup and ADMIN downgrade on the legacy path. |
| Six-step dependencies and budget | `replenishment.ts` compares the plan to the fixed graph. `executeReplenishment` checks verified predecessors, charges actual safe-read retries and reserves two units for the purchase. `replenishment.test.cjs` rejects reordered, mixed, cyclic and undeclared plans and checks retry exhaustion. Browser-origin HTTP rejects budget 6 and shows spent 5 at approval, spent 7 and reserved 0 after success. These are tool units. |
| Receipt and UNKNOWN | `BusinessWorkflows.purchaseReceipt` recomputes the scoped key and request hash, checks actor and receipt versions, and checks the successful purchase reference. Agent compares a returned response to the receipt and verifies proposal lines, pack counts and quote versions. The six-step and Phase 8A legacy tests cover committed receipt recovery after expiry, missing or invalid evidence, and one dispatch producing one PR. |
| Memory provenance | `verifiedSources` requires same owner, successful execution, verified tool result and linked passing evaluation. Purchase evidence requires receipt proof. `planningContext` filters active relevant records and sends bounded typed evidence. `memory-learning.test.cjs` exercises missing provenance, isolation, forgetting, hostile text, failed outcomes and self-reinforcement. Browser probe confirms confidence 0 before independent verification, 0.9 with linked provenance after it, and a changed next inspection plan for the owner. |
| Concurrency, cancellation and rollback | `BusinessWorkflows.atomic` enlists Agent state in the serialized mock transaction. Phase 6 tests exercise concurrent preparation/execution, cancellation before dispatch, whole-transaction commit failure and Backend write rollback. Browser probe confirms concurrent same-key resume creates one PR and post-commit cancellation returns 409. The restart probe checks saved waiting state, approval and command receipts across three Node processes. |
| Committed purchase correction | The workflow rejects cancellation once dispatch is uncertain or the PR has committed. A committed purchase requires a separately authorized corrective business workflow. The review introduced no compensation. |

### Phase 7 findings and Phase 8 corrections

1. **Recovery.** Phase 7 reproduced a committed purchase stuck in UNKNOWN because live approval was checked before receipt lookup. Phase 8A persists the original command and checks that receipt under current access rules before any new dispatch checks. A matching receipt recovers the original result even after expiry or recorded revocation. Missing or mismatched receipts leave the purchase UNKNOWN. An additional purchase step still requires valid authority, approval, source versions and proposal hash.
2. **Browser entry point.** Phase 7 required direct HTTP to create and prepare the six-step plan. Phase 8B adds the replenishment form and operator costs to the existing mock Agent admin page. The page displays inventory analysis, recommendations and dependencies, and uses the existing Agent routes and Backend BusinessPort for review, execution, cancellation and recovery.
3. **Memory attribution.** Phase 7 recorded matching hints for fixed plans without showing any influence. Phase 8C distinguishes retrieved, presented and attributed hints. A built-in decision trace supports USED, opaque decisions are UNKNOWN, and the fixed workflow marks matching hints unpresented and UNUSED. Hint-derived outcomes cannot reinforce the hint. Verified independent outcomes can still supply other owner-scoped learning, with their original execution and evaluation provenance.

## Browser and restart acceptance

The Playwright suite renders the real React pages in headless Chromium or Edge. Vite proxies to loopback Express. The harness rejects requests to external origins and legacy API paths. The process tests use real loopback sockets and fresh Node processes.

| Scenario | Observed evidence |
| --- | --- |
| Menu → Recipe → Order → Inventory | `mock-ui.test.cjs` product form saves and publishes a recipe. The order form creates two items, then prepares them. HTTP reads confirm early-lot reservations become consumed, with COGS 3.60. |
| Purchase → GoodsReceipt → StockCount | Connected forms create a two-line PR, confirm receipt, and add a 1,000-unit milk lot. ADMIN self-approval requires a reason. Approved stock count has variance −2. |
| Agent replenishment → ADMIN → PR | In Phase 8D, STAFF enters costs and prepares all six steps through the admin page. ADMIN reviews the exact hash. The browser verifies expiry blocks dispatch and a fresh approval enables it. Concurrent copies of the same execute request return the same result. All six steps verify, with one PR and a matching Backend receipt key, request hash and response. Separate browser cases cover cancellation, permission denial and UNKNOWN recovery through a dropped HTTP response, reload and same-key retry. |
| Payment → Refund → Reconciliation | Existing forms record mock settlement and a successful refund, then show account/date reconciliation as MATCHED. |
| Memory-assisted planning and learning | The integrated browser case checks confidence 0 before purchase, 0.9 in the UI after receipt verification, and provenance tied to the purchase execution and its passing evaluation. ADMIN cannot retrieve the STAFF memory. Forgetting removes it from later planning, and learning requests for the forgotten or invalid ID are denied. The Phase 8C suite independently verifies the planner's USED decision trace. |
| Roles, loading and replay | Baseline verifies invalid login, STAFF payment denial, frozen order input after a dropped response, reload and same-key retry. The Phase 7 probe delays the initial order query, checks disabled submission, displays a 503 error and recovers on reload. |
| Process restart | `mock-process.test.cjs` proves default state loss. `mock-recovery.test.cjs` proves opt-in local snapshot restore for legacy commands. The Phase 7 process probe verifies the six-step waiting/approved run survives one restart and its committed response replays after a second restart with one PR. |

## D01–D11 mock matrix

Test filenames resolve under `apps/api/tests` unless indicated. Names below identify executable cases run by the full suite or Phase 7 probes. `MOCK_VERIFIED` applies to the stated mock behavior.

| ID | Mock status | Executable evidence |
| --- | --- | --- |
| D01 Recipe and order snapshots | MOCK_VERIFIED | `mock-phase3.test.cjs` “draft privacy, publish, version guard, replay, frozen historical recipe”. `inventory-core.test.cjs` “recipe yield and explicit optional omission”. `mock-http.test.cjs` “multi-item frozen recipe snapshots”. |
| D02 Units and whole pieces | MOCK_VERIFIED | `ingredient-policy.test.cjs` “exact dimensional conversion and canonical strings” and “rejects invalid, cross-dimension, fractional-piece and overflow input”. `mock-workflows.test.cjs` “fractional piece receiving/counts fail”. |
| D03 Precision and COGS | MOCK_VERIFIED | `inventory-core.test.cjs` “source×lot cents conserve aggregate COGS” and “unknown differs from known zero”. `mock-http.test.cjs` “consumed correction credits original component” and “remake cannot change previously frozen component cents”. |
| D04 FEFO and expiry | MOCK_VERIFIED | `ingredient-policy.test.cjs` “expiry boundary, quarantine and deterministic FEFO”. `mock-workflows.test.cjs` “expired reservation reallocation and insufficient stock rollback”. |
| D05 Reservation and terminal allocation | MOCK_VERIFIED | `mock-workflows.test.cjs` “same-key contenders replay; competing reservations cannot oversell” and “exact recipe, FEFO, consume once”. `mock-http.test.cjs` “per-item preparation/cancellation/remake preserves other reservations”. |
| D06 Procurement and receiving | MOCK_VERIFIED | `mock-workflows.test.cjs` “frozen packs, multi-item draft revisions, fractional-pack lot splits, corrections”. `mock-phase3.test.cjs` “receipt payable conserves cents across split lots” and “same-supplier transfer atomic with rollback/replay”. Browser confirms both receipt lines and resulting milk lot. |
| D07 Stock counts | MOCK_VERIFIED | `mock-workflows.test.cjs` “count approval state, reason, stale versions, variance”. `mock-http.test.cjs` “fault rollback, aftercommit replay and stock-count variance lifecycle”. Browser confirms ADMIN self-approval reason and signed variance. |
| D08 Prepare, cancel, remake and loss | MOCK_VERIFIED | `mock-http.test.cjs` “per-item preparation/cancellation/remake preserves other reservations and loss lineage”. `mock-workflows.test.cjs` “cancellation does not replenish consumed stock”. |
| D09 Business command identity and recovery | MOCK_VERIFIED | `mock-workflows.test.cjs` “arbitrary edit/rejection history survives snapshot restart” and “at most three confirmed-rollback attempts; UNKNOWN absence never retries”. `mock-recovery.test.cjs` “real process restart replays business and Agent command receipts”. Browser replays one order after reload. Local recovery scope is an opt-in, single-process snapshot. |
| D10 Agent approval, budget and memory | MOCK_VERIFIED | `apps/agent/tests/mock-agent-workflow.test.cjs` verifies original legacy receipt recovery after expiry or recorded revocation, missing and mismatched receipts, exact replay and fresh-dispatch guards. `apps/agent/tests/replenishment.test.cjs` and `mock-http.test.cjs` cover graph, budget, approval, cancellation, source versions, rollback and replay. `apps/web/tests/mock-ui.test.cjs` verifies the integrated six-step browser path, one PR, receipt linkage and memory feedback. `apps/agent/tests/memory-learning.test.cjs` verifies decision evidence, non-reinforcement, owner isolation and forgetting. |
| D11 Payment, refund and reconciliation | MOCK_VERIFIED | `mock-http.test.cjs` “failed attempt, settlement, uncertain refund and historical recovery”. `mock-workflows.test.cjs` “unknown refund blocks new dispatch, resolution applies once, reconciliation by account/date”. Browser verifies MATCHED after mock settlement and refund. |

## Phase 7 regression baseline

Run from repository root in PowerShell.

```powershell
$env:DATA_PROVIDER = 'mock'
$env:TEST_IN_PROCESS = '1'
npm test -- --test-concurrency=1
node --test .task-artifacts/phase7/browser-probe.cjs
node --test .task-artifacts/phase7/recovery-probe.cjs
npm run build -- --force --concurrency=1
npm run check-types --workspace @cafe-project/agent --workspace @cafe-project/api
```

- Baseline **217/217 passed**, zero failed, skipped, cancelled or todo. Six cases used the real browser. The older HTTP tests use in-process requests with the flag above. Browser and process cases use sockets.
- Phase 7 local probes passed **3/3 browser** and **2/2 recovery** cases separately from the baseline. The recovery result includes one executable witness of a defect and one restart acceptance case.
- Forced serial build passed **5/5** with zero cache hits. The initial parallel forced build hit host memory limits. Web reports stale Browserslist data and a large bundle warning. Turbo reports a missing output declaration for the types build.
- Root `npm run check-types` failed because Turbo has no task named `check-types`. Direct Agent/API checks passed. The successful Web build includes `tsc -b`.

## Phase 8D integrated acceptance

- Full mock suite **229 passed, 0 failed, 0 skipped, 0 cancelled, 0 todo**, including **9/9 real Edge browser cases**. The two earlier runs each reached 228 passes and one failure in the added browser assertions. The final test checks the provenance fields directly and locates the rendered memory row by its visible text.
- Forced sequential builds **5/5**, zero cache hits. Direct TypeScript checks **6/6**. Web reported a large chunk and stale Browserslist data. Turbo reported a missing output declaration for the types build.
- The review found no unresolved critical mock correctness issue. Historical replay retains its recorded response. Legacy memory snapshots without presentation evidence cannot supply new learning from a hinted outcome.
- The full suite includes checks of the binding mock manifest with exactly 27 table identities and 16 ENUM names.

### Reproducibility

Run from the repository root in PowerShell with local Edge or Playwright Chromium process access. `TEST_IN_PROCESS` applies to the older HTTP harness. Browser and process tests still use real loopback sockets.

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

## PostgreSQL acceptance

**BLOCKED · POSTGRES_NOT_VERIFIED.** PostgreSQL durability, cross-connection concurrency, provider recovery, grants and sole-writer enforcement require separate acceptance. U1 still lacks a physical owner for arbitrary command receipts, with U2–U6 remaining open per the persistence contract. This phase used mock application providers, local HTTP and development snapshots. No PostgreSQL connections, migrations or external application provider calls were made. The target remains **27 business tables and 16 ENUMs**.
