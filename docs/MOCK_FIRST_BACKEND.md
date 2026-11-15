# Mock-first workflows

Persistence follow-up: [design audit and ownership/writer matrices](KLTN_PLAN/ARCHITECTURE_FINAL/POSTGRESQL_PERSISTENCE_CONTRACT.json). Target identities and business requirements remain fixed; U1 is unresolved, U2–U5 physical contracts are not frozen, and U6 catalog/runtime enforcement remains unverified. Conditional SQL savepoint/recovery plans do not turn mock operation maps into durable receipts.

Status **Phase 8D mock application acceptance MOCK_VERIFIED for D01–D11. PostgreSQL persistence BLOCKED. POSTGRES_NOT_VERIFIED.**
The review, evidence and matrix are in the [Phase 7 and Phase 8D acceptance report](KLTN_PLAN/EXECUTION/PHASE_07_ACCEPTANCE.md).
No PostgreSQL connections, migrations, schema generation or live LLM/payment calls are part of this implementation.
Week 04/05 database acceptance remains BLOCKED. Existing uncommitted changes are retained.

## Entry points

- Backend: `apps/api/src/workflows/index.ts`, `createBackendWorkflows(env, clock)`.
- Agent: `apps/agent/src/workflows/agent-workflow.ts`, `createAgentRuntime(business, env, llm)`.
- Built Agent package subpath: `@cafe-project/agent/workflows`.
- `BusinessWorkflows` implements the injected Agent `BusinessPort`; Agent contains no stock or purchasing implementation.
- HTTP: `apps/api/src/workflows/http.ts`, `createMockHttpApp(options)`, prefix `/api/mock`.
- Executable: `apps/api/src/workflows/server.ts`; `dev:mock`, `start:mock`, `mock:scan`, `mock:token` in the API workspace.
- Legacy `apps/api/src/index.ts`, `apps/agent/src/server.ts`, `apps/agent/src/worker.ts` and scheduled jobs remain separate and unchanged. Mock commands never load them. Existing production routes are not redirected to mock.

```ts
const backend = createBackendWorkflows({ DATA_PROVIDER: 'mock' });
const agent = createAgentRuntime(backend, { DATA_PROVIDER: 'mock' });
```

The existing service factory still defaults to mock locally. **HTTP/CLI require explicit DATA_PROVIDER=mock** and reject production, postgres and unset/unknown mode before creating a listener.
Both postgres composition paths fail closed while approved schema/adapters are unavailable.
DATABASE_URL is neither read nor logged by the stub. A future real adapter must implement the same
narrow contracts, preserve service authorization/validation, and pass the contract harness before enabling postgres.
There is no connection-error fallback.

## Source inventory and compatibility boundary

| Responsibility | Existing source reused / extension |
|---|---|
| Domain/repository contracts | `apps/api/src/workflows/contracts.ts`; narrow Recipe, Inventory, Order, Purchase, Count, Payment and operation-history interfaces |
| Mock transactions | `mock-repository.ts`; detached FIFO drafts, sync/async savepoints, commit enlistment, fault points, snapshot restore |
| Business rules | `business-service.ts`; existing Inventory Core/unit/expiry helpers reused; HTTP invokes these same methods |
| Planner/executor/verifier | `apps/agent/src/workflows/agent-workflow.ts`; explicit registry/allowlist, MockLLMProvider, actual tool-call/evaluation records |
| Agent storage/memory | Same existing Agent module; execution/approval/revision/budget/audit and owner-scoped Memory Learning remain Agent-owned |
| Authentication | Existing `auth.middleware.ts` now exports an injectable source; default source still calls legacy auth service. JWT verification extracted unchanged to `auth.tokens.ts` and shared by both paths |
| Production HTTP/worker | Existing API index, Agent server/worker and cron entrypoints are not used or modified by the mock bootstrap |
| Tests | Existing service/adapter vectors retained; `mock-http.test.cjs` adds real Express middleware tests over in-process Node HTTP request/response objects; source imports forbid Prisma, live LLM and email infrastructure |

No alternate business service, repository architecture or Recovery document series was created.
The API depends on the isolated Agent workspace export; Agent does not import the API implementation.
Co-location for mock transaction enlistment does not transfer ownership of AgentExecution,
AgentToolCall or AgentEvaluation to backend services.

## Implemented scenarios and remaining coverage

| Requirement | Implemented mock behavior | Remaining full acceptance obligations |
|---|---|---|
| D01 | Multi-item orders, item identities, frozen recipe/version/yield/omissions/ADD snapshots and exact source-component fractions; recipe reads/requirements HTTP | Approved private-variant/published-child ownership and persistent immutability contract (U2); mock draft/publish/archive now available; physical private-variant/published-child ownership remains U2 |
| D02 | Existing dimensional conversion, whole pieces, precision validation on purchase/receipt/count inputs | Persistent unit immutability and all legacy writer parity |
| D03 | Exact source-component × lot COGS, recipe/topping provenance, rounding conservation, known zero versus unknown, frozen historical cents across remakes, separate correction credits | Approved physical component/valuation ownership and real database enforcement (U5) |
| D04 | FEFO with deterministic tie ordering, expired/invalid expiry quarantine, reallocation at preparation | Real database locking, runtime grants and sole-writer enforcement |
| D05 | Per-allocation RESERVE and unique in-memory terminal; reservation/release/consumption atomic with operation receipt | SQL composite FKs, deferred conservation, cross-connection races |
| D06 | Multi-item/split-lot receipt draft/edit/confirm, frozen whole-pack ordering and fractional-pack lot splits; physical returns and explicit consumed-stock credit disposition with allocation lineage and payable deltas | Approved persistent accounts-payable lifecycle and physical owners for line/revision/correction histories (U4) |
| D07 | Draft/edit/submit/count approval, ADMIN authority, reason-bound self approval, frozen versions/reservations, signed variance and stale rejection | Full multi-user lifecycle and persistent guards |
| D08 | Item-level prepare/complete/cancel/remake, reservations of untouched items preserved, one terminal per allocation, reason-bound loss attribution, separate refunds, immutable consumed history | Database state/terminal uniqueness and real writer/lock parity |
| D09 | Scoped key/hash, canonical version, frozen status/body, retained business rejections after savepoint rollback, current permission on replay, 3 confirmed-rollback attempts, authoritative unknown-commit lookup | Mock snapshots are simulated restart, not durable disk or PostgreSQL evidence; approved U1 physical owner remains missing |
| D10 | HTTP multi-line proposal/revision/approval lifecycle, expected hash/revision checks, live approver role, ingredient/quote/lot version guards under mock transaction, allowlisted business tools, bounded budget, genuine tool calls/evaluations, Agent command replay and all five memory methods | Real LLM usage accounting and approved persistent Agent approval/memory schema (U3); real database transaction evidence |
| D11 | Multiple failed attempts, one unresolved/applied payment, account/event callback identity, full/partial refunds, pending/unknown/succeeded/failed refund attempts, account/date reconciliation | Real signed-provider verification, dispatch/lookup recovery and complete approved persistent attempt/refund mapping |

The 27 target identities and 16 ENUM names are listed in `provider.ts`; no Prisma or SQL file is changed.
This preserves the target, and does not claim the existing 31 transitional models equal 27 deployed tables.
Mock maps/arrays represent logical obligations only. They are not an approved physical mapping to those 27 tables.
U1–U6 remain as documented in `KLTN_PLAN/ARCHITECTURE_FINAL/OPEN_BLOCKERS.md`.

## Running the isolated HTTP workflow

Use a local development signing secret of at least 32 characters. No `.env`, DATABASE_URL,
Prisma client or external provider is loaded by the mock entrypoint. Existing signed JWTs work
only when their subject matches an active fixture account. There is no unauthenticated mock-login endpoint.

```powershell
$env:DATA_PROVIDER = 'mock'
$env:NODE_ENV = 'development'
$env:JWT_SECRET = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
$env:MOCK_NOW = '2026-11-07T00:00:00.000Z' # optional frozen clock
npm run build --workspace @cafe-project/agent
npm run build --workspace @cafe-project/api
npm run mock:token --workspace @cafe-project/api -- admin
npm run start:mock --workspace @cafe-project/api
```

The token command intentionally emits a local, 30-minute bearer token; it never emits JWT_SECRET.
Create a `staff` token the same way for Agent proposals and an `admin` token for approvals.
The server binds only `127.0.0.1:5100`; set MOCK_PORT to change the port.
`npm run dev:mock --workspace @cafe-project/api` builds the Agent dependency first.
`npm run mock:scan --workspace @cafe-project/api` runs the same planner/executor/recommendation
tool once without opening a listener; it makes no purchase request.
These commands do not replace the legacy `dev`, `start`, Agent server or scheduled-worker commands.

Fixtures retain coffee/beans and add latte/milk plus `full-supplier` quotes for both ingredients.
Beans start with two lots. Milk starts with zero stock: order/receive milk before preparing latte.
`full-supplier` converts one milk bottle to 1000 ml; purchase/receipt quantities and unit costs use base units.

All routes below have prefix `/api/mock` and require `Authorization: Bearer <token>`.
Mutations also require `Idempotency-Key` and strict JSON `{ "input": {...}, "versions": {...} }`.
Agent mutations use `{ "input": {...} }`. Body actor/role fields are rejected.
Response envelopes reuse `{success,message,data}`; domain error code is `message`, with `data:null`.
Quantities/money are validated decimal strings and normalized before hashing; timestamps normalize to UTC.
Ordered arrays retain order. Resource versions are strings, for example `{ "order-2": "1" }`.

| HTTP workflow | Routes |
|---|---|
| Recipe/inventory | GET `/recipes/:productId`, POST `/recipes/requirements` (raw line JSON, read-only), GET `/inventory`, GET `/inventory/recommendations`, POST `/ingredients/edit` |
| Order | POST `/orders`, `/orders/transition`, `/orders/remake`; GET `/orders/:id` |
| Menu | GET `/menu`; POST `/menu/draft`, `/menu/publish`, `/menu/archive` |
| Application reads | GET `/session`, `/views/inventory`, `/views/orders`, `/views/purchases`, `/views/counts`, `/views/payments`, `/agent/executions` |
| Purchasing | POST `/purchases/settle`, `/purchases/credit`; GET `/purchases/suppliers/:id/quotes`; POST `/purchases`; GET `/purchases/:id` |
| Receipt | POST `/receipts/draft`, `/receipts/edit`, `/receipts/confirm`, `/receipts/receive`, `/receipts/correct` |
| Count | POST `/counts`, `/counts/edit`, `/counts/submit`, `/counts/approve` |
| Payment | POST `/payments/attempt`, `/payments/settle`, `/payments/refund`, `/payments/reconcile`; GET `/payments/:id`; POST `/refunds/request`, `/refunds/resolve` |
| Agent | POST `/agent/plan`, `/agent/revise`, `/agent/approve`, `/agent/revoke`, `/agent/execute`; GET `/agent/executions/:id` |
| Memory | POST `/agent/memory/remember`, `/agent/memory/learn`, `/agent/memory/consolidate`, `/agent/memory/forget`; GET `/agent/memory?q=...` |
| Manifest | GET `/manifest` (27 target identities/16 ENUM names); GET `/health` is public and outside the prefix |

Example order input: `{"amount":"60.00","items":[{"productId":"coffee","servings":"1"},{"productId":"coffee","servings":"1"}]}`.
Each line accepts `omitted` and `effects`; Zod supplies empty arrays by default.
Transitions accept `{orderId,action:"prepare"|"complete"|"cancel",itemIds?:[...]}`.
Remakes accept `{orderId,reason,itemIds?:[...]}`. Omitted itemIds selects eligible items.
The order amount is the trusted staff/POS gross snapshot; cancellation and refunds remain separate commands.
Order `snapshot` remains a compatibility alias for the first item; `items` is authoritative for multi-item consumers.

For Agent purchasing, staff POST `/agent/plan` with `{budget:2,proposal:{supplierId,lines:[...]}}`.
Admin approves using `{executionId,expectedHash,expiresAt}`; staff executes using `{executionId}`.
Revision requires `{executionId,expectedRevision,plan:[{tool:"purchase.create",input:{supplierId,lines:[...]}}]}`.
Revisions invalidate old approval hashes. Inspection returns actual calls/evaluations and budget usage.
Read/recommend tools call the same backend services; no inventory/purchasing algorithm exists inside Agent.
Staff can plan/run and use their own memory; only current ADMIN can approve; customer has no mock write rights.
Memory `forget` removes the active retrieval record; immutable command receipts retain historical responses.
Physical retention/privacy-erasure policy remains part of the unresolved persistence contract.
Payment settlement/refund-resolution endpoints are authenticated **mock event injection**, not live provider webhooks.

## Transaction and recovery limits

Backend writes run in detached FIFO transaction drafts. Business rejections roll effects back to a
savepoint, then commit the rejection receipt. Infrastructure failures discard the entire draft.
Faults can be injected at any numbered write, before commit or after commit. After-commit ambiguity
is resolved by an authoritative operation lookup; absent results do not authorize blind retry.
Snapshot restore includes operation receipts, callback identities, document revisions and balances.
There is no TTL or fixed receipt capacity.

Mock FIFO serialization is a deterministic concurrency simulation, not PostgreSQL lock evidence.
Agent state has its own FIFO transactions and snapshot/fault support. Executions enlist their
prepared Agent state in the backend mock transaction. Source-version verification, purchase
effects, operation response, approval consumption, budget and audit publish together. Agent locks
remain held until root completion, including rollback; before-commit faults at either store roll
both drafts back. After-commit faults leave both published and replay recovers without duplicate
purchases. This is an in-process mock enlistment protocol, not distributed or PostgreSQL durability.
Agent HTTP receipts cover only Agent commands; manual domain-command receipts remain in the backend store.
Malformed schema/auth failures are rejected before a command; business rejections are retained with zero effects.
Replay always checks current authorization. A rejected execute key continues replaying its original rejection
after approval: use a new key for the new authorized command. To reconcile an UNKNOWN run, use a new
execute-command key for the same execution. The Agent looks up the original purchase receipt with the
same execution/step business key. A missing receipt leaves the run UNKNOWN without dispatching another purchase.
The mock `refund` convenience command simulates successful application without a gateway; use
requestRefund/resolveRefund to simulate pending or unknown provider outcomes. Reconciliation dates
are UTC accounting dates, independent of the operator's local timezone.

## Phase 3 before/after coverage

| Surface | Before: Phase 2 | After: Phase 3 |
|---|---|---|
| Frontend auth | Legacy API only | Explicit `VITE_DATA_PROVIDER=mock` development mode; local signed-token sign-in and current-user lookup; separate mock token/user storage; isolated layout with no legacy settings/notification/Google calls |
| Menu / Recipe | Fixture reads only | ADMIN create/edit draft, publish versioned recipe, archive; dimensions, positive quantities/yield/price and optional-row validation; optimistic guards; staff sees published metadata; historical order snapshots retained |
| Inventory | Backend lots, recommendations, rename | Existing list/detail/transactions pages show ingredients, FEFO lots/reservations, recommendations and ledger; ADMIN rename; receipts/counts reuse existing stock writer |
| Orders | HTTP commands and ID lookup | Existing list/detail pages create multiple items with omissions/ADD effects; item-scoped prepare/complete/cancel/remake; reasons, frozen components and COGS visible |
| Purchases / Receipts | HTTP commands and ID lookup | Existing list/detail pages create PRs, draft/edit/confirm/direct-receive/correct receipts; quotes and revisions visible; new payable/paid/balance/supplier-credit query and ADMIN partial supplier-payment bookkeeping, supplier-credit refund/same-supplier transfer with atomic paired entries, overpayment rejection and cent-conserving returns |
| StockCount | HTTP only | New `/admin/stock-counts`: draft/edit/submit/ADMIN approval, self-approval reason, frozen lot guards and conflict errors |
| Payments | HTTP only | New `/admin/payments`: attempts, mock settlement events, refund requests/unknown/resolution, convenience refund and account/UTC-date reconciliation; staff denied |
| Agent | HTTP commands and ID inspection | Existing Agent logs page: scoped proposal inbox, multi-line proposals/revisions, exact-hash inspection and explicit review before ADMIN approval, revocation, execution creating one PR via existing BusinessPort; actual calls/evaluations/audit |
| Memory Learning | Owner-scoped HTTP only | Remember, search/retrieve, learn, consolidate and forget forms/list in Agent page; ownership retained |
| States / recovery | No mock UI | Loading, empty, validation, unauthorized and domain errors; concurrent submission disabled; pending key/payload/versions frozen in per-actor browser session; explicit retry across reload recovers same operation receipt |

Connected existing components: `AdminDashboardPage`, `AdminProductsPage`, `AdminProductFormPage`,
`AdminInventoryPage`, `AdminInventoryDetailPage`, `AdminInventoryTransactionsPage`, `AdminOrdersPage`,
`AdminOrderDetailPage`, `AdminPurchaseRequestsPage`, `AdminPurchaseRequestDetailPage`, `AdminAgentLogsPage`.
Default legacy routes/components remain selected when mock opt-in is absent. Mock navigation explicitly
reports legacy-only screens as unavailable; it does not forward them to production. Customer fixture
has no mock business permissions. Customer checkout and unrelated legacy user/category/settings screens
are not claimed as mock coverage.

Start isolated API using commands above; start frontend separately:

```powershell
$env:VITE_DATA_PROVIDER = 'mock'
npm run dev --workspace @cafe-project/web
```

Open `/login`; enter local token issued by `mock:token`. STAFF/ADMIN fixture required. Vite forwards
`/api/mock` to isolated server. Frontend has no legacy API fallback. Mock UI rejects production-mode
execution; default production build retains legacy application behavior. Optional remote font links
are removed from mock HTML, so browser tests need no external network requests.

Browser session storage contains pending-command recovery metadata only, not business persistence.
Mock business data defaults to process memory; API restart loses it unless explicit Phase 5 local
development persistence is enabled (configuration below). Supplier-payment records are local bookkeeping, with no bank/gateway dispatch. Credits
created by returns can be recorded as supplier refunds or transferred atomically to another received
purchase from the same supplier. Both flows are mock bookkeeping, never actual money movement.

Agent Rollback checkpoint created before source edits: `.task-artifacts/phase3/agent-rollback/` and
hashed `.task-artifacts/phase3/rollback.json` (100 existing files, including prior working-tree edits).
Restore selected files only after reviewing later edits. No stage/commit/reset/push performed.
C2C and Token Saver commands unavailable; no ChatGPT review claimed. Bounded terminal output and full
local verification logs used under `.task-artifacts/phase3/` instead.


## Verification

Final Phase 2 results: **MOCK_VERIFIED: 159/159 full API/Agent tests**, zero failures/skips.
The mock subset contains 46 tests: 21 backend/configuration, 10 Agent/configuration and 15 HTTP
integration tests. Two additional exact-component unit cases are included in the full suite.
Phase 2 retained all 142 tests from its prior baseline. API/Agent builds and both workspace typechecks passed.
Compiled entrypoint smoke checks passed for mock scan and local-token issuance while database,
Prisma, live LLM and email imports were forbidden; postgres/production startup failed closed.
No DATABASE_URL or credentials were emitted. Git whitespace checks found no errors.

`npm run test:mock` runs the new backend and Agent scenarios. `npm test` runs all API/Agent tests.
The existing suite supports in-process HTTP when loopback is restricted:

```powershell
$env:TEST_IN_PROCESS = '1'
npm test
npm run build --workspace @cafe-project/agent --workspace @cafe-project/api
npm run check-types --workspace @cafe-project/agent --workspace @cafe-project/api
```

The first unrestricted-HTTP run hit sandbox loopback EACCES. That is not a test pass.
The in-process rerun is the relevant full regression evidence. No test is skipped for PostgreSQL;
tests named POSTGRES_NOT_VERIFIED assert fail-closed configuration only, never database acceptance.
`apps/api/tests/workflow-contract.cjs` supplies reusable workflow vectors; a future PostgreSQL
fixture harness must supply isolated fixture reset/inspection/restart implementations and add real
multi-connection locking, crash/restart, privileges and schema/catalog checks.

HTTP tests use real Express JSON parsing, shared JWT/auth/role middleware, Zod, business services,
operation stores and Agent dispatch. They run without sockets; this is not deployed HTTP, external
provider or database acceptance. No existing test was removed or skipped.

### Phase 3 final verification (2026-11-07)

- Baseline rerun before edits: **159 tests, 159 pass, 0 fail, 0 skipped, 0 cancelled**.
- Final `DATA_PROVIDER=mock TEST_IN_PROCESS=1 npm test`: **182 tests, 182 pass, 0 fail, 0 skipped, 0 cancelled**.
- **23 newly added tests**: 13 HTTP/backend/Agent application integrations, 5 frontend client/form integrations, 5 real browser scenarios. Existing 159 tests retained.
- New test files: `apps/api/tests/mock-phase3.test.cjs`, `apps/web/tests/mock-client.test.cjs`, `apps/web/tests/mock-ui.test.cjs`; shared isolated helper: `apps/api/tests/phase3-harness.cjs`.
- Browser scenarios run on installed headless Edge (bundled Chromium absent). Real React/Vite UI and authenticated client requests use real Express middleware/services/Agent via in-process HTTP interception. No deployed backend, external providers or database acceptance claimed.
- Scenarios cover authoring/publish/archive and immutable order snapshots; multi-item orders; purchasing/receipts; supplier settlement/credit/rounding; stock-count self-approval reason; payment/refund/reconciliation; Agent exact-hash approval and one-PR execution; memory ownership; rollback/replay/unknown response recovery, reload recovery, current-role replay denial and concurrent version winners.
- Agent/API/Web builds passed. Agent/API `check-types` passed; Web TypeScript check passed as part of `build`. No PostgreSQL connection, migration, external payment or LLM call performed.
- Browser requests to legacy APIs or external origins are rejected by tests; no such requests occurred. Mock HTML uses system fonts. Screenshot: `.task-artifacts/phase3/orders-ui.png`.
- `git diff --check` passed. Phase 3 file list: `.task-artifacts/phase3/files-changed.json`; review diffs and complete logs alongside it. Build reports stale Browserslist data and bundle-size advisory; no build errors.
- `npm test` now includes frontend tests. Browser runtime required: Playwright Chromium or installed Edge; absence fails, never skips. `test:mock` includes all new integration tests.

## Files changed by this task

- `package.json`: full and mock test scripts.
- `apps/agent/package.json`: isolated workflows export.
- `apps/api/src/workflows/contracts.ts`: repository/domain contracts.
- `apps/api/src/workflows/mock-repository.ts`: fixtures, transactions, fault injection and snapshots.
- `apps/api/src/workflows/business-service.ts`: shared service workflows.
- `apps/api/src/workflows/provider.ts`: provider gate and target manifest.
- `apps/api/src/workflows/index.ts`: composition entry.
- `apps/agent/src/workflows/agent-workflow.ts`: isolated Agent, mock storage/LLM and memory.
- `apps/api/tests/workflow-contract.cjs`: reusable adapter vectors.
- `apps/api/tests/mock-workflows.test.cjs`: mock backend integration/fault/replay tests.
- `apps/agent/tests/mock-agent-workflow.test.cjs`: Agent permission/approval/budget/atomicity tests.
- `docs/MOCK_FIRST_BACKEND.md`: coverage, usage, results and limitations.
- `docs/mock-first-task-state.json`: compact continuation checkpoint.

Phase 2 additionally changes `package-lock.json`, `apps/api/package.json`, shared auth middleware/service,
Inventory Core and its tests. New files are `apps/api/src/modules/auth/auth.tokens.ts`,
`apps/api/src/workflows/http.ts`, `apps/api/src/workflows/server.ts` and `apps/api/tests/mock-http.test.cjs`.

Phase 3 adds menu authoring/publishing/archival, connected application workflows and supplier-payment bookkeeping.
Full D01–D11 acceptance still requires resolving/reviewing U1–U6, approved persistent physical owners,
private-variant/published-child ownership and persistent supplier-payment/credit mapping. Real provider dispatch/signature verification, process durability,
PostgreSQL schema/adapter/locking/grants and Week 04/05 acceptance remain unverified/blocked.

Phase 3 source changes additionally extend existing workflow contracts, mock repository, shared business service,
HTTP routes and Agent inbox. New frontend code: `apps/web/src/api/mock-client.ts` and `apps/web/src/mock/`
(config, shared forms, workspace, scoped styles). Eleven existing admin pages gain explicit mock wrappers;
`App.tsx`, `AuthContext.tsx`, `AppRoutes.tsx` and `vite.config.ts` isolate mock auth/navigation/transport.
Root test scripts include frontend coverage; `.gitignore` excludes local rollback/log/screenshot artifacts.

## Phase 4 acceptance evidence — 2026-11-07

Phase 3 coverage matrix, changed-file list, review diffs and final log were inspected in
`.task-artifacts/phase3/`. Source contracts, service transaction/prepare behavior, Agent planning/storage,
HTTP bootstrap, frontend forms/auth/routes/client and browser harness were checked against those claims.
Fresh baseline: **182/182 pass**, zero failures/skips/cancellations. Phase 4 changes tests and this document
only; application source, Prisma/SQL, existing working-tree changes and provider gates are preserved.

### Executed scenarios and evidence level

`apps/web/tests/mock-ui.test.cjs` now starts a real loopback Node HTTP listener for the existing Express
app and configures Vite's `/api/mock` proxy to it. Normal browser requests continue over real HTTP;
they are no longer fulfilled by the in-process request helper. Real React forms, signed JWT middleware,
BusinessWorkflows, MockRepository and injected AgentWorkflow/MockLLMProvider execute together.
Browser assertions also read authenticated HTTP views. Backend and Agent remain co-located in the
test process; this does not validate the separate legacy API/Agent servers, workers or remote transport.
Only the lost-response scenario substitutes a 503 after `route.fetch()` has completed the real request.
Fault injection and snapshot inspection are test controls, not alternative application entrypoints.

| Scenario | Verified execution/assertions | Evidence boundary |
|---|---|---|
| Recipe publication → order → FEFO → prepare | Product form drafts/publishes; Orders creates two items; allocations initially RESERVED against `early`; preparation leaves CONSUMED allocations, no RESERVED allocation and COGS 3.6 | Browser + proxy + authenticated HTTP; prepare legitimately retains RELEASED reservation history while reallocating |
| Multi-item purchase → GoodsReceipt → Inventory | Purchase form orders milk 1000 and beans 36; receipt drafts/confirms both lines; HTTP inventory shows milk lot 1000 | Browser writes and HTTP reads; fractional-pack splits/draft revisions additionally covered by existing HTTP/service tests |
| StockCount → approval → variance | Count actual 80 against physical 82; submit; own approval without reason rejected; ADMIN reason succeeds; stored signed variance -2 | Browser lifecycle; stale reservations/version guards and STAFF rejection in HTTP/service tests |
| Recommendation → reviewed proposal → ADMIN approval → one PR | Agent inspection runs real `inventory.recommend` tool and passing evaluation without creating PR; separate purchase proposal inspected; approval disabled until exact-hash review; execute creates one PR | Browser uses mock planner. Recommendation is read-only; explicit proposal follows, not automatic conversion of recommendation output |
| Payment/refund/reconciliation | Completed latte order; attempt; mock settlement; refund request and SUCCEEDED resolution; UTC account/date reconciliation MATCHED | Browser; failed/unknown attempts, callback identity and refund races in HTTP/service tests; no financial provider |
| Supplier payment/credit | Pay 23.60; return unused beans 36; credit 3.60; supplier refund bookkeeping reduces credit to 0 | Browser. Same-supplier credit transfer, paired-entry rollback/replay, cross-supplier denial and rounding tested by `mock-phase3.test.cjs`, not browser transfer coverage |
| Memory Learning | Remember/retrieve/learn/consolidate/forget against Agent HTTP state; learned flag and final removal asserted | Browser forms plus HTTP assertions; owner isolation, revision and rollback covered by existing Agent/HTTP tests; no learned-model claim |
| Permission denial | Invalid-token login and STAFF payment-page denial | Browser. Direct API denial, live role downgrade/replay, approval expiry/revoke and source guards covered by HTTP tests |
| Idempotency/concurrency/rollback | Before-commit fault leaves complete repository snapshot unchanged; UI frozen retry succeeds; four concurrent browser fetches sharing one key return identical responses and one additional order | Real browser HTTP; distinct-key oversell/version contenders and Agent multi-store faults remain HTTP/service evidence |
| Reload recovery | Commit response replaced with 503; inputs frozen; reload restores same key/body; retry returns existing receipt, one order | Browser tab reload against same live mock server only |
| Actual process restart | Stop first Node child, start second PID without snapshot restore; orders and Agent memory empty; old order key can execute again | `apps/api/tests/mock-process.test.cjs`, real loopback HTTP and two processes. Proves loss, not persistence; deterministic reused ID is not durable identity evidence |

Final `DATA_PROVIDER=mock TEST_IN_PROCESS=1 npm test`: **184/184 pass**, zero failures, skipped,
cancelled or todo tests. Two new Phase 4 tests: browser fault/concurrent replay and real process-loss
boundary; five existing browser scenarios strengthened. Six browser scenarios execute on installed
headless Edge when bundled Chromium is absent. `TEST_IN_PROCESS=1` still controls older API tests;
the six browser scenarios and new process test use actual HTTP sockets regardless of that flag.
Full logs: `.task-artifacts/phase4/{baseline-tests,full-tests,socket-browser,process-boundary}.log`.
Agent/API/Web builds passed; Web build includes TypeScript checking. Build output retains bundle-size
and stale Browserslist advisories. No PostgreSQL, migrations, live payment, external LLM or email used.

### Frontend coverage inventory

All eleven Phase 3 admin wrappers remain present. Exercised routes: `/login`, `/admin/products/create`,
`/admin/orders`, `/admin/purchase-requests`, `/admin/stock-counts`, `/admin/payments`, `/admin/agent-logs`
and the post-sign-in inventory landing. Wrapper presence for Dashboard, Products list, Inventory
detail/transactions, Order detail and Purchase detail is source verification, not independent browser
acceptance for each route. Shared workspace behavior cannot establish every wrapper/deep-link path.
No coverage claimed for customer checkout, legacy-only settings/users/categories, real OAuth,
production mode, responsive/accessibility acceptance or every loading/conflict presentation.
External origins/legacy `/api` calls and browser runtime errors fail browser scenarios.

### Repository adapter inventory and readiness

Readiness means **contract executable in mock; physical PostgreSQL implementation not ready**.
Inventory below covers every workflow repository interface and every existing repository module,
including legacy objects that are not typed adapter interfaces. No adapter is certified for cutover.
Workflow contracts live in `apps/api/src/workflows/contracts.ts`; Agent ports/repositories live in
`apps/agent/src/workflows/agent-workflow.ts`.

| Interface | Current operations / required PostgreSQL boundary | Blocking dependencies |
|---|---|---|
| RecipeRepository | `candidates/menu/saveMenu/saveRecipes`; versioned publication, immutable historical snapshots, private variants and exact component provenance | U2; U1 mutation receipts; U6 |
| InventoryRepository | `ingredients/lots/saveLot/event`; dimensional quantities, FEFO, reservations and one protected stock writer; physical ledger ownership | U2/U5 attribution; U1; U6 locking/grants |
| OrderRepository | `order/ordersForBatch/saveOrder`; atomic item snapshots, allocation terminals, losses/remakes and component×lot costs | U2/U5; U1; U6 |
| PurchaseRepository | `quote/purchase/savePurchase/receipt/saveReceipt`; frozen packs, multi-line revisions/corrections, payable/credit and supplier settlement history | U4/U5; U1; U6 |
| CountRepository | `count/saveCount`; frozen lot/version/reservation baseline, approval actor/reason, signed variance and immutable result | U1/U6; U2/U5 where stock attribution/valuation applies; count approval ownership must be explicit |
| PaymentRepository | `accountPayments/payments/payment/savePayment/callback/saveReconciliation`; attempts, provider event identities, refund dispatch/lookup and reconciliation | U5; U1; U6 |
| OperationHistoryRepository | `operation/saveOperation`; scoped key/hash, canonical/result versions, exact success/rejection response, immutable unbounded retention | U1 primary blocker; U6 uniqueness/recovery |
| BusinessTransaction | Seven repositories plus list views/events/quotes, `principal/ingredient/saveIngredient/nextId`, sync/async savepoints, `onCommit/onFinish` | U1–U6; current synchronous row access and hooks require explicit SQL transaction design |
| WorkflowRepository | `transaction/read`; coherent detached read views and effects+receipt commit in one root transaction | U1–U6; no real adapter exists; PostgresPrismaBoundary throws |
| AgentExecutionRepository | `execution`; persisted execution, revision/source guards, actual tool calls/evaluations and replay | U3/U6; U1 only for linked backend command history |
| AgentRepository | `atomic` exposes mutable whole AgentState with optional publish/finish enlistment | U3/U6; U1 for shared backend effects; requires transaction-scoped implementation, not whole-state SQL overwrite |
| AgentApprovalRepository | `approve/revoke`, implemented by AgentWorkflow; exact hash/revision, current ADMIN, expiry/consumption | U3/U6 and atomic backend command U1 |
| MemoryLearning | `remember/retrieve/learn/consolidate/forget`; owner scope, retained command response versus erased active memory | U3 retention/physical owner; U6; no extra memory table silently introduced |
| BusinessPort / LLMProvider | BusinessPort: authorization, source versions, atomic enlistment, inventory/recommendation and createPurchase; LLMProvider: `plan` | Ports, not SQL repositories. U1/U3/U4/U6 for purchase execution; real provider usage/unknown accounting unresolved |

Existing API repository objects under `apps/api/src/modules/` remain separate from WorkflowRepository:

| Existing module(s) | Actual surface | Classification |
|---|---|---|
| `auth/auth.repository.ts` | User lookup/create, Google profile, last login, profile/password/reset-token updates | Legacy Prisma implementation; not mock adapter evidence; current-principal integration and U6 parity required |
| `category/category.repository.ts`, `product/product.repository.ts` | CRUD, category/product checks, expiry/delete blockers | Legacy catalog; U2 publication/unit/provenance and U6 mapping review before reuse |
| `inventory/inventory.repository.ts` | Product inventory creation/list/detail/ledger, import/adjust/threshold | Legacy writer; U1/U2/U5/U6, not replacement for ingredient/lot sole-writer contract |
| `order/order.repository.ts` | Lists, user/detail, create/status, post-commit Agent scan | Legacy writer; U1/U2/U5/U6, not complete D01/D04/D05/D08 adapter |
| `purchase/purchase.repository.ts` | Lists/detail, supplier/inventory checks, create/status/receive/delete | Legacy writer; U1/U4/U5/U6, multi-line mock receipt contract not inferred from legacy receive |
| `payment/payment.repository.ts` | Find by order/ID and status update | Legacy payment surface; U1/U5/U6, lacks full mock attempt/refund/reconciliation repository boundary |
| `supplier/supplier.repository.ts` | Supplier and supplier-product CRUD/lookups, purchase/Agent-log counts | Legacy catalog; U4/U6, quote conversion/lineage and caller preservation required |
| `simulate-sale/simulate-sale.repository.ts` | Inventory lookup, sale/apply/batch restore, pending restore | Legacy alternate stock writer; U1/U2/U5/U6; must join protected writer before cutover |
| `system-setting/system-setting.repository.ts` | List/key lookup/upsert | Legacy settings; U6 parity/grants; U1 if brought into retained-command contract |
| `apps/agent/src/repositories/agent.repository.ts` | Inventory/sales/settings reads, recommendation/PR creation, Agent-log CRUD | Legacy Agent repository; U1/U3/U4/U6; direct business writes must route through BusinessPort; Agent logs cannot own manual business receipts |

Direct Prisma callers outside repository modules (for example dashboard/user/email and scheduled
workers) also require U6 writer/caller tracing. Listing repository files is not sole-writer proof.

### U1–U6 dependency matrix and implementation gates

| Blocker | Required decision/evidence before implementation | Affected obligations |
|---|---|---|
| U1 UNSOLVED | Legitimate existing-table physical owner for arbitrary immutable command key/hash/exact results, including rejection without created target; typed roots/FKs, retention, uniqueness and recovery | Every mutating workflow/transaction; D09 and cross-cutting D01–D11 replay/atomicity. Ingredient edit K1→K2→replay K1 is primary witness; no generic Agent journal |
| U2 PARTIAL | Field-complete private-variant/published-child responsibility, immutable recipe/item/component/topping dictionary, exact fractions and units | Recipe/Inventory/Order; D01/D02/D03/D05/D08 |
| U3 UNSOLVED | Physical typed proposals, all revisions/decisions/source guards, budget reservation/unknown usage, Agent receipts and owner-scoped memory retention | Agent repositories/approval/memory and atomic BusinessPort execution; D10 |
| U4 UNSOLVED | Multi-item draft lines/edits, arbitrary fractional-pack splits, immutable confirmations, corrections/returns/payable/reopening/consumed attribution | PurchaseRepository and linked Inventory/Order/finance; D06 with D03/D08 effects |
| U5 PARTIAL | Component×lot valuation/cents/zero-vs-unknown, full payment/refund/dispatch identity and unknown-outcome lookup; supplier-credit/settlement mapping | Order/Inventory/Purchase/Payment; D03/D06/D08/D11 |
| U6 UNPROVEN | Approved manifest plus source/generated-client/catalog/grant parity; every writer traced; real lock/race/fault/restart evidence | All repositories and D01–D11; no PostgreSQL integrity gate closed |

Binding manifest remains **exactly 27 target table identities and 16 ENUM names**, unchanged in
`provider.ts`. Agent-owned target tables remain only `AgentExecution`, `AgentToolCall`,
`AgentEvaluation`; no manual business journal or extra hidden table is allocated there. Existing
transitional Prisma declarations and unknown deployed catalog are not proof of this target's deployment.
See `KLTN_PLAN/ARCHITECTURE_FINAL/OPEN_BLOCKERS.md` and `IMPLEMENTATION_SEQUENCE.md` for binding gates.

Adapter handoff requires, in order: resolve U1 physical ownership; freeze complete U2–U5 field and
constraint contracts; approve U6 manifest/writer/grant plan; then separately authorize isolated real
PostgreSQL evidence. This task authorizes no connection or migration. Keep postgres fail-closed.
At contract freeze, explicitly select async row-access contracts or a proven transaction-local load/
flush design: current synchronous repository getters/setters cannot directly await Prisma queries.
Define SQL savepoints retaining business-rejection receipts, deterministic lock ordering/versions,
ID allocation, exact decimal serialization, and confirmed rollback versus UNKNOWN commit lookup.
Replace mock publication callbacks with one transaction-scoped Backend/Agent unit of work while
preserving ownership; in-memory FIFO/callback enlistment is not a SQL atomicity mechanism.
Run existing workflow contract vectors with a real-adapter fixture only after approval, supplementing
the mock-specific `snapshot/injectFault` controls with actual connection/process faults, two-session
races, constraints, current-authority replay and durable exact-response recovery (T01–T36).

### Persistence acceptance and remaining functional gaps

- Browser reload recovery retains pending key/payload/versions in per-actor sessionStorage; JWT/user
  caches also exist in localStorage. Neither stores business state or durable operation receipts.
- Default server restart without explicit local persistence or snapshot restore loses mock business/Agent state, operation receipts,
  callback identities and balances. Process test directly asserts orders/memory loss and key reuse;
  loss of remaining collections follows in-memory construction, not separate restart coverage for each.
- Pending browser commands have no server-generation marker. A surviving pending command after server
  restart can be applied anew, rejected by stale guards or collide with reused fixture IDs. Same-server
  reload evidence must never be advertised as crash-safe exactly-once persistence. No browser restart/
  server restart combination is claimed tested by the process-only scenario.
- Phase 5 adds automatic owner-scoped verified memory evidence to `plan()` (details below).
  Recommendation execution remains a read tool; conversion into an approved purchase still needs
  an explicit proposal. Embedding/semantic ranking and recommendation-to-proposal lineage remain gaps.
- Mock supplier payments/refunds/credits are bookkeeping; payment events are authenticated injections,
  not signed webhooks. External dispatch, signatures, real budgets/usage and provider recovery unverified.
- Cross-process concurrency, persistent locks/constraints/immutability, multi-user durability, generated
  client/catalog/grant parity and all legacy caller migration remain unverified. All D01–D11 retain
  **mock scenario evidence only; full acceptance NOT PASS**, with database acceptance BLOCKED.

Phase 4 checkpoint before test edits: `.task-artifacts/phase4/agent-rollback/` plus `rollback.json`
hashes. No major application source edits, staging, commits or pushes. C2C, Token Saver and Agent
Rollback CLI unavailable in PATH; no ChatGPT review claimed. Bounded terminal summaries and local logs
used; checkpoint is a selective file backup, not a claim that unavailable rollback tooling ran.

## Phase 5 memory learning and development recovery — 2026-11-07

### Planner integration and learning contract

- `AgentWorkflow.plan()` checks current business/Agent permissions, retrieves same-owner active memory,
  and sends a separate `PlanningContext` to the existing provider. Existing one-argument providers remain
  compatible. Mock provider can choose a verified read/recommend hint; explicit purchase input remains explicit.
- Retrieval uses case-insensitive Unicode word overlap: query coverage at least 0.5, confidence at least
  0.8, plus shared terms between the memory, query and verified tool or ingredient subjects. Ranking uses
  query coverage, verified subject match, recorded authorization and most recent verified outcome, with stable
  tie breaking. Each hint cites only evidence for its selected tool. Expired, invalid-expiry, revoked,
  forgotten and foreign-owner memory is excluded.
- Provider context contains only typed tool hints and memory/execution/evaluation IDs, relevance and confidence.
  Raw memory text never enters provider context. It is untrusted data, never permission, approval, tool input,
  budget or an instruction. Existing allowlist, cost, business authority, approval/hash and stale-version checks
  remain authoritative. No LLM, payment or external provider is called by this mock path.
- Context is capped at four evidence records and 2,048 UTF-8 bytes, conservatively bounding tokens independently
  of tokenizer. Each record caps execution IDs at four and evaluation IDs at eight. Provider receives a detached
  copy; memory is checked again before publishing a plan so concurrent forgetting invalidates stale evidence.
- Executions retain evidence references, original planner decision, plan revisions and outcome evaluation IDs.
  The verifier checks current tool permission, plan input and result invariants for each dispatched call. It records
  the permission, purchase approval ID, verification time and matching operation receipt identity where applicable.
  A purchase response must match the receipt for the same actor, versions and request payload. A successful receipt
  must also refer to a purchase present in the mock business store. Verification and learning publish with the
  same transaction as the business outcome. A rollback publishes neither. A retained business rejection is
  recorded as failure. Missing or mismatched evidence stays UNKNOWN until authoritative reconciliation.
- Legacy `learned=true` remains a request to learn, preserving existing HTTP/UI contracts. It alone is **not**
  verified learning: a request without independent verified outcomes has confidence 0 and empty provenance,
  and cannot affect planning. `learn()` binds matching SUCCEEDED executions and their VERIFIED tool calls/
  passing RESULT_VERIFIED evaluations; confidence is fixed at 0.9, never increased by replay or duplicates.
  Requested memories also bind automatically when an independent matching execution succeeds later.
- Only executions planned without memory evidence qualify as independent learning sources. PLANNED, FAILED,
  UNKNOWN and memory-assisted outcomes cannot reinforce their own hints. Retrieval rechecks recorded calls,
  input, result and linked passing evaluations. Earlier mock purchase histories without receipt proof remain
  readable for audit and cannot supply new planning hints. No database migration is required.
- Consolidation normalizes duplicate text, retains distinct execution/evaluation provenance and original memory
  IDs, and never extends expiry or adds confidence. Forgetting either merged ID suppresses the whole merged
  memory, clears text/provenance, and prevents future retrieval/planning. Historic execution references and
  immutable operation responses remain audit history; forgetting does not rewrite receipts or cancel old plans.
- Verification means existing mock business tool-call verification, not independent proof of real-world efficacy.
  No new tables, ENUMs, schema, migrations or production Agent storage are introduced; target remains 27/16.

### Optional local development snapshot adapter

Default is unchanged: absent flag or `MOCK_STATE_PERSISTENCE=false` constructs fresh in-memory repositories.
Only isolated mock HTTP composition supports this adapter; legacy services/provider factories stay unchanged.
Enable with all of these explicit settings (parent directory must already exist):

```powershell
$env:DATA_PROVIDER='mock'
$env:NODE_ENV='development'
$env:MOCK_STATE_PERSISTENCE='true'
$env:MOCK_STATE_PATH='D:\KLTN\source\cafe-project\.task-artifacts\local-mock-state.json'
npm run dev:mock -w @cafe-project/api
```

Existing JWT_SECRET requirement still applies. Production, unspecified/non-development/test environment,
non-mock provider, invalid flags, relative/missing paths and custom repository overrides are rejected.
Do not share one snapshot path between processes. This is a **single-process local development convenience**,
not PostgreSQL durability, transactional recovery, multi-process concurrency or crash-safe exactly-once execution.

The adapter captures every existing business and Agent snapshot collection: business data, operation/callback
receipts, Agent command receipts/executions/revisions, approvals including revocation/consumption, budgets,
tool calls, evaluations, permissions and memory including forgetting tombstones/provenance. V8 serialization
preserves Dates; envelope checks format/version, state-contract version, Node major version, checksum and
required state shape. Incompatible/corrupt files fail startup without resetting or overwriting them. Restore
only a known compatible backup or deliberately choose a new path; no automatic lossy migration is attempted.

Writes use an exclusive temporary sibling, flush/close, then atomic rename. Business commits capture prepared
Agent state in the same file before either publishes; standalone Agent writes use the same envelope. Failed
write/rename leaves prior file and unpublished memory state intact; normal post-commit response loss replays
retained receipts. Temporary files are cleaned on caught failures; leftovers from a killed process are ignored.
Checksum detects accidental corruption, not malicious tampering. Directory fsync, disk/power-loss guarantees,
cross-process locking, database constraints and durable retention are outside this adapter's contract.

### Verification and artifacts

- `DATA_PROVIDER=mock TEST_IN_PROCESS=1 npm test -- --test-concurrency=1`: **204/204 pass**, zero
  failures/skips/cancellations/todo. Includes relevance and recency ordering, receipt-less purchase
  rejection as UNKNOWN, and receipt reconciliation without redispatch or duplicate learning.
- New tests: `apps/agent/tests/memory-learning.test.cjs` and `apps/api/tests/mock-recovery.test.cjs`;
  child-process fixture `apps/api/tests/mock-recovery-process.cjs` uses existing offline import guards.
- Memory coverage: appropriate hint influence, owner/relevance/confidence/lifecycle exclusion, hostile text,
  unchanged approval permissions, verified provenance, failed/unknown/self-feedback exclusion, consolidation,
  forgetting aliases/races, bounded detached context and current permission revocation.
- Recovery coverage: explicit restart restores Dates/business/Agent state, receipts and memory; before/after
  commit faults; atomic replacement failure; corruption/version/contract/runtime rejection; production/config
  gates; disabled default. Real loopback HTTP across three fresh Node processes proves duplicate business and
  Agent command replay, approval survival/consumption and one purchase/order after repeated execution.
- Existing Phase 4 process-loss test continues to verify default in-memory behavior.
- Rollback checkpoint: `.task-artifacts/phase5/agent-rollback/`, hashes in `rollback.json`; captured pre-existing
  uncommitted files before edits. C2C/Token Saver/Agent Rollback CLI unavailable; no external review claimed.
  Logs and scoped review diffs remain local under `.task-artifacts/phase5/`.

## Phase 6 Agent replenishment

The existing mock Agent planner, executor, verifier and Memory Learning support a six-step
replenishment workflow. Each step has a stable ID and explicit predecessors. The planner
validates the fixed graph, typed inputs, tool allowlist and minimum budget before recording
the execution. Backend permissions are checked before each tool dispatch.

| Step | Required output | Budget units |
| --- | --- | ---: |
| `inventory.read` | Inventory snapshot and versions | 1 |
| `inventory.analyze` | Low-stock rows from Backend stock policy and eligible batches | 1 |
| `purchase.recommend` | Whole-pack quantities from active supplier quotes | 1 |
| `purchase.prepare` | Purchase proposal and Backend source versions | 1 |
| `purchase.requestApproval` | Pending ADMIN gate bound to the proposal hash | 1 |
| `purchase.create` | Backend purchase result verified against its command receipt | 2 |

1. POST `/api/mock/agent/plan` with
   `{"input":{"budget":7,"replenishment":{"supplierId":"full-supplier","unitCosts":{"milk":"0.25"}}}}`.
   The ingredient keys scope the recommendation and the operator supplies the unit costs.
   Backend quotes supply pack conversion. The workflow fails before approval if there are no
   targeted low-stock rows or a required quote is unavailable.
2. POST `/api/mock/agent/execute` with `{"input":{"executionId":"…"}}`. The workflow returns
   `AWAITING_APPROVAL`. An ADMIN can inspect the proposal, source versions and audit via
   GET `/api/mock/agent/executions/:id`.
3. An ADMIN POSTs `/api/mock/agent/approve` with `executionId`, the prepared `expectedHash`
   and `expiresAt` inside `input`. The original actor resumes via `/execute` with a fresh
   idempotency key. Reusing a key returns that request's recorded response, including an
   earlier waiting or UNKNOWN response.
4. The executor checks current approval authority, expiry and revocation. It rechecks
   source versions and time-sensitive stock before consuming approval. A stale proposal
   requires a new run and review. The existing Backend purchase service creates the open
   request and supplies the receipt. This workflow does not receive stock or pay a supplier.

The executor may retry a safe read once, charging each dispatch. It stops before asking for
approval if the remaining budget cannot cover the purchase. Failure skips dependent steps
and records why. The owner can POST `/api/mock/agent/cancel` with `executionId` before
purchase dispatch. Cancellation invalidates pending approvals. The existing mock transaction rolls
back its enlisted state on a proven commit failure, and a proven Backend write rollback is
recorded as a terminal failure. The Backend exposes no compensating cancellation for a
committed purchase through this workflow.

An ambiguous mutation leaves the budget reserved in `UNKNOWN`. Resume with a fresh request
key to look up the original receipt. Reconciliation uses the same step identity and never
reissues the purchase, even when no receipt is available. An expired approval does not
prevent verification of a prior dispatch. The audit separates authorization, dispatch,
reconciliation, evaluation and skipped steps.

Memory Learning uses same-owner evidence from fully verified runs. Pending, denied,
rejected, cancelled, rolled-back and unresolved runs provide no successful provenance.
Future planning receives bounded typed evidence. Memory and provider output have no
authority to grant permissions, alter reviewed inputs or bypass the ADMIN gate.

Phase 6 is exercised through the mock API and Agent tests. The scope is one workflow
execution ID per idempotent purchase. Separately planned runs are independent. Durable
exactly-once execution and persistent D01–D11 acceptance remain unverified. The target
manifest specifies 27 business tables and 16 ENUMs.

## Phase 7 acceptance

- Local source and executable review completed. C2C readiness failed with `EPERM` while opening local connection state.
- The full mock suite passed 217/217 with zero failures or skips. Existing browser forms verified menu, recipe, order, inventory, purchasing, receiving, counts, payments, refunds and reconciliation.
- The six-step replenishment flow passed through browser-origin HTTP. The existing purchase proposal form uses the legacy one-step flow. Browser checks also verified owner-scoped learning and a changed subsequent inspection plan.
- Phase 6 reconciles UNKNOWN from the original receipt after approval expiry. The legacy one-step path can leave a committed purchase UNKNOWN because it requires a live approval before attempting receipt lookup.
- Cancellation applies before purchase dispatch. Correcting a committed purchase requires a separately authorized business workflow.
- PostgreSQL persistence remains a separate blocked gate. The target remains 27 business tables and 16 ENUMs.

## Phase 8D D10 mock acceptance

- Legacy UNKNOWN recovery checks the authoritative receipt for the original command before applying live approval checks for new dispatch. A matching receipt restores the committed result. Missing or mismatched proof leaves the outcome UNKNOWN, and retries never dispatch that purchase again. Authorized same-key replay returns the recorded response.
- The mock Agent admin page supports the full six-step replenishment flow through the existing authenticated routes. STAFF enters supplier and unit costs, reviews stock and recommendations, and requests ADMIN approval bound to the prepared proposal hash. Execution, cancellation and receipt recovery use the existing Backend BusinessPort.
- Planning records retrieved hints, presentation and attribution separately. The built-in planner records the affected step and alternative decision for USED. Opaque provider decisions are UNKNOWN, and the fixed replenishment plan never presents its retrieved hints. Unused or unverifiable hints cannot reinforce their provenance. Independently verified outcomes can still support owner-scoped learning.
- The full suite passed 229/229, including 9/9 real Edge cases, with zero failures, skips or cancellations. The integrated browser case verifies expiry, exact-hash approval, concurrent replay, one PR, its receipt and owner-scoped memory feedback. Separate cases verify cancellation, permission denial and UNKNOWN recovery after reload. Five forced sequential builds and six direct TypeScript checks passed.
- D10 is MOCK_VERIFIED within the mock boundary. PostgreSQL persistence remains BLOCKED. The mock manifest retains 27 business table identities and 16 ENUMs.
