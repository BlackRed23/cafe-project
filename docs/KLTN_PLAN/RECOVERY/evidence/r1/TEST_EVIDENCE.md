# Test and review evidence

R1 — 2026-11-05, Asia/Saigon. Baseline HEAD `33366f714b288310580d69247e47c58aa4ea062f`; modified-source/input SHA256 in [source-inventory.json](evidence/source-inventory.json). Node v24.21.0; npm11.19.0; TypeScript5.9.2; installed Prisma CLI/client6.19.3 (manifest/installed package inspection, no generation). Test suites transpile TS in memory; that alone is not typechecking. No credential values were used in reports.

## Commands and results

Executed from repository root with PowerShell process flags `$env:TEST_IN_PROCESS='1'`, `$env:TEST_REAL_HTTP='0'`. Seven reviewed test suites replace persistence/provider dependencies before importing source. These runs do not start the production API, worker, cron or Prisma connection. The internal-auth HTTP transport is in-process, not external HTTP. Tests use synthetic identities and tokens.

```powershell
node --test apps/api/tests/auth-registration.test.cjs apps/api/tests/inventory-consistency.test.cjs apps/api/tests/inventory-ui-contract.test.cjs apps/api/tests/test-db-security.test.cjs apps/agent/tests/internal-auth.test.cjs apps/agent/tests/principal-guards.test.cjs apps/agent/tests/rule-based-regression.test.cjs
node node_modules/typescript/bin/tsc -p apps/api/tsconfig.json --noEmit
node node_modules/typescript/bin/tsc -p apps/agent/tsconfig.json --noEmit
node docs/KLTN_PLAN/RECOVERY/evidence/collect-static.cjs
```

| Run | Expected | Actual / exit | Raw evidence / limitations |
|---|---|---|---|
| R-BASELINE, before SEC01 change | Existing reviewed regressions all pass | 72 tests,72 pass,0 fail/skip, exit0 | [regression-before.log](evidence/regression-before.log); mock persistence/provider only |
| R-INTERMEDIATE, after SEC01 change | Added revocation test passes; existing HTTP expectations remain coherent | 73 tests,72 pass,1 fail, exit1. API→Agent deleted-user check expected403 but API now correctly returns401 before transport | [regression-after.log](evidence/regression-after.log); failure retained. Fixed expectation in internal-auth.test.cjs; no production guard weakened |
| R-FINAL | All regressions including disable/demotion/deletion/unavailable-account denial pass | 73 tests,73 pass,0 fail,0 skip/cancel/todo, exit0 | [regression-final.log](evidence/regression-final.log); no PostgreSQL evidence |
| R-API-TYPES | No diagnostics against installed dependencies | exit0, no diagnostics | [api-typecheck.log](evidence/api-typecheck.log), empty success log; exit recorded in execution metadata |
| R-AGENT-TYPES | No diagnostics against installed dependencies | exit0, no diagnostics | [agent-typecheck.log](evidence/agent-typecheck.log), empty success log; exit recorded in execution metadata |
| R-STATIC | Count/version/hash source without DB access | 31 source models/16 ENUMs; generated15/6;147 inputs hashed, exit0 | [source-inventory.json](evidence/source-inventory.json); SQL CREATE counts lexical, not parser/replay results |

SEC01 fixture: issue one ADMIN JWT, initially allow one protected write, disable account→403; reactivate and demote STAFF/CUSTOMER→403; delete account→401; persistence lookup error→503 with no private error detail; total protected handler writes remain1 and user-create writes remain0. This proves current request-boundary policy under mocks. It does not prove revocation during an already-running transaction, session revocation after password reset or production deployment.

Installed generated client has **15 models and 6 ENUMs**, source has **31 and16**. Both typechecks therefore prove compatibility with the installed legacy client, not compatibility with current schema or live database. Client regeneration was deliberately not used to obscure that drift.

Package verification: `node docs/KLTN_PLAN/RECOVERY/evidence/verify-package.cjs` exited0. All five required reports exist, all16 original task rows are unique, counts reconcile (2 verified/5 partial/9 blocked), local report links resolve and147 input hashes match. Run log hashes, observed exit codes, log modification timestamps and report hashes are recorded in [execution-metadata.json](evidence/execution-metadata.json). Log modification timestamps are not asserted to be test start times. `git diff --check` passed; Git emitted only LF/CRLF conversion warnings. No historical weekly/audit input changed during this recovery.

## Original weekly test IDs: expected versus actual

| Test ID(s) | Expected acceptance | Actual / status and evidence |
|---|---|---|
| TC-01-01 | Source-backed stack/module map with limits/version | PASS document review: INVENTORY_AND_DRIFT component table, source hashes; W01-T01 verified |
| TC-01-02 | Historical15, source31/16, explanation of target27, real DB UNKNOWN | PASS **static** review: E2 counts/drift table. Physical verification required by recovery NOT RUN; full W01-T02 partial |
| TC-01-03 | Distinguish mocks/in-process/DB tests and JSON vs Tool Calling | PASS inventory review and baseline execution; seven suite boundaries documented; W01-T03 verified |
| TC-01-04 | Missing report/schedule/approval remains unknown with action | Register review matches expectation; actual schedule/staffing/approval and W01-T02 prerequisite unresolved; full task PARTIAL |
| TC-02-01 | Actor/preconditions/failure branches, unit/receipt exceptions validated | Draft use-case review only; real stakeholder survey/validation NOT RUN |
| TC-02-02 | Before/after preparation policy and hand examples accepted | Hand examples documented (54g/450ml,4,900VND); owner approval NOT VERIFIED; engine not run |
| TC-02-03 | Operation allow/deny, principal checks and zero unauthorized writes | Existing/current auth mocks PASS; approved complete business/HITL matrix unresolved |
| TC-02-04 | Requirement→BR→component→task→test→evidence and real scope approval | Existing REQ01–16 proposed mappings reviewed; approved SRS/dataset/DDL receipt absent |
| TC-03-01 | 27/16 ERD/DDL parity with Payment/batch decisions | Source drift VERIFIED; catalog comparison and approved ADRs NOT RUN/NOT VERIFIED |
| TC-03-02 | Reviewed runbook with mappings/backup/checksum/unit stock/money/FK/new writes | Existing safety gaps documented; rehearsed runbook NOT VERIFIED |
| TC-03-03 | Tool I/O/principal/budget/stale approval/key contract | Guard code/tests partial; approved full contract/state machine NOT VERIFIED |
| TC-03-04 | Freeze baseline/fixtures/labels/denominators/raw format before measuring | Proposed metric/raw format exists; protocol/dataset freeze NOT VERIFIED; no benchmark measured |
| TC-04-01 | Genuine design decisions/approval with P0s closed | NOT VERIFIED; audit/design preparation is not approval |
| TC-04-02 | Isolated compile/replay and clean full schema diff | NOT RUN; no verified isolated DB; no migration applied here |
| TC-04-03 | Fault/restore with new writes; preserve IDs/counts/unit stock/money/FKs | NOT RUN; no backup/restore artifact; sale restoration mocks are not DB restore |
| TC-04-04 | Ingredient smoke/RBAC/Decimal/rollback and legacy regression | Legacy mock regression PASS; Ingredient API and DB rollback NOT RUN |
| TC-05-01 | Valid unit/yield/topping/version/snapshot API/UI behavior | Draft calculation examples only; new recipe API/UI NOT IMPLEMENTED |
| TC-05-02 | Two-session FEFO/reservation without oversell/negative or expired use | NOT RUN on PostgreSQL |
| TC-05-03 | Partial receipt/replay/over-receipt with durable keys | NOT RUN; existing receipt path has unresolved race |
| TC-05-04 | Mid-write fault rolls back batch/aggregate/ledger and state | NOT RUN on PostgreSQL; mocks do not close this criterion |

## Required future PostgreSQL evidence

First authorize read-only catalog inspection on a confirmed local target using a dedicated audit identity; verify actual privileges and READ ONLY transaction, collect names/ordered ENUM labels/columns/defaults/PK/FK/CHECK/index definitions/history checksums, separately identify business/metadata/backup objects and legacy presence. A matching total is insufficient. No catalog SQL here was executed.

For later integration/rehearsal, separately prove isolated test DB ownership, endpoint/database/role and allowed actions; reviewed schema contract, sanitized deterministic fixtures, actual backup/hash and approved RPO/RTO. Run two independent PostgreSQL sessions for same/different keys, last eligible stock, overlapping ingredients, expiry and deadlock/retry; inject failure at every transaction write and before/after COMMIT response. Compare committed rows by operation/ID/batch/base unit/cost/reservation; verify no oversell, partial movement, duplicate receipt or unexpected orphan. Verify cancellation/waste and restore with post-snapshot writes. Preserve full redacted command/exit/timestamp/version/fixture/expected/actual evidence; failed or skipped checks remain visible.

Provider, browser E2E, deployment and supervisor acceptance are NOT EVALUATED. No result here authorizes a migration or proves production security.
