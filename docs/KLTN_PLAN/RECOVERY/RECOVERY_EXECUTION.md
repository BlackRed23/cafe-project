# Recovery execution record

R2 — 2026-11-05, Asia/Saigon. **STATUS: PARTIAL**. User explicitly answered **“Keep database access blocked; continue independent recovery.”** No database authentication, probe, query or modification was attempted. This is an active constraint, not an unanswered permission request. R1 reports and source/execution metadata were copied into evidence/r1/ before R2 revisions; original logs remain available. Historical weekly and audit reports are unchanged.

## R2 independent recovery execution

Prerequisites: R1 source inventory and security findings inspected; authorization to continue independent work received; no schema/DB migration required for these existing-code corrections. W02…W05 business/design gates remain open. No rule approval, supervisor signature, production deployment or weekly completion is inferred.

| Finding / eligible action | Implementation and reuse | Verification / actual outcome | Remaining limitation |
|---|---|---|---|
| SEC03 duplicate receipt payload | Shared duplicateReceiptItemIndex used by existing Zod receipt schema and repository before any transaction. Whitespace-normalized duplicate IDs rejected with400 | New validator tests reject repeated IDs, retain distinct partial receipts and existing batch-sum validation; direct repository bypass starts zero transactions for duplicates | Cross-request receipt races, fresh quantity read/locking and durable idempotency remain unresolved; not claimed concurrency-safe |
| SEC07 Gemini adapter boundary | Existing adapter keeps JSON/fence support but removes Number/String coercion; finite positive quantity, finite0…1 confidence, typed strings/nonempty supplier and reasoning. Existing supplier membership/quantity cap remains in recommendation service. Generic SDK/parse errors omit raw content | Tests reject null/boolean/string quantities, overflow1e999, wrong shapes/missing fields/out-of-range confidence and malformed/private output; valid typed/fenced response retained | No live provider call; general API error-handler development stack/raw logging remains a separate SEC07 component |
| SEC05 read side effect | Remove createMissingForActiveProducts call from inventory GET service. Existing product create transaction still provisions its inventory | Listing test permits only read mocks; no provisioning or Agent write | Historical products lacking inventory now require explicit authorized reconciliation; GET does not repair them |
| SEC06 transaction timing | Move order completion scan outside transaction callback and after successful transaction promise resolution; keep original actor/order/products. Failure log no longer appends raw Agent error | Success dispatches once after commit; injected ledger/commit failure dispatches zero; cancellation/already-finalized completion dispatches zero; Agent failure does not undo committed success | Best-effort notification can be lost on process crash after commit; no durable outbox/recovery claim |

Before these fixes,11 new targeted cases yielded2 pass/9 fail; after the receipt/Gemini fixes11/11 passed. An intermediate84-case regression passed. Adding listing/order timing tests initially yielded30/31 pass: the new listing fixture omitted existing read-only groupBy/supplier mocks. Added those read surfaces without weakening assertions. Current full suite: **90/90 pass,0 skipped**,10 CJS suites. API and Agent `tsc --noEmit` both exit0 against installed legacy generated client15/6. No Prisma generation, dependency install or service startup.

R2 modified existing files: apps/agent/src/services/gemini.service.ts; apps/api/src/modules/purchase/purchase.validator.ts and purchase.repository.ts; apps/api/src/modules/inventory/inventory.service.ts; apps/api/src/modules/order/order.repository.ts; apps/api/tests/inventory-consistency.test.cjs. Added apps/api/src/modules/purchase/purchase.receipt-validation.ts, apps/api/tests/purchase-receipt-validation.test.cjs, apps/api/tests/order-after-commit.test.cjs, apps/agent/tests/gemini-output.test.cjs. R1 middleware/test changes remain. Recovery reports, collectors and R2 evidence updated;151 current inputs hashed in [R2 source inventory](evidence/source-inventory-r2.json). Full run/hash metadata: [R2 execution metadata](evidence/execution-metadata-r2.json).

Counts unchanged:2 verified backlog tasks,14 remaining (5 PARTIAL/9 BLOCKED); week gates unchanged. Owner inputs for SRS/rules/DDL/academic schedule remain missing. DB-dependent tests intentionally NOT RUN under user constraint. No new request for DB access is made. Source-only fixes do not close real receipt/PR concurrency, restore or W05 PostgreSQL acceptance.

## R1 work performed in dependency order (historical)

| Step | Task / prerequisites checked | Executed work | Expected → actual / evidence | Closure |
|---|---|---|---|---|
| 1 | W01-T01; no predecessor | Inspect manifests, entries/routes, shared packages, source/architecture and guidance inventory; source hashes | Versioned map with source and limits → map and 147 hashed inputs, [inventory](INVENTORY_AND_DRIFT.md), [manifest](evidence/source-inventory.json) | VERIFIED_COMPLETE for map scope |
| 2 | W01-T02; W01-T01 done | Count source/generated declarations and historical/candidate SQL; inspect drift and prior audit | Explain 31→27/16 without modifying tables → reproduced 31/16 vs generated15/6, historical15/6+expand16/10; live DB UNKNOWN | PARTIAL; catalog verification pending |
| 3 | W01-T03; W01-T01 done | Inspect seven CJS suites and mock import boundaries; run existing safe suites with in-process flags | Existing regression baseline →72/72 pass, no DB/provider/app bootstrap | VERIFIED_COMPLETE for capability/test inventory |
| 4 | W01-T04; W01-T02 open | Prepare U01–U10 with source needs and unknowns | No invented approval → all governance unknowns explicit | PARTIAL; no confirmation/approval receipt |
| 5 | W02-T01…03; W01-T04 not closed | Independent draft use cases, BR examples, current role matrix and review agenda | Concrete review input → [requirements/design draft](REQUIREMENTS_AND_INVENTORY_DESIGN.md) | Preparation only, no task closure |
| 6 | SEC01 independent code correction; no migration/schema change required | API middleware verifies signed token then loads current active user through existing getCurrentUser; request role/email comes from current record; lookup errors fail closed with generic 503 | Disabled/demoted/deleted account cannot enter protected writes → new regression verifies no additional handler/persistence writes; lookup details not returned | Source correction verified by mock regression; deployed behavior UNKNOWN |
| 7 | Same security change / regression compatibility | Update inventory auth fixture to model current-account lookup and API→Agent deleted-user expected status to401 | Initial after-change run73 cases:72 pass,1 fail (old expected403 vs actual401); corrected the deleted-account expectation → final73/73 pass | Intermediate failure retained in log, not hidden |
| 8 | Local source checks only | Run API/Agent tsc --noEmit; inspect generated schema freshness | Compile source against installed dependencies → both exit0; generated client15/6 differs from Prisma31/16 | PASS narrowly; does not close source-schema/live parity |
| 9 | W03/W04/W05 predecessors unclosed | Document task-specific corrections, safe execution boundaries, W05 transaction/fixture design and required real DB tests | Preserve original scope/dependencies → matrices and acceptance rows created; downstream DB implementation/rehearsals not performed | BLOCKED full execution; no bypass |

Executed commands/results are in [TEST_EVIDENCE](TEST_EVIDENCE.md). Source checks did not emit dist or regenerate Prisma. Root npm dev/build/format/install, external integrations, SQL phases, db push/reset/seed/contract/rollback were not run. No dependency versions were changed.

Environment observation: Node v24.21.0, npm11.19.0; installed dependencies reused. Metadata-only Get-Service could not open Service Control Manager; Get-Process returned no postgres record through available access. Active DB remains UNKNOWN; that is not proof PostgreSQL is stopped or absent. No server authentication/probe was attempted. An initial attempt to invoke Python for evidence collection found no installed Python via python/py; collection was implemented with installed Node instead, with no installation. Collector reads source/hashes only.

## Revisions and changed artifacts

Historical WEEK_01…05 and WEEK_04_AUDIT reports were preserved byte-for-byte; this R1 recovery package is an additive current assessment. Original task IDs/requirements remain. No supervisor message was sent and no signature/approval was inferred.

Application/test modifications:

- apps/api/src/modules/auth/auth.middleware.ts — current active-account/role lookup, generic fail-closed lookup error.
- apps/api/tests/auth-registration.test.cjs — issued-token disable/demotion/deletion/unavailable-account regression with zero writes.
- apps/api/tests/inventory-consistency.test.cjs — current-user lookup fixture for actual middleware.
- apps/agent/tests/internal-auth.test.cjs — deleted API user now401 before Agent transport.

New recovery artifacts: five requested reports, INVENTORY_AND_DRIFT.md, REQUIREMENTS_AND_INVENTORY_DESIGN.md; evidence/collect-static.cjs, source-inventory.json, regression-before.log, regression-after.log, regression-final.log, api-typecheck.log, agent-typecheck.log and verification evidence. No git commit was created; docs/ was already untracked. Source SHA256 manifest is the precise working-tree version reference.

Remaining security risks: SEC02 credential-shaped historical log material requires owner disposition/revocation evidence; SEC03 stale receipt snapshot/duplicate item/concurrent over-receipt; SEC04 active PR check/create race; SEC05 GET side effects; SEC06 Agent work started before commit; SEC07 provider validation/raw error handling; SEC08 profile/password validation. These were not silently marked fixed. Candidate migration hazards remain isolated from execution.

Next dependent step is the pending read-only target/role authorization and authoritative design/governance inputs. Existing 27-table deployment must be inspected before deciding whether any migration is needed. Isolated-test-target proof and approved recovery runbook are separately necessary before migration/restore/integration tests. No deadline or owner assignment has been invented.


## R3 current assessment — 2026-11-05

This additive R3 section supersedes only the current summary/count/test references above; R2 narrative remains historical. STATUS PARTIAL. WEEK_01/02/03/05 NOT_EVALUATED; WEEK_04 FAIL for preserved static migration safety findings, not a runtime migration failure. No week newly complete.

Completed independent work: technically classified business rules and D01–D11 decision register; all16 requirement consistency mappings; all20 original task status rows; finite unitPrice/purchaseQuantity validator correction with four new unit cases. No approved SRS/owner policy/supervisor receipt invented. No database operation attempted.

See [R3 business rules](R3_BUSINESS_RULES.md), [traceability](R3_TRACEABILITY.md), [task ledger](R3_TASK_STATUS.md), [test evidence](R3_TEST_EVIDENCE.md). W01–W04 counts unchanged16 total/2 verified/14 remaining/9 primarily blocked. W01–W05 counts20 total/2 verified/18 remaining/13 primarily blocked (5 partial tasks also have closure dependencies). Latest tests94/94,0 skipped; API/Agent typechecks exit0; mock results do not prove PostgreSQL integration. R2 report snapshots: evidence/r2/.

NEXT_ACTION: obtain recorded decisions D01–D11 and approved/versioned SRS/DDL/protocol/governance inputs while retaining DB block; implement dependent Ingredient/Recipe/receipt/Agent writes only after applicable design/predecessor gates. No automatic approval inferred.
