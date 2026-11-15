# Recovery R5 — decision finalization and implementation

Report date: 2026-11-06, Asia/Saigon. Owner instruction received during the 2026-11-05 recovery session; exact approval timestamp/person name not supplied. Baseline HEAD: 33366f714b288310580d69247e47c58aa4ea062f with pre-existing dirty recovery source/tests and untracked docs. These were preserved. No skill workflow was applied: the bounded execution skill requires a published exact-edit WorkflowManager plan, which this owner request does not provide; implementation proceeds under the explicit user task scope.

STATUS: PARTIAL_IMPLEMENTATION; formal and database acceptance blocked.
DECISIONS_OWNER_AGREED: 11/11, D01–D11, complete R4 recommended options/parameters, in principle.
DECISIONS_FORMALLY_APPROVED: 0/11; required stakeholder/technical/GVHD receipts pending.
IMPLEMENTED: pure D02 exact quantity/unit validation and D04 expiry/FEFO foundations; D03 representability subset; draft contracts and decision/traceability updates.
TEST_RESULTS: new policy tests 4/4 PASS; API/Agent noEmit typechecks PASS; full regression 80/98 PASS, 18 FAIL (loopback EACCES), exit 1.
W01_W05_GATES: W01 incomplete; W02 blocked; W03 blocked; W04 retained FAIL/not cleared; W05 blocked. No PASS asserted.
REMAINING_BLOCKERS: formal review, exact storage/constraint contracts, generated-client/source/SQL parity, physical DB unknown, isolated PostgreSQL race/rollback/restore evidence and governance/dataset protocol.
NEXT_ACTION: obtain named technical/stakeholder/GVHD review of the agreed draft and exact 27/16 dictionary/operation storage; prepare mocks for dependent contracts; keep database-dependent integration gated.

## Decisions and draft artifacts

[R4 register](R4_DECISION_REGISTER.md) now records OWNER_AGREED for every decision; its appended R5 authority record supersedes historical proposal wording. [R5 draft SRS/BR/ADRs](R5_DRAFT_CONTRACTS.md) maps each D01–D11 to existing REQ/BR IDs, selected rules, remaining dependencies and one ADR per decision. Full R4 alternatives/trade-offs/parameters remain incorporated. Draft SRS, R3 Business Rules/traceability and recovery backlog link to these current amendments; historical evidence is preserved. Owner agreement is evidenced by the explicit R5 chat instruction, not a fabricated signature. SRS remains draft, not frozen.

## Implementation and dependency review

New source: apps/api/src/common/ingredient-policy.ts. No imports of DB/client/services, no route wiring and no existing stock behavior changed. Quantity arithmetic uses bigint thousandths to avoid JS Number conversion; input/output must fit Decimal(14,3). Units are explicit g/kg/ml/l/piece; same-dimension conversion only, integral pieces, canonical strings. This does not implement D03 recipe aggregate rounding, rational yields, allocation remainder or COGS.

Supplier date-only expiry is validated and converted to next café midnight (UTC+07); explicit supplier instants must be parsed separately by a future adapter. Pure ranking excludes null/invalid/exactly expired batches and invalid receivedAt, then sorts expiry/receivedAt/id without mutating input. No balances, locks, durable reservations, consume eligibility or immutable snapshot claims.

Dependency checks: common/units.ts is legacy Product packaging and remains separate. inventory.repository.ts, order.repository.ts and purchase.repository.ts still implement legacy stock; no helper call is added. New helpers must not be substituted until Ingredient adapters, snapshots, shared locks and parity gates are reviewed. No schema, ENUM, SQL, migration, seed, reset or rollback was changed/executed. Physical DB remains UNKNOWN; target requirement remains 27 tables/16 ENUMs.

| Week / tasks | Affected files and dependencies | R5 evidence/status |
|---|---|---|
| W01 T01–04 | PROJECT_BASELINE/PROJECT_SOURCE_ANALYSIS; modular Prisma; generated client and migration SQL; governance inputs | Inventory tasks T01/T03 retain VERIFIED_COMPLETE; T02/T04 PARTIAL. Physical catalog and governance unresolved |
| W02 T01–04 | REQUIREMENTS_AND_INVENTORY_DESIGN, R3_BUSINESS_RULES, R3_TRACEABILITY, R4 register, R5 contracts; auth middleware and inventory/purchase/Agent route permission boundaries | T01–03 remain PARTIAL; T04 BLOCKED. Owner choices resolved in principle, formal review/walkthrough/SRS freeze absent |
| W03 T01–04 | packages/database/prisma/schema/{product,inventory,purchase,order,system}.prisma; migration_27_tables; API DTO/repositories; Agent public-api/services | All BLOCKED. ADR drafts prepared; exact snapshot/operation/result/count/approval representation, cardinality, client/SQL parity and experiment protocol remain |
| W04 T01–04 | migration_27_tables/00_precheck.sql through 05_rollback_plan.sql; inventory validator/service/repository; Ingredient API contract | All BLOCKED; prior MG05/06/07 findings not repaired by R5. No DB rehearsal or safety gate cleared |
| W05 T01 | new ingredient-policy.ts; product.prisma/Recipe/Ingredient and future route/DTO/UI | BLOCKED full acceptance; new unit/scale primitives verified only. CRUD/publish/immutable snapshot missing |
| W05 T02 | new ingredient-policy.ts; inventory.repository.ts/order.repository.ts; inventory.prisma ledger/batches | BLOCKED full acceptance; expiry/ranking primitives verified only. Allocation/locking/durable reserve/consume absent |
| W05 T03 | purchase.validator.ts/purchase.receipt-validation.ts/purchase.repository.ts; purchase/inventory Prisma | BLOCKED. Immutable pack conversion, GoodsReceipt adapter, operation replay and atomicity unimplemented |
| W05 T04 | inventory-consistency/receipt/order tests and future isolated PostgreSQL fixtures | BLOCKED. Mock rollback cannot establish two-session race, deadlock, unknown-commit or restore invariants |

Backlog classification retains the R3 acceptance denominator: 20 tasks = 2 VERIFIED_COMPLETE + 5 PARTIAL + 13 BLOCKED, remaining 18. Independent completed components are recorded without closing their parent tasks. W04 FAIL means unresolved historical migration safety findings; it is not a newly executed migration result.

## Verification

New tests: apps/api/tests/ingredient-policy.test.cjs; transpiles the real pure module in a VM with no permitted require/import of persistence. Tests cover exact kg/L conversion, canonical output and max boundary; zero/negative/nonfinite/exponent/scale/overflow/dimension/fractional-piece rejection; leap-day/date validity; UTC+07 boundary; quarantine; FEFO tie-breaks and input nonmutation. These are unit tests, not PostgreSQL tests.

| Command | Actual result | Limit |
|---|---|---|
| node --test apps/api/tests/ingredient-policy.test.cjs | exit 0, 4 tests PASS | Pure deterministic units |
| node node_modules/typescript/bin/tsc --noEmit -p apps/api/tsconfig.json | exit 0 | Installed legacy generated client; no target-schema parity claim |
| node node_modules/typescript/bin/tsc --noEmit -p apps/agent/tsconfig.json | exit 0 | Same limitation; no provider call |
| node --test apps/api/tests/*.test.cjs apps/agent/tests/*.test.cjs | exit 1; HTTP fetch loopback EACCES in auth-registration/test-db-security | Full run not PASS; no application regression inferred from denied transport |
| git diff --check | exit 0 | Existing LF/CRLF warnings only; does not inspect all untracked content |

The suite was repeated with TAP output capture to preserve exact totals and failures after the initial output was truncated. Captured repeat: 98 tests, 80 PASS, 18 FAIL, 0 skipped; all 18 captured failures report fetch failed. The initial spec run exposed connect EACCES on loopback as the underlying cause; TAP omits that nested cause. See [regression log](evidence/r5/regression.tap). No production bootstrap, live DB/provider test, migration or restore was run. Typechecks and units cannot clear weekly acceptance gates.

## Remaining work

Formal sign-off must list exact artifact hash, D01–D11/options/parameters, named authorized people/roles, date, receipt and exceptions. Complete W03 dictionary/constraints and prove constrained ledger/JSON reuse is sound without adding tables. Resolve Product/Ingredient, batch/actor/units and Payment cardinality/status mappings with the generated client and authoritative DDL. Repair/review migration safety separately; isolated real parity, restore preserving post-snapshot writes, race and fault acceptance remain NOT RUN. Governance staffing/schedule/rubric and frozen dataset/provider experimental protocol remain missing. Owner agreement resolves the policy-selection blocker only; it does not supply these deliverables.
