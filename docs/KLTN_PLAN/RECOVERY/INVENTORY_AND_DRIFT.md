# Repository, Agent and drift inventory

R2 — 2026-11-05, Asia/Saigon. Review evidence TC-01-01…04. Current input versions are in [source-inventory-r2.json](evidence/source-inventory-r2.json); R1 reports are archived under evidence/r1/. Source observations below do not identify the active PostgreSQL database; access remains blocked by explicit user choice.

| Component | Source and proven relationship | Reuse / change / limitation |
|---|---|---|
| Workspace | package.json workspaces apps/* and packages/*; turbo.json | npm/Turbo orchestration; avoid root dev during verification because Agent worker is included |
| Web | apps/web/package.json; src/main.tsx; src/routes/AppRoutes.tsx | React/Vite customer/admin routes, inventory adjustment UI, PR/order/log pages; no dedicated recipe/Ingredient CRUD route found. Manifest React 19; older architecture diagram says React 18 |
| API | apps/api/src/index.ts; modules/*/*.route.ts; package.json | Express → middleware/validation → controller/service → repository; existing inventory/order/purchase patterns reused. Bootstrap cron can write; not started |
| Database | packages/database/package.json; src/index.ts; prisma/schema/main.prisma | Shared Prisma singleton/generated exports; source modular PostgreSQL schema. No regenerate/push/migrate/seed |
| Auth | API modules/auth/auth.middleware.ts + auth.service.ts + auth.repository.ts | JWT verification now followed by getCurrentUser/findById; current active role governs request. Tests replace Prisma; no live DB access |
| Internal Agent | apps/api/src/modules/agent/agent.client.ts → apps/agent/src/server.ts → internal-auth.ts → services | Internal token plus current user/role guards. API/Agent transports mocked in regressions |
| Agent recommendations | services/recommendation.service.ts → repositories/agent.repository.ts and gemini.service.ts | Reuse rules/reorder math and fallback. R2 validates typed/finite output and sanitizes SDK/parse errors. Gemini generateContent then JSON parsing is not a function/tool-calling loop. No live provider invoked |
| Worker | apps/agent/src/worker.ts; jobs/inventory-scan.job.ts; agent.service.ts runScan | System LOG_ONLY threshold analysis and log writes; zero purchase writes in mock tests. Read-only analysis does not mean zero database writes because audit logs persist |
| Legacy business paths | API inventory/order/purchase/supplier repositories; Agent repository | Inventory, InventoryBatch, SupplierProduct and AgentLog still consumed. Do not drop them based on count arithmetic |
| Shared contracts | packages/types/src; packages/types/package.json | Existing DTOs reusable; generated client consistency not implied |

Initial tracked state: no tracked modifications, docs/ already untracked. No AGENTS.md was found in the inspected repository inventory; earlier audit also records no parent guidance. No independent approved SRS/Business Rules/target DDL was found. Existing architecture and ERD are in docs/PROJECT_SOURCE_ANALYSIS.md §4/§7; PROJECT_VERIFICATION.md qualifies source versus test claims. Neither substitutes for owner approval or live inspection. In particular, the old ERD has one Payment per Order while current Prisma declares payments[], and its claim that findFirst/create guarantees concurrent PR exclusion is unsupported.

## Static drift matrix — TC-01-02

Expected static counts: nine modular Prisma files, 31 models, 16 ENUMs; initial SQL 15 tables/6 ENUMs; expand adds 16/10; four transitional models account for 31−4=27. Actual: matches all these declaration counts in E2. This arithmetic is not a physical database result. Metadata/backup tables are excluded from the business-table target.

| Layer / field | Historical or candidate SQL | Current Prisma / code | Required action |
|---|---|---|---|
| Generated client | node_modules/.prisma/client/schema.prisma: 15 models/6 ENUMs | Source: 31/16. API/Agent typechecks PASS against the installed legacy generated exports | Establish intended contract; inspect live schema before generation/integration. Do not treat typecheck as current-schema parity |
| Payment | Original unique orderId/status PaymentStatus; expand adds transactionStatus | Prisma nonunique orderId index, status TransactionStatus; API uses legacy single payment/status | Decide attempts/cardinality/status ADR and compare actual indexes/labels |
| Product unit | Original unit; expand default servingUnit='ly'; backfill only NULL | Prisma servingUnit; API selects Product.unit | Approve per-SKU unit mapping; preserve legacy units; do not assume default equals mapped value |
| Ledger batch/actor | Legacy batchId→InventoryBatch and userId; expand actor columns do not fully backfill/remap FK | Prisma batchId→IngredientBatch, legacyBatchId→InventoryBatch, performedBy; API writes userId/legacy batch in batchId | Compare actual columns/FKs; explicit actor/provenance map; adapt consumers together |
| Receipt/request ingredient links | Expand scalar columns exist but FK block omits some target relations | Prisma IngredientBatch→GoodsReceipt/PurchaseRequestItem, PurchaseRequestItem→Ingredient | Diff FK columns/actions/validation, not merely column presence |
| Category/OrderItem uniques | Original unique Category.name and OrderItem(orderId,productId) persist in candidates | Prisma composite Category(name,kind); OrderItem lacks that unique | Decide cross-kind names and separate topping/recipe lines; diff actual uniques |
| Indexes | Candidate GoodsReceipt purchaseRequestId index; ledger query indexes incomplete versus Prisma | Prisma receipt(purchaseRequestId,receivedAt), status; ledger ingredient/time, reference, orderItem, type/time | Compare definitions/order/predicates/validity, not names/counts |
| Decimal / checks | Ingredient(14,3), cost(18,4), ledger money(14,2), recipe yield(10,2) declarations | Purchase quantities are Int; no approved pack/base-unit convention. No proven target quantity≥reserved≥0 / active-recipe CHECK/index enforcement | Approve precision, units and constraints; verify physically and test with PostgreSQL |
| Source→target mapping | 02 records unmapped Inventory; no complete Ingredient/Batch/SupplierIngredient backfill | Legacy consumers still present | Mapping approval + per-ID/unit/stock/reservation reconciliation before any contract |
| Script execution safety | Top-level RAISE; verify undefined diff aliases; contract counts FAIL but ignores missing/NOT_EXECUTED; broad rollback deletes | Existing E6 MG01…MG10 remain relevant if scripts are used | Keep scripts unexecuted; design/review isolated rehearsal if needed |

Full historical source findings: [DATABASE_AUDIT](../WEEK_04_AUDIT/DATABASE_AUDIT.md), [MIGRATION_SAFETY_AUDIT](../WEEK_04_AUDIT/MIGRATION_SAFETY_AUDIT.md). All eight SQL files are hashed in E2. No SQL was executed. No claim that any migration is unapplied is made.

## Agent and test inventory — TC-01-03

| Suite | Evidence exercised | Level / exclusions |
|---|---|---|
| apps/api/tests/auth-registration.test.cjs | Registration role/hash/duplicate/login; actual middleware/ADMIN route; new stale-role/account revocation and lookup failure | In-process HTTP + mocked Prisma; bcrypt/JWT real; no PostgreSQL |
| apps/api/tests/inventory-consistency.test.cjs | Aggregate/batch/ledger, reservation boundaries, invalid values/dates, failure injection and roles | In-memory transaction mock; rollback supplied by mock, not PostgreSQL |
| apps/api/tests/inventory-ui-contract.test.cjs | Static UI render/source checks, payload, simulation restore, order status delta | Mock persistence; no browser E2E or database restore |
| apps/api/tests/test-db-security.test.cjs | Bootstrap mount/health, unauthenticated /test-db 404 with zero DB calls | Bootstrap/router/cron mocks |
| apps/agent/tests/internal-auth.test.cjs | Token/principal/role gates, API→Agent mock E2E, uncertain timeout no blind retry | In-process transport/persistence mocks; no provider/live DB |
| apps/agent/tests/principal-guards.test.cjs | Worker LOG_ONLY/no purchase writes; direct service/repository denies | Mock persistence/principal |
| apps/agent/tests/rule-based-regression.test.cjs | Rules and mock Gemini failure fallback with actor | Provider mock; no quality/latency benchmark |
| apps/api/tests/purchase-receipt-validation.test.cjs | Duplicate normalized receipt IDs rejected by real Zod schema and direct repository before transaction; distinct partial receipt/batch sums preserved | Persistence denied; no cross-request race or DB rollback proof |
| apps/api/tests/order-after-commit.test.cjs | Scan after commit only; ledger/commit failure zero scans; cancellation/finalized state no scan; failure logs omit private marker | Fake transaction/Agent boundaries; no real PostgreSQL commit or durable delivery proof |
| apps/agent/tests/gemini-output.test.cjs | Actual adapter accepts valid/fenced typed output; rejects invalid/null/coerced/nonfinite/range/string fields; sanitized SDK/parse errors | SDK/environment mocks; no provider call |

R2 final result:90/90 cases pass across10 suites; zero skipped. R1 final73/73 remains historical. Inventory listing now has a no-provision/no-Agent-writes test; product creation still transactionally creates its inventory. Test result detail and expected/actual: [TEST_EVIDENCE](TEST_EVIDENCE.md). Existing AgentExecution/ToolCall/Evaluation schema is not runtime evidence of registry, multi-step recovery or benchmark metrics.

## U01–U10 governance register — TC-01-04

| ID | Current knowledge | Required source / next step |
|---|---|---|
| U01 | Authoritative 27/16 SQL approval UNKNOWN | Owner supplies exact DDL/version/hash and approval |
| U02 | User reports physical 27 tables/16 ENUMs; independent counts UNKNOWN; user explicitly blocks DB access | Leave UNKNOWN under current constraint; catalog snapshot only if user later changes access instruction |
| U03 | Migration/restore execution UNKNOWN | Verified isolated test target + actual rehearsal/backup logs |
| U04 | R2 current mock regressions90 PASS; API/Agent noEmit checks PASS | Live DB/provider/browser acceptance still UNKNOWN; generated client is legacy |
| U05 | Café workflows/BR approval UNKNOWN | Owner interview and dated rule decisions on E4 |
| U06 | School deadline UNKNOWN; weekly dates are proposed | Official academic schedule/rubric |
| U07 | Supervisor approval UNKNOWN; no submission/review receipt inspected | Actual feedback/approval record; no surrogate signature |
| U08 | Staffing/available hours UNKNOWN; owners UNASSIGNED | Owner assigns people and recovery dates |
| U09 | Gemini sandbox/model/quota authorization UNKNOWN | Provider owner confirms isolated resources before live tests |
| U10 | Frozen dataset/labels/baseline results UNKNOWN | Versioned protocol/dataset and raw measurement evidence |

Expected TC-01-04: missing sources stay UNKNOWN with next action. Actual: register records those gaps; no approval fabricated. W01-T04 remains PARTIAL because upstream live verification and governance confirmation are open. Source report bao-cao-tuan.docx was not found in the inspected file inventory; the existing weekly template is retained, not represented as the original report.
