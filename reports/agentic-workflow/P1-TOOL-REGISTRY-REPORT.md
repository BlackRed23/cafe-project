# P1 — Tool Registry

Date: 2026-11-16. Scope: contracts, backend read bindings, base-unit cost calculation. Disposition: **P1 bounded implementation; runtime integration BLOCKED; not production verified**.

## Audit and classification

| Area | Status | Evidence / finding |
| --- | --- | --- |
| Existing Agent registry, BusinessPort | REUSED | `apps/agent/src/workflows/agent-workflow.ts`: `TOOL_REGISTRY`, actor-based `authorize`; P1 adapter reuses `Pick<BusinessPort, 'authorize'>`. Existing registry remains unchanged. |
| Agent workflow, replenishment, approvals, receipts | MOCK_ONLY | Existing registry names are bound to mock Plan, proposal hashes, source versions, verification DTOs and atomic mock persistence. `createAgentRuntime` rejects PostgreSQL and production. Mock tests are not durable approval evidence. |
| Backend workflow BusinessWorkflows | MOCK_ONLY | `apps/api/src/workflows/business-service.ts` and `provider.ts`; PostgreSQL boundary explicitly throws `POSTGRES_NOT_VERIFIED`. Existing inventory/recommendation/purchase semantics reusable only with matching contracts. |
| Ingredient API | REUSED | `ingredientService.getById`: aggregate quantity/reserved/available, rowVersion and batch DTOs. Routes allow ADMIN/STAFF. Availability is aggregate stock, not guaranteed unexpired/allocatable stock. |
| Recipe API | REUSED | `recipeService.getActiveByProduct`: active recipe, yield and base quantities. Routes allow ADMIN/STAFF. Tool returns recipe-batch requirements including optional flags, not a serving/topping/omission calculation. |
| SupplierIngredient API | REUSED | `supplierService.listSuppliersByProduct` has Ingredient-first lookup plus legacy Product fallback. P1 checks active Ingredient and mapping identity/unit, rejects fallback output. Supplier routes ADMIN only. |
| PurchaseRequest API | BLOCKED | Existing create/approve/receive services exist; create lacks caller-key durable replay/conflict contract and hash-bound approval proof. Schema PurchaseRequestStatus has PENDING, not DRAFT. No schema change authorized. |
| Legacy Agent recommendation/repository | IMPLEMENTED (existing only) | `services/agent.service.ts`, `recommendation.service.ts`, `repositories/agent.repository.ts`: legacy DB-oriented recommendations/purchase paths exist. These do not prove a backend-only standardized tool path; P1 does not invoke or refactor them. |
| Database | REUSED (inspection only) | Ingredient, IngredientBatch, Recipe/RecipeIngredient, SupplierIngredient, PurchaseRequest/items and Agent execution tables exist. Table presence/unique fields alone do not prove workflow adapter or durable command receipts. |
| Four legacy models | REUSED / preserved | Inventory, InventoryBatch, SupplierProduct, AgentLog remain unchanged. Pre-existing untracked migration/evidence/reports preserved. No schema, migration, seed or business data writes performed by P1. |
| P1 typed catalog and five bound handlers | IMPLEMENTED | `tool-contracts.ts`, `tool-adapter.ts`, `tool-services.ts`; real service calls wired in explicit factory, verified with injected dependencies only. |
| New Planner/Executor/LangGraph / HTTP ingress | NOT_IMPLEMENTED | Outside P1. No new orchestration, execution loop, model bridge, scheduler or route. |

## Contracts

Executable strict Zod input/output schemas: `apps/api/src/workflows/tool-contracts.ts`, exported `TOOL_CONTRACTS`. IDs: 1–120 safe identifier characters; unknown input/output fields rejected. Quantities numeric finite nonnegative up to 1e12 unless specified. Base units: g/ml/piece. Cost input uses decimal strings (up to 12 integer digits, 3 decimals). Output money uses two-decimal strings.

| Tool | Class / status | Input | Output | Backend / authorization |
| --- | --- | --- | --- | --- |
| getIngredientAvailability | READ / IMPLEMENTED | ingredientId | ingredientId, baseUnit, quantity, reserved, available (signed), active, rowVersion | ingredientService.getById; inventory.read, ADMIN/STAFF |
| getIngredientBatches | READ / IMPLEMENTED | ingredientId | ingredientId, baseUnit, batches[{id, quantityRemaining, expirationDate nullable UTC ISO, receivedAt UTC ISO}] | ingredientService.getById; inventory.read, ADMIN/STAFF |
| getRecipeRequirements | READ / IMPLEMENTED | productId | recipeId, productId, version, yieldQuantity, ingredients[{ingredientId, baseUnit, quantityBase, optional}] | recipeService.getActiveByProduct; recipe.read, ADMIN/STAFF |
| getSalesHistory | READ / BLOCKED | productId, from, to; UTC half-open range <=90 days | productId, from, to, soldQuantity | Proposed sales.read; no bounded business sales contract with agreed cancellation/refund semantics. Dashboard revenue is not ingredient/product sales history. No handler. |
| findIngredientSuppliers | READ / IMPLEMENTED | ingredientId | [{supplierId, ingredientId, purchaseUnit, conversionQuantity, baseUnit, pricePerBaseUnit}] | supplierService.listSuppliersByProduct after Ingredient guard; supplier.read, ADMIN |
| calculateReorderQuantity | CALCULATION / BLOCKED | ingredientId, targetStock | ingredientId, baseUnit, quantity | Proposed inventory.read. Mock target-deficit policy differs from legacy calculateReorderPoint/sales/lead-time policy. No approved shared quantity service. No handler. |
| estimatePurchaseCost | CALCULATION / IMPLEMENTED | ingredientId, supplierId, quantityBase decimal string | ingredientId, supplierId, baseUnit, quantityBase, total | Current backend supplier price plus common estimateBasePurchaseCost; supplier.read, ADMIN. Quantity x base price, half-up to 2 decimals. |
| createDraftPurchaseRequest | WRITE / BLOCKED | supplierId, idempotencyKey, approvalId, proposalHash (64 hex), 1–100 lines[{ingredientId, quantityBase}] | requestId, proposed status DRAFT | Proposed purchase.write plus approval policy; no handler, no write adapter. Schema/state and durable receipt/approval conflicts unresolved. |

Blocked schemas are proposals for review, not executable business capabilities. In particular, draft line precision, duplicate-line rules, approver roles/separation, source versions and stale-approval handling need backend policy before enabling WRITE.

## Authorization, errors, timeout, idempotency

- Tool arguments contain business inputs only. Actor ID is separate, trusted backend invocation context, never model-generated authority. Future ingress must derive it from authenticated session/token. Factory currently has no external ingress.
- Every call resolves current account via `getCurrentUser`, including account-active checks, then enforces roles matching existing API routes. No role supplied by model, no authorization cache, no permission fallback. Unknown permissions denied.
- Adapter validates input before authorization; no business read before authorization succeeds. Output schema validation follows service result. Handlers/catalog metadata frozen.
- `TOOL_POLICY`: 5000 ms overall deadline including authorization; one attempt; no automatic retry. Timeout stops awaiting result, not an already-running backend query. Late authorization cannot start a read; underlying read cancellation remains unsupported.
- Errors exposed only as `ToolError.code`: INVALID_INPUT, FORBIDDEN, NOT_FOUND, INVALID_OUTPUT, TIMEOUT, BACKEND_FAILURE. BLOCKED reserved for catalog status/future API. Existing 401/403 -> FORBIDDEN; 404 -> NOT_FOUND; remaining failures sanitized. No SQL/provider details exposed.
- READ/CALCULATION do not mutate and need no command idempotency key; repeated calls may observe different snapshots. WRITE must eventually bind actor/scope/key/canonical payload/source versions, retain immutable response, reject key conflicts, reauthorize replay, atomically consume approval and reconcile UNKNOWN via durable receipt. None claimed implemented here.
- Tool modules never import Prisma or execute SQL. Calculation business helper reuses existing Decimal/money helpers; only backend Business Services own persistence. No model receives database connection or repository handle.

## Architecture conflicts and limits

1. **BLOCKED — direct registration into current mock workflow.** Existing `TOOL_REGISTRY` keys form a closed Plan union with fixed verification and hash/approval semantics. P1 real service DTOs are incompatible. Appending names would imply unimplemented executor/verification changes, expressly outside P1. P1 catalog supplements contracts only; it does not establish a second workflow framework. Reused BusinessPort authorization shape; retained all existing runtime behavior. P2 must explicitly approve binding/integration design before changing Plan/dispatch.
2. **BLOCKED — WRITE persistence.** Existing PENDING purchase and separate approve action cannot be relabeled DRAFT or treated as approval-bound command. Need approved state mapping/schema decision and tested durable command receipt/approval ownership. No schema changes proposed as implicit authorization.
3. **BLOCKED — sales/reorder policy.** Existing repositories and mock recommendations are not interchangeable business contracts. Decide time zone, completed/refunded quantities, base-unit conversion, stock target/lead-time strategy and pack/minimum rounding before implementing these two tools.
4. Supplier lookup currently reflects existing service mappings, including mappings whose supplier may be inactive/deleted; repository lookup does not filter supplier status. Results are informational mappings, not eligible purchase offers. No quote freshness/version/currency or transactionally consistent snapshot guarantee. Cost estimate excludes pack rounding, minimum order, taxes, delivery and currency conversion. P2 purchase eligibility must filter current supplier status and bind source versions.
5. Service DTOs expose numeric quantities/prices; P1 cannot restore precision already converted to Number. Decimal multiplication prevents additional binary multiplication error, not loss upstream. Inventory quantity bounds and output validation fail closed for unsupported DTOs.
6. No live database/integration test scope approved. Wiring/type checks plus injected service tests are evidence of implementation, not database correctness, production readiness, concurrent receipt safety or a complete agentic workflow.

## Changed files

- `apps/api/src/common/ingredient-cost.utils.ts`: pure base-unit estimate using existing Decimal and money rounding.
- `apps/api/src/workflows/tool-contracts.ts`: eight contracts, classifications, status, permissions, shared policy/errors.
- `apps/api/src/workflows/tool-adapter.ts`: five validated, authorized, deadline-bound tool handlers; BusinessPort authorization type reused.
- `apps/api/src/workflows/tool-services.ts`: explicit lazy backend service binding, DTO projection, Ingredient-only supplier guard.
- `apps/api/tests/p1-tool-registry.test.cjs`: unit/contract/validation/denial/failure tests with explicit dependency allowlist; no real database client.
- This report plus `P1-*-build.log`, `P1-tool-tests.log`, `P1-cost-test.log`, `P1-full-test.log`, `P1-full-test-final.log`: verification artifacts. Existing unrelated reports left intact.

## Verification

No business records inserted in cafe-kltn; root suite uses mocked services/repositories and local mock UI fixtures. No email/provider calls authorized or performed by P1 tests.

| Check | Result | Evidence |
| --- | --- | --- |
| `npm.cmd run build --workspace @cafe-project/agent` | PASS, exit 0 | `P1-agent-build.log` |
| `npm.cmd run build --workspace @cafe-project/api` | PASS, exit 0, final source | `P1-api-build.log`; initial supplier union-narrowing compiler error corrected before final checks |
| `node --test apps/api/tests/p1-tool-registry.test.cjs` | PASS 9/9, no skip | `P1-tool-tests.log`; injected dependencies, not real database contracts |
| `node --test apps/api/src/modules/ingredient/__tests__/ingredient-cost.unit.test.mjs` | PASS 17/17, no skip | `P1-cost-test.log`; existing affected helper coverage, new estimate covered by P1 test |
| `npm.cmd test` | PASS 245/245, fail 0, skip 0, exit 0 | `P1-full-test-final.log`, final source; root API/Agent/Web suite, including local mock browser tests. Earlier run 243/243 before two extra P1 tests: `P1-full-test.log` |
| `git diff --check`, new-file `git diff --no-index --check -- NUL <file>` | PASS | No whitespace errors; only Git LF/CRLF conversion notices. Tracked and untracked source/report diffs inspected; no stage/commit/push. |
| Live PostgreSQL adapter / durable WRITE acceptance | NOT_RUN / BLOCKED | No approved isolated database fixture scope; no production-readiness claim |

Root browser tests emitted stale Browserslist data notice; no failure. No dependency update made.

| Tool | Verified P1 cases / remaining acceptance cases |
| --- | --- |
| getIngredientAvailability | Aggregate DTO projection, strict ID/unknown authority fields, nonfinite output rejection, missing/forbidden/backend errors, fresh denial after revocation, authorization/read deadlines, no retry. Real expired/reserved stock consistency NOT_VERIFIED. |
| getIngredientBatches | Batch/date/null-expiry projection and authorization denial. FEFO allocation intentionally absent; real batch/reservation consistency NOT_VERIFIED. |
| getRecipeRequirements | Recipe/yield/base-quantity/optional projection and authorization denial. Real effective-date/version/component scenarios NOT_VERIFIED. |
| findIngredientSuppliers | Mapping projection, ADMIN policy, STAFF/CUSTOMER denial, wrong ingredient output rejection. Real inactive/deleted supplier eligibility NOT_VERIFIED. |
| estimatePurchaseCost | Backend-price binding, missing supplier, fractional Decimal multiplication and half-up boundary, malformed/negative/excess precision quantity rejection, denial before lookup. Pack/minimum/tax/currency scenarios outside current estimate contract. |
| getSalesHistory | BLOCKED status and absence of callable handler verified. Future tests: bounded UTC range, empty history, cancellations/refunds, authorization, query failure. Business behavior NOT_IMPLEMENTED. |
| calculateReorderQuantity | BLOCKED status and absence of callable handler verified. Future tests: threshold boundaries, zero demand, reservations/expiry, conversion, minimum pack/lead-time policy. Business behavior NOT_IMPLEMENTED. |
| createDraftPurchaseRequest | BLOCKED status and absence of callable handler verified. Future tests: denied actor, invalid/duplicate lines, stale/expired/revoked/wrong-hash approval, same-key replay, key conflict, concurrent requests, rollback, restart and UNKNOWN reconciliation. WRITE NOT_IMPLEMENTED. |

## P2 entry conditions

- Approve integration boundary between P1 backend catalog and existing mock registry/Plan verification. Preserve separate mock vs real capability reporting.
- Approve sales/reorder and recipe serving/component policies; add corresponding backend service contracts before exposing tools.
- Resolve DRAFT/PENDING mapping, durable receipt/idempotency ownership, approval identity/hash/expiry/revocation/replay policy, stale-source checks and UNKNOWN reconciliation before enabling WRITE.
- Approve isolated database test scope; run real backend adapter contracts, authorization revocation, source consistency, concurrent replay/conflicts, rollback/restart and approval tests without production data.
- Define query cancellation, pagination/resource limits, quote eligibility/freshness/currency and decimal precision policy for operational use.
