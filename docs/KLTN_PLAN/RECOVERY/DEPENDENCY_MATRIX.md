# Recovery dependency matrix

R2 — 2026-11-05, Asia/Saigon; R1 archived under evidence/r1/. User explicitly keeps database access blocked; independent recovery is authorized. Direct task edges below come from each weekly task's explicit dependencies. The older DEPENDENCIES.md contains a generic serial summary; it does not remove these more specific edges. Preparation can proceed independently; closing a task still requires its predecessors and acceptance evidence.

| Task | Direct predecessors | Current execution boundary |
|---|---|---|
| W01-T01 | None | Map verified |
| W01-T02 | W01-T01 | Static drift done; catalog blocked |
| W01-T03 | W01-T01 | Inventory/regressions verified |
| W01-T04 | W01-T02, W01-T03 | Register prepared; confirmation pending |
| W02-T01 | W01-T04 | Draft use cases only; owner survey pending |
| W02-T02 | W02-T01 | Draft BR/examples only |
| W02-T03 | W02-T01 | Matrix/security regression preparation only |
| W02-T04 | W02-T02, W02-T03 | Scope/approval blocked |
| W03-T01 | W02-T04 | Physical DB/design decisions blocked |
| W03-T02 | W03-T01 | Runbook approval/rehearsal blocked |
| W03-T03 | W03-T01, W02-T03 | Contract acceptance blocked |
| W03-T04 | W01-T03, W02-T04 | Final protocol freeze blocked |
| W04-T01 | W03-T01, W03-T02, W03-T03, W03-T04 | Actual review/decisions pending |
| W04-T02 | W04-T01 | No migration execution |
| W04-T03 | W04-T02 | No restore execution |
| W04-T04 | W04-T03 | Contract preparation; no Ingredient DB integration |
| W05-T01 | W04-T04 | Recipe/unit/snapshot design only |
| W05-T02 | W05-T01 | FEFO/reservation design only |
| W05-T03 | W05-T02 | Receipt/idempotency design only |
| W05-T04 | W05-T02, W05-T03 | PostgreSQL race/rollback NOT RUN |

| Blocker / priority | Evidence and scope | Required unblock evidence | Responsible party / due |
|---|---|---|---|
| B-DB / P0 | Local DB identity, catalog and physical 27/16 UNKNOWN; access intentionally blocked by user | Only if user later changes constraint: explicit read-only authorization; confirmed host/port/database/schema/environment; dedicated read-only credential source and privilege verification; catalog snapshot/constraints/indexes/history | Database owner, UNASSIGNED / before any live DB work; no renewed access request in R2 |
| B-GOV / P1, gating approvals where required | No authoritative SRS/DDL/supervisor receipt found in inspected docs | Versioned source report, rubric, actual academic deadline, staffing and genuine approval/decision records | Project owner + supervisor, UNASSIGNED / before W02-T04 acceptance |
| B-RULES / P0 | BRs proposed; ingredient/pack/expiry/cancellation policy unapproved | Owner walkthrough of use cases and BR examples; approval/changes recorded with person/date/version | Café owner + BA, UNASSIGNED / before dependent engine work |
| B-DESIGN / P0 | Payment/ledger/unit/FK/index mismatches; unsafe script hazards | Approved ADRs and actual catalog comparison; necessary changes reviewed; source/client/API contracts reconciled | Architect + DBA, UNASSIGNED / before rehearsal |
| B-ISOLATION / P0 | No verified isolated test database/role/backup target | Proven separate endpoint/database/ownership and permitted actions; sanitized fixture; backup/restore procedure and artifact destination | Database owner + QA, UNASSIGNED / before migration/restore/integration |
| B-SEC / P0 for affected live writes | SEC02 credential validity unknown; SEC03 cross-request receiving race; SEC04 duplicate PR race; durable delivery and general API error disclosure/SEC08 validation | Credential owner disposition/revocation as needed; reviewed atomicity/key design; targeted PostgreSQL concurrency/rollback tests; general error/validation corrections | Security/backend owners, UNASSIGNED / before affected rollout |

SEC01 current-account middleware is corrected with mock regression evidence. It does not establish transactional revocation during an already in-flight write, password-reset/session revocation, or deployed behavior.

R2 verified independent corrections: reject duplicate receipt item IDs before transaction entry; GET listing no longer provisions stock (product creation still creates inventory transactionally); order Agent scan runs after transaction resolution and never on ledger/commit failure; Gemini adapter rejects invalid typed values and sanitizes SDK/parse errors.90 local mocked/contract cases pass. Postcommit dispatch is best effort; process-crash delivery and real database races remain unproven. Historical week gates and dependencies remain unchanged.

Execution order: finish W01 live/governance gaps → validate W02 rules/permissions/SRS → close W03 design/protocol → review W04 → perform only necessary approved isolated replay/restore → Ingredient slice → W05 recipe/FEFO/receipt/concurrency. Existing 27-table deployment may require compatibility correction rather than recreation. Migration necessity stays UNKNOWN until catalog comparison. Contract is deferred until legacy consumers are gone and applicable live gates pass; those future gates are not circular prerequisites for a first safe expand rehearsal.
