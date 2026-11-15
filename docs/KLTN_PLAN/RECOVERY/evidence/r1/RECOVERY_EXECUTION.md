# Recovery execution record

R1 — 2026-11-05, Asia/Saigon. **STATUS: PARTIAL**. Authorized scope: audit and eligible recovery, appropriate local tests, evidence and reporting. Database access expressly requires further user authorization under the master task; this request was sent and no target/read-only credential authorization has been received during this execution. No production data was accessed or changed.

## Work performed in dependency order

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
