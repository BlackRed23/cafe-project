# Open blockers and final disposition

Latest U1 disposition: **ARCHITECTURE_DECISION_REQUIRED**. [U1-only decision and command-to-owner matrix](U1_COMMAND_RECEIPT_DECISION.json) exhausts the fixed 27 responsibilities, evaluates options A–D, and supplies conditional K1/K2, rejected-create and UNKNOWN proofs. No current owner selected. Smallest proposed responsibility-preserving change is one explicit `CommandReceipt` business table (28/16), **not approved or implemented**. A revised 27-identity manifest would also require explicit architecture approval; no spare identity or approved replacement exists. U2–U6 work remains stopped.

Follow-up design audit: [POSTGRESQL_PERSISTENCE_CONTRACT.json](POSTGRESQL_PERSISTENCE_CONTRACT.json) records the exact target manifest/enum labels, 27-row ownership and field/FK/constraint matrix, current writer sites, conditional savepoint/UNKNOWN protocol, grants direction, and gated migration/rollback/acceptance plans. U1 remains unresolved: no legitimate immutable arbitrary-command owner was demonstrated. U2–U5 physical contracts are not frozen; U6 remains unproven. No PostgreSQL connection or migration authorized/executed by this follow-up.

2026-11-07. **STATUS: BLOCKED.** Binding target27 business tables/16 ENUM types; full D01–D11 required. Earlier limited-release and28-table alternatives are not selected. Agent isolation is mandatory. No formal GVHD approval or database mutation authorization is inferred.

| ID | Status / smallest missing fact | Exact engineering evidence required |
|---|---|---|
| U1 | **UNSOLVED, primary blocker:** no legitimate existing-table owner for an arbitrary non-stock command's immutable key/hash/exact-result history | Name physical table/columns and explain why every stored row remains a legitimate instance of that table. Supply enforceable FKs, scoped uniqueness, append/immutability/retention rules, root relationships, business-rejection persistence, current auth and transaction/recovery algorithm. Demonstrate K1/K2/replayK1 and arbitrary n required outcomes, including rejected creation with no target and multi-resource root. Run T18–24 only in separately authorized isolation after review. A key hash or “use JSON/triggers” assertion is insufficient |
| U2 | PARTIAL: private Recipe variants are concrete but responsibility/provenance and full persisted snapshot contract incomplete | Complete one-way ownership/source-product/omission/topping-component dictionary, constraints, LINE_TOTAL semantics and exact arithmetic bounds; prove T01–06. No new snapshot table or omission removal |
| U3 | UNSOLVED for full feature: typed multi-line proposals, revisions/decisions and budget/replay history missing | Map eight lines from one real call without fabricated dispatches; persist all revisions/source guards and bound approval attempts; specify budget reservation/unknown usage recovery; prove T25–28. No generic business records in Agent tables |
| U4 | UNSOLVED for full feature: multi-item draft receipt lines/whole packs and correction attribution missing | Store two item lines with arbitrary fractional-pack lot splits, repeated draft edits, immutable confirmation and corrections including pack/payable/reopening/consumed-stock disposition; exact composite FKs and sums; prove T11–14. No one-item or whole-pack-per-lot restriction |
| U5 | PARTIAL: total-cost/attempt fragments do not supply full component attribution/refund/unknown-outcome contract | Exact source-component×lot cost conservation/storage, valuation/rounding/zero-order rules; payment/account/status mappings; full refund command/dispatch attempt identity and provider idempotency/lookup semantics; prove T06, T29–33. No component suppression, cash-only restriction or refund deferral |
| U6 | UNPROVEN integrity/preservation | Approved complete manifest, actual source/client/catalog/grant parity, all-writer traces and passing T34–36 plus domain race/fault/restart tests. Current physical DB UNKNOWN; no weekly gate cleared |

The smallest unresolved design question is **where the retained record for Ingredient edit K1 lives after K2, including its exact response and failed-command siblings, without creating a false domain event or expanding table responsibility**. This is an engineering storage obligation, not a request to reconsider the owner's binding count/scope. The owner has already decided those constraints; do not ask for the same decision again. If a correct representation cannot be supplied, report this blocker and stop dependent schema implementation.

Failed candidates are enumerated with physical locations, transaction/retention implications and counterexamples in [27_TABLE_CONTRACT.md](27_TABLE_CONTRACT.md). This assessment does not claim a theorem that27 tables can never work. It establishes that the currently evaluated candidates cannot support the full required contract under the stated ownership rules, and that declaring implementation readiness would lack evidence.

Independent verified work: existing pure helper suite rerun14/14 PASS; five required artifacts created. No application source, Prisma, SQL, databases, migrations, providers or workers changed/executed. Pure results do not close durable acceptance.

| Final field | Value |
|---|---|
| STATUS | BLOCKED |
| TABLE_COUNT | 27 target; current source31 transitional declarations, deployed count unknown |
| ENUM_COUNT | 16 target/current declarations; deployed count unknown |
| D01_D11_COVERAGE | All mapped and retained; full storage/enforcement coverage incomplete |
| U1_U5_STATUS | U1 UNSOLVED; U2 PARTIAL; U3 UNSOLVED; U4 UNSOLVED; U5 PARTIAL |
| FULL_D09_PROVEN | NO |
| AGENT_ISOLATION | Required and preserved by assessment; generic Agent journal rejected |
| SCHEMA_CONSISTENCY | Not established; source/SQL/backend mismatches documented |
| IMPLEMENTATION_READY | NO for schema/dependent writes; independent pure checks/documentation only |
| REMAINING_BLOCKERS | U1 storage ownership first; full U2–U5 contracts; U6 evidence and formal review |
| NEXT_ACTION | Supply the narrow U1 physical representation/proof above; keep schema implementation stopped. No automatic redesign or scope adjustment |
