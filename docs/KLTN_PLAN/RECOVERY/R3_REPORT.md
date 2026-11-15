# Recovery R3 — business rules and design closure

STATUS: PARTIAL
WEEK_01_GATE: NOT_EVALUATED
WEEK_02_GATE: NOT_EVALUATED
WEEK_03_GATE: NOT_EVALUATED
WEEK_04_GATE: FAIL (existing static safety violations; migration not run)
WEEK_05_GATE: NOT_EVALUATED
TOTAL_BACKLOG_TASKS: 20 (W01–W05); original W01–W04 denominator16 retained separately
VERIFIED_COMPLETED: 2
REMAINING: 18 (5 PARTIAL +13 BLOCKED)
BLOCKED: 13 primary classifications; all18 remaining have acceptance dependencies
TEST_RESULTS: 94/94 pass,0 skipped; API and Agent noEmit exit0; PostgreSQL NOT RUN
UNRESOLVED_BUSINESS_DECISIONS: D01 recipe selection/toppings; D02 units/density/count; D03 Decimal rounding/cost; D04 expiry/FIFO/FEFO; D05 allocation/reservation; D06 purchase packs/receiver/invoice; D07 stock-count approval/variance; D08 preparation/cancellation/waste/returns; D09 durable keys/concurrency; D10 Agent approval/permissions/budgets; D11 payment ADR. None approved here.
FILES_MODIFIED: apps/api/src/modules/purchase/purchase.validator.ts; apps/api/src/modules/inventory/inventory.validator.ts; apps/api/tests/purchase-receipt-validation.test.cjs; existing four recovery summary reports (additive R3 sections). Added R3_REPORT, R3_BUSINESS_RULES, R3_TRACEABILITY, R3_TASK_STATUS, R3_TEST_EVIDENCE, evidence/r2 snapshots, execution-metadata-r3.json, source-inventory-r3.json, r3 regression/typecheck logs. Pre-existing R1/R2 dirty files preserved.
NEXT_ACTION: authorized stakeholders decide D01–D11 against the concrete review; version approved SRS/design/protocol and governance receipts. Keep physical database untouched.

[Task-by-task previous/actual/evidence/dependency/acceptance](R3_TASK_STATUS.md); [rules](R3_BUSINESS_RULES.md); [design traceability](R3_TRACEABILITY.md); [test evidence](R3_TEST_EVIDENCE.md). No new task closure claimed merely because documentation exists.
