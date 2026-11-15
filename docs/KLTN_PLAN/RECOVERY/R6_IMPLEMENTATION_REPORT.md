# Recovery R6 — test stabilization and inventory core

2026-11-06, Asia/Saigon. Baseline HEAD 33366f714b288310580d69247e47c58aa4ea062f plus pre-existing dirty recovery files. Prior source changes and R1–R5 logs preserved. D01–D11 remain OWNER_AGREED in principle, formally approved 0; R4 full recommendations and R5 draft contracts are the design inputs. No weekly acceptance or physical PostgreSQL verification inferred.

STATUS: INDEPENDENT_CORE_IMPLEMENTED; dependent integration and acceptance BLOCKED.
TEST_STABILIZATION: In-process regression mode verified without assertion changes; socket transport remains FAIL/BLOCKED in this environment.
IMPLEMENTED_COMPONENTS: D01 recipe requirements/value snapshots; D02 exact dimensional conversion reused; D03 rational aggregation/HALF_UP/cost completeness; D04 FEFO reused; D05 pure allocation planning; D09 deterministic canonical identities/normalized quantity adapter.
UNIT_TEST_RESULTS: final policy/core 14/14 PASS, 0 skipped.
REGRESSION_RESULTS: 108/108 PASS in reviewed in-process mode, 0 skipped; socket mode remains environment-blocked.
SCHEMA_CONSTRAINT_FINDINGS: current declarations cannot guarantee all intended snapshot/allocation/replay/approval invariants; explicit representation/constraint decisions required within 27 tables/16 ENUMs.
W01_W05_GATES: W01 incomplete; W02/W03 blocked; W04 prior FAIL not cleared; W05 blocked. No new PASS.
REMAINING_BLOCKERS: formal review, storage/constraint decisions, authoritative DDL/client parity, physical DB UNKNOWN, isolated PostgreSQL concurrency/rollback/restore proof, governance and experiment protocol.
NEXT_ACTION: review exact representations and enforcement for findings S01–S06; retain pure core offline until preceding gates and integration evidence are complete.

## Test diagnosis and stabilization

R5 TAP has 18 fetch failures in auth-registration and test-db-security; its initial spec run exposed loopback connect EACCES. Reviewed auth-registration.test.cjs/test-db-security.test.cjs and existing in-process-http.cjs: TEST_IN_PROCESS=1 feeds Node IncomingMessage/ServerResponse over an in-memory Duplex into the real Express app. Status/body/authentication/password-hash/permission/zero-forbidden-write assertions are unchanged. No skip or assertion weakening was introduced. Existing Agent internal-auth tests already replace transport with in-process dispatch. Bootstrap security test stubs scheduling and persistence: it does not start an actual worker or database.

A minimal Node HTTP server with no application imports reproduced listen=OK followed by fetch connect EACCES to 127.0.0.1. [Probe log](evidence/r6/loopback-probe.log), exit 1. This establishes an environment loopback connect restriction independent of application handlers. Available evidence cannot distinguish sandbox network policy from Windows permission/firewall policy; no escalation or policy change attempted. Socket-mode tests remain FAIL/BLOCKED by that transport cause, not retrospectively PASS. No application defect explains the observed EACCES. In-process PASS verifies application assertions only; real socket transport coverage remains unavailable here.

Initial reviewed full suite: TEST_IN_PROCESS=1; node --test --test-reporter=tap apps/api/tests/*.test.cjs apps/agent/tests/*.test.cjs => exit 0, 98/98 PASS, 0 skipped, before new tests. [Complete log](evidence/r6/regression-in-process.tap). R5 logs untouched. This mode is opt-in with the existing environment switch; no default socket behavior changed.

## Implemented scope and interfaces

New apps/api/src/common/inventory-core.ts imports only node:crypto and the existing pure ingredient-policy module. New apps/api/tests/inventory-core.test.cjs imports only the reviewed pure source modules via a bounded transpiler; no database package. No production callers, route registration, legacy writer changes, schema/SQL edits or dependencies added.

| Decision | Implementation and verified boundary | Still absent |
|---|---|---|
| D01 | calculateRequirements selects exactly one active/product-active effective recipe at supplied clock; positive yield/whole servings, mandatory/unknown/duplicate omissions denied; active ingredients and ADD only; detached recipe/version/yield/selection/normalized requirement value | Publication locks, overlap enforcement, persistence/immutable durable history, API/UI; candidate recipes must already be scoped to one product |
| D02 | R5 normalizeIngredientQuantity reused: exact bigint conversion, canonical g/ml/piece, kg/L same dimension, capacity/whole-piece checks | Base-unit edit guard and legacy conversion adapter |
| D03 | Bigint rational quantities aggregate recipe share plus ADD effects before one HALF_UP to 0.001; exact rational rounding delta; piece requirement must be integral; capacity rejection; ingredientCost sums exact extended costs before HALF_UP to 2 decimals, accepts 4-decimal costs, preserves UNKNOWN vs known zero | Stored item/order totals, nullable/metadata COGS representation, provider/cash settlement |
| D04 | Existing rankEligibleBatches + supplierExpiryInstant reused; café next-midnight boundary, exact expiry unavailable, null/invalid quarantine, FEFO tie-breaks | Receipt legacy mapping, reserve/consume recheck in transaction |
| D05 | planReservation subtracts supplied per-batch reserved from remaining, uses FEFO, conserves exact milliunit target/remainder, rejects duplicates/foreign batches/invalid balances/insufficient eligible stock, no partial result on failure or input mutation | Durable allocation source, locking, row version validation, release/consume and physical/reserved aggregate reconciliation |
| D09 | canonicalOperationValue sorts object keys, retains array order, rejects Number/undefined/non-JSON values; normalizeOperationQuantities explicitly normalizes unique unordered ingredient rows and units; operationIdentity hashes versioned scoped type/caller key separately from actor/versions/payload request hash, deterministic batch child keys | Durable key/hash/result storage, replay authorization/lookup, transactions, retries and unknown-commit reconciliation |

Pure DTO boundaries are explicit: recipe candidates are pre-scoped to one product. Selected topping effects are quantities for the entire item line; the helper does not infer whether UI topping counts are per serving or per line, and does not claim a complete persisted topping-selection snapshot. Zero ADD quantities are allowed, negative/unsupported effects rejected. No density or substitution inference. Return objects are detached values, not immutable database records. Planner reserved amounts are trusted snapshot inputs, not reconstructed facts; adapters must re-read under locks and confirm versions before committing. Planner does not infer piece dimensions; callers use calculated/validated requirement quantities.

Canonical identity schema is an offline r6 namespace, not a deployed protocol. Generic payload normalization is deliberately not guessed: decimal/units must be normalized with the explicit adapter, other effectful fields must be present, and semantic unordered arrays must be sorted by a reviewed domain adapter. Unknown fields are included in hashing, not silently dropped. Same scoped caller key remains the same root across changed payload, while requestHash changes for conflict detection. Batch child identity is valid only within one root operation; multi-item writers need a reviewed item+batch child identity contract before integration. Hashes do not replace persistence uniqueness or authorization. No JSON storage location was selected or overloaded.

## Schema safety findings (static source, not physical DB evidence)

Inspected modular product/inventory/order/purchase/system Prisma and migration_27_tables/01_expand.sql. Existing source remains transitional (31 models/16 enums; intended removal of Inventory, InventoryBatch, SupplierProduct, AgentLog explains target27). No table or ENUM added. A fixed table count does not establish correctness; fields/constraints may need an explicitly reviewed revision within those tables.

| Finding | Exact existing limitation | Required design decision before writes |
|---|---|---|
| S01 immutable recipe snapshot | OrderItem has recipeId/recipeVersion and cost scalars; no normalized ingredient/yield/selection/rounding-delta snapshot. Recipe is mutable; unique(productId,version) does not prevent overlapping active effective intervals; no published/frozen status enforcement | Specify typed/versioned snapshot fields and publication immutability/interval enforcement on existing models, ownership and update policy; review whether existing-table changes suffice |
| S02 batch allocations | IngredientBatch has remaining but no batch reservation balance/version. InventoryTransaction has RESERVE/RELEASE but nullable ingredientId/batchId/orderItemId, orderItemId scalar without relation, free reference strings; no composite batch/ingredient ownership or allocation lifecycle constraint | Specify allocation identity, mandatory attribution/FKs, reserve/release/consume reconstruction/invariants and exact conditional transitions; reject unconstrained free-text reuse |
| S03 operation keys/results | Nullable unique ledger/GoodsReceipt/AgentExecution keys prevent only duplicate non-null keys in each table. No general operation scope/type/hash/source-version/full-result/status contract. No-movement operations have no general durable root result; one key on each movement cannot alone replay a multi-batch result | Approve exact per-parent operation envelope/result fields and constraints for every operation, including no-movement cases. If complete atomic representation cannot fit existing27 safely, stop for an explicit architecture/scope decision; no fake zero movement or new table invented |
| S04 approval records | AgentToolCall.arguments/result Json and AgentExecution statuses have no typed approval identity/hash/current approver/version/expiry/revocation/single-use constraint; unique(executionId,stepNo) only identifies a step. PR approvedBy/approvedAt is not D10 payload-bound draft authorization | Approve exact typed/versioned approval representation, identity uniqueness and atomic authorization/state enforcement on existing tables, or explicitly reconsider design; do not assume JSON correctness |
| S05 transaction constraints | Ingredient aggregate rowVersion exists, but no demonstrated batch-version/shared-lock protocol or cross-row sum conservation constraint. Separate ingredient/batch FKs do not enforce matching ownership; nullable ledger actor and references allow incomplete attribution. Static expand SQL nullable unique indexes do not prove balance/replay invariants | Define shared lock order, mandatory actor/scope, composite ownership, numeric checks, conditional version/status updates and atomic result persistence; verify all writers in real two-session/fault tests |
| S06 related count/cost/payment/receipt | StockCountItem has one ingredient row, no batch/version snapshot; PR item lacks immutable pack conversion; default zero costs lack completeness; Payment lacks unique(orderId,attemptNo) and one unresolved/settled attempt constraints in Prisma | Pin exact W03 dictionary and associated D03/D06/D07/D11 ADR revisions, reconcile SQL/generated client, then obtain formal review and isolated verification |

Conclusion: correctness is not guaranteed by the current declared schema. Existing27 might support a reviewed field/constraint redesign; feasibility is unproved and R6 does not select storage. Approve representations first, not silent JSON/reference overloading. Physical table count, actual constraints and deployed state remain UNKNOWN.

## Verification evidence

New tests cover yield2/servings3, effective selection boundaries, missing/ambiguous recipes, inactive/duplicate ingredients, optional/mandatory/unknown omissions, invalid yields, ADD aggregation/zero and unsupported types, 1/3 vs 3/3, half boundaries, piece fractions, overflow, 4900 cost example, aggregate-only monetary rounding, unknown/zero costs, FEFO allocation/remainders/reservation subtraction, full-plan failure, key/hash/child behavior, unit/order normalization and unsupported canonical values.

| Check | Actual evidence | Meaning |
|---|---|---|
| node --test --test-reporter=tap apps/api/tests/ingredient-policy.test.cjs apps/api/tests/inventory-core.test.cjs | [final units](evidence/r6/core-unit-final.tap), exit 0, 14 PASS, 0 FAIL/skipped | Pure deterministic calculations; earlier 13-test log preserved |
| node node_modules/typescript/bin/tsc --noEmit -p apps/api/tsconfig.json | [API final](evidence/r6/api-typecheck-final.log), exit 0 | Installed client typecheck only, not target schema parity |
| node node_modules/typescript/bin/tsc --noEmit -p apps/agent/tsconfig.json | [Agent](evidence/r6/agent-typecheck.log), exit 0 | No provider calls or worker execution |
| TEST_IN_PROCESS=1 node --test --test-reporter=tap apps/api/tests/*.test.cjs apps/agent/tests/*.test.cjs | [final full regression](evidence/r6/regression-final.tap), exit 0, 108 PASS, 0 FAIL/skipped | Includes new core plus existing mocks/real Express assertions; no PostgreSQL evidence |
| standalone HTTP probe | [loopback probe](evidence/r6/loopback-probe.log), exit 1, EACCES | Environment socket failure retained |

No database connection, migration/reset/seed/rollback, external provider call or actual scheduled worker executed. PostgreSQL two-session contention, rollback, uncertain commit, durable replay/restart, snapshot immutability and restore/new-write preservation are all NOT RUN. Mocks and typechecks cannot substitute for them.

## Backlog and gates

Retain R3/R5 acceptance classifications: W01-T01/T03 VERIFIED_COMPLETE; W01-T02/T04 and W02-T01/T02/T03 PARTIAL; W02-T04, W03-T01–04, W04-T01–04, W05-T01–04 BLOCKED. Total20 = 2 complete + 5 partial + 13 blocked. W05-T01 now has verified recipe/unit/rounding primitives; T02 has verified ranking/planning; T03 still lacks GoodsReceipt integration; T04 still lacks real database invariants. These completed portions do not close API/UI/storage/permission/concurrency acceptance or bypass W01–04.

Next: review S01–S06 and the pure DTO integration boundaries, obtain named formal approvals/versioned dictionary, resolve governance/dataset and authoritative DB/client parity, and prepare an isolated acceptance environment through a separately authorized task. Keep production/legacy write paths disconnected from this core.
