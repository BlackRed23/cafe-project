# R5 draft SRS, Business Rules, ADRs and traceability

2026-11-06, Asia/Saigon. DRAFT FOR FORMAL REVIEW. All eleven decisions OWNER_AGREED in principle via R5 owner instruction; formal approvals 0. Full R4 recommendations, parameters, alternatives, trade-offs and expected tests remain the detailed contract. These summaries do not narrow them. No SRS freeze is claimed.

Target remains 27 tables/16 ENUMs; physical PostgreSQL UNKNOWN. No schema or SQL changed. Existing legacy workflows remain unchanged.

| ADR / decision | SRS / BR | Agreed draft rule | Remaining dependency |
|---|---|---|---|
| ADR-R5-D01 / D01 | BR01 / REQ01 | One active effective published recipe; immutable snapshot; explicit optional omission; ADD only. | Recipe publication/API/snapshot representation; D02/D03 |
| ADR-R5-D02 / D02 | BR01 / REQ01 | g/ml/piece; kg and L convert only within dimension; positive quantities, whole pieces; no density conversion. | Base-unit edit guard and Ingredient/Recipe integration |
| ADR-R5-D03 / D03 | BR01/06 / REQ01/06 | Decimal strings; aggregate before HALF_UP to 0.001; exact allocation remainder; cost 4 decimals, total 2; UNKNOWN distinct from zero. | Rational recipe math, costs, DTO and metadata representation |
| ADR-R5-D04 / D04 | BR02 / REQ02 | FEFO expiry/receivedAt/id; supplier dates expire next midnight Asia/Ho_Chi_Minh; null/malformed quarantine; exact expiry unavailable. | Receipt mapping and reserve/consume eligibility under locks |
| ADR-R5-D05 / D05 | BR02 / REQ02 | Durable item/batch allocations via constrained ledger references; no automatic timeout. | Exact dictionary/constraints; D01–04/D09 |
| ADR-R5-D06 / D06 | BR03/08 / REQ03/08 | Whole packs, immutable conversion, partial receipt; ADMIN/STAFF receive; invoice is not replay key. | GoodsReceipt adapter/snapshots; D02–04/D09 |
| ADR-R5-D07 / D07 | BR05 / REQ05 | ADMIN count approval, versioned per-batch snapshot; explicit audited owner self-count exception. | Count version representation; D02–05/D09 |
| ADR-R5-D08 / D08 | BR04 / REQ04 | Explicit whole-item preparation start consumes; cancellation never automatically restores; refund separate. | Item transitions and allocations; D01–05/D09/D11 |
| ADR-R5-D09 / D09 | BR13 / REQ13 | Durable scoped key/hash/result, deterministic child keys, common lock order; at most 3 confirmed-rollback attempts; unknown commit lookup before retry. | Atomic complete storage within 27 tables; real restart/race/fault tests |
| ADR-R5-D10 / D10 | BR08/10–12 / REQ08/10–14 | Active ADMIN approval for PR draft only; 15min payload/version-bound approval; caps 6 dispatches, 2 provider calls, 8000 tokens, 60s active time, 1 write; 20s provider timeout, 2 read attempts. | Durable registry/approval/budgets; D06/D09; experimental protocol |
| ADR-R5-D11 / D11 | BR07 / REQ07 | Multiple full-value attempts; one unresolved active attempt, one applied settlement; whole VND; no split or partial refund; full refund separately authorized. | SQL/client/API parity; D03/D09; provider contract/sandbox |

Each ADR selects its R4 recommended option over the alternatives documented there, accepting the stated trade-offs in principle. Formal review must identify named authority, version/hash, parameters, exceptions, date and receipt; none is invented here. D09 constrained reuse must fail closed if complete atomic storage cannot be proved. An extra table requires a separate explicit scope decision.

Executable subset: D02 allows case-insensitive g/kg/ml/l/piece and surrounding unit whitespace. Decimal input is a string, no exponent or whitespace, at most 11 integer/3 fractional digits before and after conversion; output removes trailing fractional zeros. D03 is only representability/exact conversion, not recipe or cost rounding. D04 date-only parsing is separate from already-parsed supplier timestamp instants. Invalid receivedAt is conservatively excluded. Base-unit immutability, recipe snapshots, reservation/consume, allocation, persistence and payment are not implemented by these helpers.
