# Implementation boundary and gated sequence

The subsequent [persistence design audit](POSTGRESQL_PERSISTENCE_CONTRACT.json) supplies a static writer/caller migration map and conditional transaction, grants, migration, rollback and acceptance sequences. These are gated plans, not completed G0/G1 contracts or executable migration approval. U1 ownership remains missing; keep the PostgreSQL boundary fail-closed.

2026-11-07. **Schema implementation STOPPED at U1. No complete implementation plan is authorized by this assessment.** Full D01–D11 remain mandatory; no bounded release or new table is introduced. The following lists dependencies and exact known touchpoints for a future handoff, not executable Prisma/SQL changes.

## Work completed independently

1. Inspected recovery contracts, all current Prisma declarations, historical/proposed migration SQL and relevant backend writers/callers.
2. Wrote the five architecture artifacts in this directory; established missing storage owners and explicit fail witnesses.
3. Ran existing database-independent unit tests:14/14 PASS. No source/schema/SQL changes, generated-client regeneration, database read/write or migrations.

## Ordered gates

| Gate | Deliverable / known source boundary | Exit condition |
|---|---|---|
| G0 — U1 first | Supply exact existing-table command-history mapping against `27_TABLE_CONTRACT.md`; no source changes | Physical columns, immutable key/hash/results, typed links, unbounded append behavior, rejection/root ownership, same-key locking and recovery are internally consistent and responsibility-preserving; T18–24 proof and isolated evidence proposal reviewed |
| G1 — finish U2–U5 | Field-complete snapshot, proposal/revision/approval, multi-item receipt/correction and finance/refund contracts; all five artifacts updated together | Every missing owner resolved; all D01–D11/S01–S06 invariants have one accountable domain entrypoint and DB mechanism, no scope reduction; GVHD/formal artifact review recorded independently |
| G2 — static schema handoff | Exact future edits: `packages/database/prisma/schema/{category,user,product,inventory,supplier,purchase,order,system}.prisma`; main.prisma only if reviewed generator configuration actually needs change | Frozen field/type/null-shape dictionary; relationship/FK/index/check/trigger/grant manifest; all 27 identities/16 enums preserved; no speculative fields or hidden store |
| G3 — non-executed SQL preparation | Prepare versioned additive migration/parity/validation/rollback SQL only after G2. Existing `packages/database/prisma/migration_27_tables/00_precheck.sql` through `05_rollback_plan.sql` require independent repair/replacement review | Exact Prisma-generated DDL plus SQL-only partial/exclusion/deferred/privilege constraints and preservation plan reviewed. No SQL changes prescribed now because U1 owner is missing. Never edit applied historical migrations in place |
| G4 — isolated evidence | Separately authorized disposable PostgreSQL with runtime grants; T01–36; generated-client/DTO compile checks | Actual catalog/grant parity; two-session/fault/restart/restore tests pass. Pure/mock checks cannot substitute. Stop on any invariant mismatch |
| G5 — application adapters | Bounded file list below, finalized only after contracts freeze; do not enable database writes here | Shared canonicalization, current auth, protected transaction boundaries and replay implemented coherently; all legacy side doors converted; UI/shared types/reporting consistent |
| G6 — cutover authorization | Separate review of preservation, operational recovery, migration execution, caller switch and legacy retirement | Explicit authorization; unknown legacy mappings quarantined; post-snapshot write preservation proven; no automatic production cutover |

Known future touchpoints, **not an allowlist to edit now**:

- `apps/api/src/common/ingredient-policy.ts`, `inventory-core.ts`: reuse pure math; child identity needs item+ingredient+batch+phase+ordinal for shared-batch commands. A command persistence module path cannot be selected until its actual owner exists.
- `apps/api/src/modules/order/order.{repository,service,validator,controller,route}.ts`: typed item snapshots, explicit start/cancel and attempt cardinality; replace legacy completion decrement and Number DTOs.
- `apps/api/src/modules/purchase/purchase.{repository,service,validator,controller,route}.ts`, `purchase.receipt-validation.ts`: frozen conversion, typed multi-item receipts/corrections and replay. New domain module names remain unspecified until storage ownership is resolved.
- `apps/api/src/modules/inventory/inventory.{repository,service,validator,controller,route}.ts`, `modules/simulate-sale/simulate-sale.repository.ts`: protected sole stock writer; no parallel legacy balance updates or unsafe restores.
- `apps/api/src/modules/payment/payment.{repository,service,validator,controller,route}.ts`: attempts/verified settlement/refund/reconciliation. Provider adapter files remain unspecified pending account/protocol contract.
- `apps/agent/src/services/agent.service.ts`, `recommendation.service.ts`, `gemini.service.ts`, `repositories/agent.repository.ts`, `public-api.ts`, `worker.ts`: real dispatch accounting, typed multi-line proposals/revisions and bound approvals; no manual business journal.
- `apps/api/src/modules/auth/auth.middleware.ts`, `modules/user/user.service.ts`: current authority/version changes. `modules/product/product.repository.ts`, `modules/supplier/supplier.repository.ts`, `modules/email/email.service.ts`, `modules/dashboard/dashboard.service.ts`: legacy creation/mappings/logging, uncertain dispatch and reporting dependencies.
- Existing `apps/api/tests/ingredient-policy.test.cjs`, `inventory-core.test.cjs`, `inventory-consistency.test.cjs`, `purchase-receipt-validation.test.cjs`, `order-after-commit.test.cjs` remain useful. New PostgreSQL/provider test paths, shared-types and web consumers need a concrete post-contract caller inventory; pretending this list is exhaustive would be unsafe.

Rollback safeguards for any later plan: preserve immutable legacy IDs, units/timezone, actor attribution, unknown costs, provider truth and new operation keys/results; map only evidenced history. Use additive compatibility until safe conversion; prove recovery of writes after backup, including dedup keys. A full old-snapshot restore cannot discard later writes. Do not run 00/03 as probes, 04 CASCADE retirement, or 05 deleting/resetting domain history. No live behavior is rolled back by this document because none was changed.

Next work is narrowly G0 evidence, not a fresh multi-round redesign, a migration attempt, or a request to accept reduced requirements. If G0 remains unsolved, only independent pure tests/documentation/read-only inventory may continue.
