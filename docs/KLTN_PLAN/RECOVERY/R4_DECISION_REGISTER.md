# Recovery R4 — Business decision register D01–D11

Prepared: 2026-11-05, Asia/Saigon. **R5 current status: 11 OWNER_AGREED in principle; 0 formally approved.**

This is a reviewable implementation contract proposal, not stakeholder consent, an approved SRS, authorization to migrate, or acceptance evidence. Every recommendation, numerical policy and role assignment below awaits explicit approval. Actual named decision makers, approval dates and receipts are UNKNOWN. No application, schema, SQL, migration or existing acceptance artifact is changed by this register.

## Evidence and authority

The working SRS inputs are [WEEK_02](../WEEK_02.md), [requirements traceability](../REQUIREMENTS_TRACEABILITY.md) and [draft requirements/business rules](REQUIREMENTS_AND_INVENTORY_DESIGN.md). No separately named approved SRS or approved standalone Business Rules document was identified in the reviewed documentation; these inputs must not be treated as frozen requirements.

Reviewed R3: [report](R3_REPORT.md), [business rules](R3_BUSINESS_RULES.md), [traceability](R3_TRACEABILITY.md), [task status](R3_TASK_STATUS.md), [test evidence](R3_TEST_EVIDENCE.md). R3 reports 94/94 unit/mock tests and successful API/Agent typechecks against an installed legacy client, not PostgreSQL acceptance. These are historical R3 results, not tests rerun by R4. R3's “prepared concrete decision register” wording does not imply any D01–D11 approval.

Source references below are repository-relative, current working-tree observations (which include pre-existing uncommitted recovery changes):

| Ref | Inspected input and evidence boundary |
|---|---|
| S1 | `packages/database/prisma/schema/product.prisma`: Recipe version/effective dates/yield, RecipeIngredient optional/substitution flags, Topping types and quantities. Declarations do not implement selection or immutable snapshots. |
| S2 | `packages/database/prisma/schema/inventory.prisma`: Ingredient, IngredientBatch, InventoryTransaction, StockCount/Item, legacy Inventory/InventoryBatch; Decimal scales, nullable identifiers, rowVersion. No durable allocation relation or count snapshot version is declared. |
| S3 | `packages/database/prisma/schema/purchase.prisma`, `supplier.prisma`: integer pack-like PR quantities, SupplierIngredient conversions/MOQ, GoodsReceipt and optional unique key. Conversion snapshot on PR item is absent. |
| S4 | `packages/database/prisma/schema/order.prisma`: ConsumptionStatus, recipe references, cost fields, Order.payments[], Payment TransactionStatus, callbacks/reconciliation. Recipe references alone do not snapshot ingredient quantities. |
| S5 | `packages/database/prisma/schema/system.prisma`: AgentExecution/AgentToolCall JSON fields, execution key/status and usage counters; these are not a running registry or approval protocol. |
| S6 | `packages/database/prisma/schema/migrations/20260718025427_init_schema_and_unique_keys/migration.sql`; `packages/database/prisma/migration_27_tables/00_precheck.sql` through `05_rollback_plan.sql`, especially `01_expand.sql` and `04_contract_DO_NOT_RUN_YET.sql`. Historical single-payment uniqueness, transitional batch/actor mappings and destructive contract differ from the target design. SQL was not executed. |
| S7 | `apps/api/src/modules/order/order.repository.ts` (`create`, `updateStatus`) and `order.service.ts` transition/DTO code: legacy Product reservation; completion deducts legacy physical/batches; cancellation releases before deduction; host-local start-of-day expiry; singular payment and Number DTOs. |
| S8 | `apps/api/src/modules/purchase/purchase.route.ts`, `purchase.validator.ts`, `purchase.receipt-validation.ts`, `purchase.repository.ts`; inventory route/validator/repository: STAFF receipt allowed, duplicate item/batch-sum checks, finite input checks, legacy receipt transaction. No GoodsReceipt ingredient adapter or durable replay protocol. |
| S9 | `apps/agent/src/public-api.ts`, `internal-auth.ts`, `worker.ts`, `services/agent.service.ts`, `services/recommendation.service.ts`, `services/gemini.service.ts`; API auth/Agent guards: fixed scan/recommend/log/conversion exports, JSON generation/validation, system LOG_ONLY, current-principal checks. Conversion takes logId/userId, not a payload/version-bound approval. |
| S10 | [W01](../WEEK_01.md), [W02](../WEEK_02.md), [W03](../WEEK_03.md), [W04](../WEEK_04.md), [W05](../WEEK_05.md), [acceptance criteria](../ACCEPTANCE_CRITERIA.md): review receipts, schema parity, restore preservation, permission checks and real PostgreSQL race/rollback evidence are separate gates. |

Physical DB state remains UNKNOWN. R3 records source31 models/16 enums versus generated15/6; target27 is explained by removal of four transitional models, not verified deployment. Do not add arbitrary tables to evade the 27-table requirement or claim current SQL satisfies the proposals.

## Decision matrix

Priority is the consequence of enabling the affected write before closure. All eleven are critical for their respective workflows; D01–D09 form the stock-integrity core, D10 protects Agent writes, and D11 protects settlement.

| ID / trace | Unresolved question | Selected recommendation (all OWNER_AGREED in principle) | Decision-making role; technical reviewer | Direct decision dependencies |
|---|---|---|---|---|
| D01 / BR01 REQ01 | Which recipe and topping effects apply? | One current published recipe; immutable order snapshot; ADD only initially | Café owner/operations lead; backend/DB lead | D02, D03 for executable quantities |
| D02 / BR01 REQ01 | Which units, density and count granularity? | g/ml/piece; same-dimension conversion; whole pieces; no density conversion | Café owner; inventory/backend lead | None |
| D03 / BR01/06 REQ01/06 | Where do quantities and money round? | Decimal strings; aggregate then round once; conserve allocation; unknown cost explicit | Café owner/finance role; backend/DB lead | D02 |
| D04 / BR02 REQ02 | Which batches are eligible and in what order? | FEFO, Asia/Ho_Chi_Minh date expiry; null expiry quarantined | Café owner/operations lead; inventory lead | None; D02/D03 for quantities |
| D05 / BR02 REQ02 | How are reservations stored and released? | Durable per-item/batch allocations via constrained ledger references; no automatic timeout | Café owner/operations lead; DB/backend lead | D01–D04, D09 |
| D06 / BR03/08 REQ03/08 | What is a purchased/received unit and who receives? | Whole packs, immutable conversion, partial receipts, ADMIN/STAFF receive, invoice not replay key | Café owner/purchasing lead; backend/DB lead | D02–D04, D09 |
| D07 / BR05 REQ05 | Who approves counts and how is variance applied? | ADMIN approval; versioned per-batch count; explicit owner self-count exception | Café owner; inventory/DB lead | D02–D05, D09 |
| D08 / BR04 REQ04 | When does preparation consume stock and what does cancellation do? | Explicit item start commits; whole item line; no automatic return; refund separate | Café owner/bar lead; backend lead | D01–D05, D09; D11 for refunds |
| D09 / BR13 REQ13 | How are replay, races and uncertain commits resolved? | Durable operation envelope/result; deterministic child keys; shared lock order | Authorized technical decision maker; owner confirms retention/workflow impact | None for protocol; D02/D03 for payload normalization |
| D10 / BR08/10–12 REQ08/10–14 | What may Agent do and what approval binds a write? | Read/recommend → active ADMIN approval → PR draft only; fixed budgets and durable state | Café owner for authority; security/backend lead for protocol; supervisor for scope | D06, D09; D02–D05 for reliable ingredient inputs |
| D11 / BR07 REQ07 | How many payment attempts and what settlement contract? | Multiple full-value attempts, one applied settlement; no split/partial refund initially | Café owner/finance role; payment/backend lead | D03, D09 |

Supervisor acceptance is additionally required for the academic SRS/scope/protocol, not a substitute for café operational consent. Role labels identify required authority; they do not appoint or assert approval by a person.

## D01 — Recipe selection, optional ingredients and toppings

**Status: OWNER_AGREED in principle; required formal approvals PENDING. Question:** Which version applies at ordering, can versions overlap, and can optional/REMOVE/SUBSTITUTE effects change stock requirements?

**Current evidence:** S1 permits many versions and effective windows; unique(productId,version) does not ensure one applicable version. S4 stores recipeId/version but not full computed quantities. S7 consumes Product stock; R3 REQ01 found no recipe engine or Recipe/Ingredient API.

**Alternatives:** (A) latest numeric version automatically; (B) exactly one explicitly published current version with validated effective interval; (C) customer-selectable recipes and full substitution graph. **Recommend B:** select at server order-creation time using `effectiveFrom <= t < effectiveTo` (open end permitted), isActive and active product/ingredients; reject zero or multiple matches. Publish/retire under a product lock; reject overlapping active intervals. Freeze published recipe content and create a new version for edits. Snapshot recipe/version/yield, selected toppings, normalized ingredient requirements and later allocations. Optional ingredients are included by default; omit only with an explicit recorded selection against isOptional. Initially support nonnegative ADD effects only; reject REMOVE/SUBSTITUTE and allowSubstitute requests until their mapping rules receive a separate approved extension. Do not silently treat unsupported types as ADD.

**Trade-offs/risks:** Less menu flexibility than C, but avoids ambiguous subtraction and negative needs; rejecting bad publication may temporarily block a product. Existing REMOVE/SUBSTITUTE data must be inventoried and disabled/reviewed before cutover. Version references cannot reconstruct history if published rows remain editable.

**Impact:** Product, Recipe, RecipeIngredient, Topping, ToppingIngredient, OrderItem/OrderItemTopping and InventoryTransaction snapshot references. Recipe publish/CRUD API and immutable quantity snapshot storage are proposed, absent capabilities; order create/read DTO and kitchen flow need adaptation. Use versioned ledger reference payloads under D05/D09 rather than pretending current scalar fields contain snapshots.

**Acceptance expected, NOT RUN:** TC-05-01: yield2 with coffee36g/milk300ml and 3 servings yields54g/450ml; ADD aggregates once; optional omission explicit; mandatory omission/unsupported type/zero yield/wrong dimension rejected with zero writes. Concurrent overlapping publication permits only one; missing/ambiguous selection fails. Editing/publishing later leaves existing order quantities/cost basis unchanged. Review maps to TC-02-02/04 and TC-03-01.

**Dependencies/owner:** D02/D03 and approved snapshot representation; café owner decides menu semantics, backend/DB lead validates enforcement.

## D02 — Units, density and discrete quantities

**Status: OWNER_AGREED in principle; required formal approvals PENDING. Question:** Which dimensions and conversion vocabulary are valid, and may a count be fractional or g convert to ml?

**Current evidence:** S1/S2 use free strings, quantity Decimal(14,3), yield Decimal(10,2); no dimension checks. S3 conversionTargetUnit and conversionQuantity exist. Legacy `apps/api/src/common/units.ts` packaging conversion is not ingredient dimensional arithmetic (R3 BR01).

**Alternatives:** (A) unrestricted unit strings and manual conversion; (B) fixed canonical g/ml/piece and exact kg→g/L→ml factors; (C) density and fractional-count configuration per ingredient. **Recommend B:** one immutable base dimension per ingredient once used; accept an explicit alias allowlist normalized to g/ml/piece; kg×1000 and L×1000 only within dimension. Require positive finite quantities and conversion factors, whole piece totals, positive yield. Reject cross-dimension conversion; do not infer density from ingredient name. Treat packaging as D06 conversion metadata, never a new dimension. Changing base unit after movements requires a separately reviewed reconciliation, not an edit.

**Trade-offs/risks:** Sliced eggs or density recipes require weighing in g or later policy extension. Existing unknown units must be quarantined/mapped with owner confirmation; no automatic legacy conversion. Fixed vocabulary minimizes configuration and prevents mixed-unit sums.

**Impact:** Ingredient, RecipeIngredient, ToppingIngredient, SupplierIngredient, IngredientBatch received units, PR conversion snapshots; ingredient/recipe/receipt validators and Agent tool schemas. Proposed Ingredient/Recipe APIs must expose normalized units; legacy product packaging remains a distinct adapter during transition.

**Acceptance expected, NOT RUN:** TC-05-01:0.018kg→18g;0.15L→150ml; 1g→ml denied; 0.5piece denied; normalized aliases deterministic; base-unit edit after movement denied. NaN/Infinity/overflow/negative quantities fail before persistence. TC-02-01/02 walkthrough documents unfamiliar units.

**Dependencies/owner:** None for vocabulary; D03 governs representable precision. Café owner confirms operational units; inventory/backend lead owns validation design.

## D03 — Decimal precision, rounding and cost

**Status: OWNER_AGREED in principle; required formal approvals PENDING. Question:** Where are fractions rounded, how are batch remainders conserved, and how is missing historical cost represented?

**Current evidence:** S1–S4 have quantities(14,3), yield(10,2), unit cost(18,4), monetary totals(12,2)/(14,2). S7 uses JS Number in totals/DTO; R3 finite validation fixes do not settle precision. Cost defaults of zero cannot distinguish missing cost from genuinely free stock.

**Alternatives:** (A) Number and implicit DB rounding; (B) exact Decimal arithmetic with one documented boundary; (C) change all quantities to smaller integer micro-units. **Recommend B:** API decimal values are canonical strings; reject input scale/overflow beyond approved field capacity, using exact Decimal arithmetic throughout calculations. Aggregate rational ingredient needs per order item before rounding to 0.001 base unit using ROUND_HALF_UP; allocate that rounded target across batches exactly, with the final allocation receiving its remainder. Piece requirements must already be integral (D02), never rounded to pieces. Store base unit cost to4 decimals; sum extended costs before HALF_UP rounding to2 monetary decimals, then sum stored item totals for order cost. Preserve explicit rounding delta in the snapshot. VND provider/cash settlement amounts are whole đồng under D11; do not silently round an incompatible checkout total.

COGS initially means allocated ingredient/topping cost only; show existing labor/overhead separately, defaulting those additions to excluded. Missing legacy cost is UNKNOWN with an explicit completeness marker, not an inferred0; known0 remains valid. Until a reviewed nullable/metadata representation exists, suppress numeric profit/COGS for incomplete items.

**Trade-offs/risks:** ±0.0005 base-unit measurement approximation; item-by-item repeated sales may differ from one combined sale. This proposal conserves each committed target, not theoretical fractions across future orders. Explicit deltas expose that limit. C demands wider schema/API migration; A risks drift. Unknown markers and Decimal DTOs require compatibility review.

**Impact:** All quantity/cost columns S1–S4, InventoryTransaction, order totals/profit DTOs, receipt pricing, Agent quantity schemas. No schema widening is presumed; snapshot/unknown-marker representation must be approved in W03 dictionary.

**Acceptance expected, NOT RUN:** TC-05-01/04:1g÷3 servings→0.333g for one serving, while three servings in one calculation→1.000g; allocation of1.000 across three batches may be0.333/0.333/0.334, sum exactly1.000. Test half boundaries, maximum and overflow before writes.10g×200+8g×250+30ml×30→4900 VND; UNKNOWN and known0 differ; recipe/price edits cannot alter historical cost. TC-02-02 and future TC-06-03 cover cost review.

**Dependencies/owner:** D02; café owner/finance role accepts approximation and cost scope; backend/DB lead confirms arithmetic and storage.

## D04 — FEFO, expiry boundary and null expiry

**Status: OWNER_AGREED in principle; required formal approvals PENDING. Question:** Does oldest receipt or earliest expiry win, when does a café date expire, and is missing expiry usable?

**Current evidence:** S7 filters legacy batches against host-local startOfToday and sorts expirationDate,id. S2 IngredientBatch permits null expiry and has receivedAt. No approved ingredient selection engine exists.

**Alternatives:** (A) FIFO(receivedAt,id); (B) FEFO(expiry,receivedAt,id); (C) manual batch choice. Null expiry could be always eligible last, explicitly nonperishable, or quarantined. **Recommend B with fail-closed nulls:** store a date-only supplier expiry as the exclusive instant at the next midnight in Asia/Ho_Chi_Minh, represented in UTC; explicit supplier timestamps retain their instant. Eligible iff `now < expirationDate`; exact expiry is unavailable. Null/malformed expiry is quarantined until corrected, with no automatic invented date. Select by expiry,receivedAt,id; no manual bypass. Recheck eligibility at reserve and consume (D05). Physical includes expired/quarantined balances; usable stock excludes them. An expired batch is removed physically only by an explicit attributed waste movement.

**Trade-offs/risks:** FEFO reduces spoilage and reuses existing expiry sort; null quarantine can block nonperishables until a later approved exemption. Date normalization must not shift legacy instants without reviewed mapping. “Nulls last” is a viable future alternative, not this recommendation.

**Impact:** IngredientBatch/InventoryBatch mapping, Ingredient availability, receipt expiry inputs, reserve/consume selection, expiry warnings/Agent scans and waste screen. One shared clock/timezone policy replaces host-local interpretation.

**Acceptance expected, NOT RUN:** TC-05-02: A20 later expiry/earlier receipt, B10 earlier expiry/later receipt, need18→B10+A8 (FIFO comparator→A18). Equal expiry uses receivedAt then id. ExpiredC20 remains physical, cannot reserve. Null excluded. Café expiry date remains valid before next midnight and invalid exactly then regardless of server timezone; reserved batch expiring before consume follows D05 and never gets consumed.

**Dependencies/owner:** Café owner chooses stock policy/boundary; inventory lead validates shared implementation. D02/D03 supply quantity rules.

## D05 — Reservation allocation and lifecycle

**Status: OWNER_AGREED in principle; required formal approvals PENDING. Question:** How can reservations identify batches, survive restart and handle expiry/cancellation without overselling?

**Current evidence:** S2 has aggregate reserved but no batch allocation table; optional ledger orderItemId/reference fields and RESERVE/RELEASE/CONSUME enums are available. S7 reserves legacy aggregate stock only. Enum presence is not a reservation engine.

**Alternatives:** (A) aggregate-only reservation; (B) immutable per-item/per-batch RESERVE ledger rows with linked terminal RELEASE/CONSUME rows; (C) new allocation table. **Recommend B to reuse tables**, contingent on approved constraints/dictionary: each allocation has an immutable identifier, enforced ingredient/batch/item ownership, positive quantity and deterministic child key. Terminal entries reference the allocation; exactly one terminal transition per allocation is enforced transactionally and by uniqueness. A versioned reference payload stores item snapshot and allocation links; a bare referenceId or unconstrained free-text JSON is insufficient. Reconstruct open allocation as reserve with no terminal entry; maintain Ingredient.reserved as a reconciled cache. If enforceable typed references cannot fit the approved27-table design, return to design review; do not quietly introduce C.

Reserve all ingredients atomically; lock/re-read before allocation. No automatic time-based release initially: explicit order cancellation releases; a stale-order list requires staff action. On consume, if any allocated batch expired, atomically plan a full eligible replacement for the affected needs; release/reallocate/consume together or roll back entirely and show insufficient stock. Never consume expired allocations or release an actively preparing order by a background timer.

**Trade-offs/risks:** B avoids another table but needs indexes/constraints and careful event reconstruction. C gives clearer direct queries but changes approved table scope. No timeout risks stranded reservations; operational stale-order review is mandatory. A cannot protect batch availability.

**Impact:** Ingredient, IngredientBatch, InventoryTransaction, OrderItem; order create/cancel/start, stock read/adjust/count, receipt and all other stock writers share locks. Proposed allocation/snapshot contract is absent today.

**Acceptance expected, NOT RUN:** TC-05-02/04 on two PostgreSQL sessions: last18g cannot be reserved twice; physical100/reserve18→100/18, cancel→100/0 once; replay/start races create one terminal outcome. Restart reconstructs the same allocations. Expiry replacement uses only eligible free stock; failure leaves original transaction state unchanged. physical120 including expired20, eligible100 with eligible reservations30 gives available70, not90. Assert per-batch open reservations≤remaining, aggregate reserved=sum open allocations, physical=sum all remaining, and0≤reserved≤physical.

**Dependencies/owner:** D01–D04/D09; café owner approves explicit-release lifecycle, DB/backend lead approves representation and constraints before implementation.

## D06 — Purchase packs, receipts, receivers and invoices

**Status: OWNER_AGREED in principle; required formal approvals PENDING. Question:** Are PR quantities packs or base quantities, may packs be partial, who confirms receipt, and what identifies a repeat?

**Current evidence:** S3 PR quantity/quantityReceived are Int, supplier conversion Decimal/MOQ Int. GoodsReceipt exists only as a declaration. S8 permits ADMIN/STAFF receive and legacy receipt without batches can increase aggregate alone; duplicate item checks do not prevent request replay/races.

**Alternatives:** (A) whole purchase packs with conversion snapshot; (B) Decimal pack/base purchasing and fractional receipt; (C) restrict receiving to ADMIN. **Recommend A and retain ADMIN/STAFF receipt:** create PR in integer packs≥MOQ with active supplier mapping; freeze purchaseUnit, base conversion, ingredient, quoted price and price basis per pack. MOQ applies to ordered packs, not each partial delivery. Receive positive whole packs up to remaining; refuse partial packs and over-receipt. Require batch splits/expiry and exact base-unit sum on every confirmed receipt. Keep DRAFT receipts non-stock-affecting; confirmation atomically updates GoodsReceipt, PR totals, batches, aggregate and ledger under D09. STAFF cannot alter approved conversion/price or approve/send/pay PRs. Require current actor identity on receipt, not trusted client receivedBy.

Invoice number is optional supplier metadata; multiple deliveries may share an invoice. Warn on same supplier+normalized invoice, but do not use it as an idempotency key or make it globally unique. Require an operation key for each physical receipt; identical invoice on different genuine deliveries is allowed with explicit delivery reference. Confirmed errors use linked correction/reversal movements under approval, never destructive receipt editing.

**Trade-offs/risks:** Preserves Int fields and route roles, reduces configuration; repacking requires a new approved purchase specification. Existing pricePerBaseUnit must be reconciled with quoted pack price using D03, not guessed. Invoice warnings alone cannot stop deliberate re-entry with a new key; delivery review remains a human control.

**Impact:** SupplierIngredient, PurchaseRequest/Item, GoodsReceipt, IngredientBatch, Ingredient, InventoryTransaction, User; existing purchase `PATCH /:id/receive` (router-relative), create/approve/send and receipt UI/Agent draft inputs. Add approved conversion snapshot/receipt confirmation contract; do not dual-write legacy and Ingredient stock without a reviewed cutover adapter.

**Acceptance expected, NOT RUN:** TC-05-03:10×250g ordered, receive4→1000g and6 packs remain; same key replay unchanged; same key changed body conflicts; receive7 fails; later receive6 totals2500g. Two concurrent receive6 requests against remaining6 commit only one. Missing/wrong batch sum, fractional packs, invalid expiry, duplicate item IDs fail. STAFF receive allowed; STAFF approve/pay denied zero writes; demoted actor denied. Fault injection rolls back receipt/batches/totals/key together.

**Dependencies/owner:** D02–D04/D09, W04 adapter/parity gate; café owner/purchasing lead confirms units/roles/invoice policy, backend/DB lead verifies atomicity.

## D07 — Stock counts, approval and variance

**Status: OWNER_AGREED in principle; required formal approvals PENDING. Question:** Must counter and approver differ, what happens to stale counts, and which batches receive variance?

**Current evidence:** S2 declares count statuses/creator/approver and aggregate quantities, but no snapshot rowVersion or batch count details. R3 found no count service; legacy adjustments require batch and protect reservations.

**Alternatives:** (A) overwrite aggregate quantity; (B) versioned batch count with ADMIN approval and traceable variance; (C) stop all café writes during a count. **Recommend B:** ADMIN or STAFF records a DRAFT per-batch count and ingredient rowVersion snapshot; submit PENDING freezes it. ADMIN alone approves, with reason for every nonzero variance. Prefer different counter/approver; if the owner is the sole operator, permit ADMIN self-approval only with explicit self-count reason in audit. No new role/configuration switch. Under locks, reject a changed version and require recount; do not overwrite intervening receipts/sales. Apply signed batch deltas, aggregate and ledger once; persist version/batch details in the approved count contract. Reject reductions below open batch reservations; resolve affected orders then recount. Positive stock requires explicit identified batch/expiry/cost completeness; unidentified stock remains quarantined pending owner mapping.

**Trade-offs/risks:** Stale-count rejection may cause recounts during service; preferable to lost movements. Self-approval is weaker control but workable for a single-owner café and visible in audit. Current schema needs approved snapshot/batch detail representation, not reliance on systemQty alone.

**Impact:** StockCount/Item, Ingredient/Batch, InventoryTransaction, User; proposed count draft/submit/approve/cancel APIs and count UI, absent today. Reuse inventory adjustment service primitives only after ingredient adaptation.

**Acceptance expected, NOT RUN:** TC-02-02/03, TC-03-01 and future TC-06-02:500→480 yields−20 exactly once; intervening receipt increments version and approval makes zero movements. STAFF approval denied; ADMIN self-approval without reason denied. Count lowering batch below reservations rejected; duplicate/concurrent approval one result; injected ledger failure leaves count PENDING and all balances unchanged.

**Dependencies/owner:** D02–D05/D09; café owner approves separation exception and variance policy, inventory/DB lead approves storage/version protocol.

## D08 — Preparation, cancellation, waste, remakes and returns

**Status: OWNER_AGREED in principle; required formal approvals PENDING. Question:** What observable action commits ingredients, can a line be partially prepared, and does cancellation return stock?

**Current evidence:** S7 consumes only on order COMPLETED; PROCESSING is displayed as CONFIRMED. Completed cancellation is rejected. S4 has item ConsumptionStatus/timestamps but no implemented item start contract. No prepared-drink waste engine exists.

**Alternatives:** (A) retain completion-time consumption; (B) explicit item preparation-start commit; (C) consume incrementally per ingredient/serving. **Recommend B:** order confirmation/PROCESSING remains distinct from an authorized ADMIN/STAFF “start preparation” action. Start commits the whole item line quantity and sets consumption COMMITTED atomically; no partial line start initially (split into separate lines before reservation if operationally needed). Completion requires all live item lines committed; it cannot silently consume again. Snapshot is fixed at order creation, not recalculated at start.

Before start, cancellation releases once. After start, cancellation/void classifies consumed ingredients as CUSTOMER_CANCELLED or STAFF_ERROR loss, linked to original consumption, with no second physical decrement; completed-order cancellation remains rejected. Mixed orders release unstarted lines and classify started lines atomically. Refund is a distinct authorized D11 process; stock state never implies payment reversal. Remake creates a linked new item/order with a new reservation/consume and explicit reason; no free hidden reuse of the original movement. No return of prepared drink ingredients to stock. Untouched damaged/expired stock uses a separate batch WASTE physical movement; supplier returns require ADMIN, identified free batch stock and a linked negative movement. Reserved stock must first be resolved; no blind RETURN increment.

**Trade-offs/risks:** Adds one explicit kitchen action but matches when ingredients leave reusable stock. Whole-line start reduces state complexity, limits partial preparation flexibility. New post-start void classification must not be confused with enabling existing completed cancellation or treating a loss classification as another stock movement.

**Impact:** Order/Item/Topping snapshots, Ingredient/Batch, InventoryTransaction, Payment references; order status/start/cancel/void/remake UI/API (item start/void proposed), waste/return adjustment service and kitchen workflow. Require explicit sign/type contract for supplier returns in dictionary; enum name alone is insufficient.

**Acceptance expected, NOT RUN:** TC-05-04 plus future TC-06-01/04:100/18→cancel100/0; start→82/0; post-start void remains82/0 and one loss classification. Replay completion/void never double-decrements. Mixed order releases only pending allocations. Remake of18g consumes another18g if sufficient. Untouched waste5g decrements exactly5g. Completed cancellation remains denied; refund changes no inventory. Two-session start/cancel has exactly one consistent outcome.

**Dependencies/owner:** D01–D05/D09; D11 before refund integration. Café owner/bar lead approves preparation semantics; backend lead approves state transitions/DTO compatibility.

## D09 — Durable idempotency, locks, retries and uncertain outcome

**Status: OWNER_AGREED in principle; required formal approvals PENDING. Question:** What uniquely identifies a business operation across races/restarts, and when is retry safe?

**Current evidence:** S2/S3/S5 nullable unique keys exist. S7 conditional updates and S8 retry/check patterns are useful, but neither unique requestNumber nor duplicate item detection is operation-level replay. R3 records stale receipt/check-create races and best-effort postcommit scans.

**Alternatives:** (A) client retry plus nullable ledger key; (B) operation envelope/result in an approved existing durable representation with atomic child writes; (C) dedicated idempotency table. **Recommend B:** reuse a versioned structured operation envelope in existing InventoryTransaction reference payload for stock operations, GoodsReceipt reference for receipt identity, AgentToolCall/Execution JSON for Agent steps, and PaymentCallback/attempt identity for payment. W03 must define exact fields/constraints; current free-string references do not already satisfy this proposal. No zero-quantity fake stock movement as an operation marker: anchor to a real movement with deterministic root/child keys, or an existing non-stock parent record for no-movement operations. If existing storage cannot atomically preserve request hash and full result for every operation, obtain explicit design approval for C rather than ship a partial protocol.

Require operation type+tenant/café scope+caller operation key, authenticated actor, canonical payload hash, source versions and result references. Normalize Decimal strings/units using D02/D03 before hashing; include all effectful fields. Same key/same payload returns committed result after current access authorization; changed payload→409 conflict; in-flight conflict returns controlled pending/retry guidance. Persist key/result in the same transaction as movement/status; deterministic per-batch child keys. Retain financial/stock deduplication identifiers for the lifetime of retained business history, never auto-expire them while old requests can replay; PII payload retention is reviewed separately.

All stock writers lock ingredients by ID, then batches by ID (allocation ranking still D04; lock order is independent), then dependent rows under a documented common order. Re-read balances/state under locks; require conditional version/status updates and exactly one affected row. Use at most3 total transaction attempts for confirmed rolled-back serialization/deadlock failures with bounded backoff; unknown commit outcome is resolved by key on the authoritative DB before any re-execution. Unresolved outcomes stay pending/manual review. Separate after-commit side effects: best-effort scans may be rerun read-only; email/supplier/payment writes require their own durable dispatch/result protocol before enabling automatic retry.

**Trade-offs/risks:** B reuses schema but requires a disciplined dictionary and indexing; free-text overloading can become less maintainable than C. Keep scope explicit and reject inadequate storage. Lock contention is preferable to silent oversell. Key retention has storage cost. This proposal does not authorize changing27 tables or claim outbox delivery exists.

**Impact:** Every stock/order/receipt/count/waste/remake write, GoodsReceipt, InventoryTransaction, AgentExecution/ToolCall, PurchaseRequest creation, Payment/Callback; validators/controllers must carry key and expose replay/conflict/pending result. Operation lookup contract is proposed, not a live endpoint.

**Acceptance expected, NOT RUN:** TC-05-03/04, TC-03-03: same key replay after restart returns original references; changed payload409 zero writes; two sessions same key commit once; different keys competing for last stock preserve invariant. Inject failure at batch/aggregate/ledger/status/key writes→full rollback. Lost response after successful commit→lookup original result, no second write. Deadlock retry exhausts at3 attempts; auth denial cannot leak replay result. Verify side effects occur after commit and external uncertain writes are not blindly retried.

**Dependencies/owner:** Technical decision maker/DB lead owns representation/locking; owner confirms audit lifetime and manual uncertain-outcome handling. D02/D03 finalize canonicalization; the base protocol can be approved before them without enabling writes.

## D10 — Safe Agent authority, approval and execution budgets

**Status: OWNER_AGREED in principle; required formal approvals PENDING. Question:** Who approves an Agent write, what exactly is approved, may automatic scans write business data, and what stops loops or stale actions?

**Current evidence:** S9 exposes scanInventory(input,userId), recommendReorder(input,userId), createPurchaseRequestFromRecommendation(logId,userId), log/recommendation reads; system path LOG_ONLY. Gemini returns validated JSON rather than provider Tool Calling. S5 state/usage declarations do not prove durable workflow, approval or dispatch.

**Alternatives:** (A) autonomous purchasing under quantity caps; (B) read/recommend with active ADMIN approval for PR draft only; (C) read-only Agent permanently. **Recommend B:** preserve current exports as adapters to existing business services; add a server allowlisted/versioned registry, validated I/O and durable `RUNNING → WAITING_APPROVAL → RUNNING → terminal` state. System scans may read and append authenticated diagnostic/recommendation logs only, never create/approve/send/receive/pay PRs or adjust stock. ADMIN reviews the exact supplier/items/pack quantities/prices and explicitly approves draft creation. Creating PENDING PR is not approval of that PR; later approve/send/pay remain separate human service actions. No model-supplied role or arbitrary tool/SQL dispatch.

Server creates approval ID bound to action, proposal/execution ID, canonical payload hash, ingredient/supplier/price/open-PR versions, current approver, createdAt, expiry and D09 operation key. Proposed fixed approval lifetime15 minutes, single use but replay-safe; rejection/revocation/expiry or any effectful payload/version change invalidates it. Recheck current active ADMIN, ownership/action, versions and duplicate-open-PR condition inside the committing transaction. Client logId alone is insufficient. Record approval receipt/result in versioned AgentToolCall JSON, with execution key and enforced state transitions; existing JSON fields require contract review before use.

Proposed fixed initial budgets per execution: at most6 tool dispatches,2 provider requests,8000 total input+output tokens,60 seconds active compute (human wait excluded),1 business write. Provider request timeout20 seconds; read calls at most2 total attempts within these caps. Failed/unavailable token accounting permits no further provider call or write. After waiting for approval, revalidate and use remaining active budget; wait expires with approval. Unsupported provider controls or absent version/budget data fail closed. Exhaustion yields explicit failed/timeout or read-only rules fallback, never implicit purchase. Model/provider selection and measured monetary cap require the separate W03 experimental protocol; this proposal makes no provider-price assumption. Deterministic draft creation after valid approval needs no extra model call.

**Trade-offs/risks:** Human review adds delay; fixed budgets reduce configuration but may fail longer tasks. Six steps and fifteen minutes are proposed values, not observed defaults or stakeholder requirements. Reliable ingredient tools depend on the engine, not renamed legacy Product data. Durable approval JSON must stay versioned/validated; logs must redact secrets and avoid raw sensitive provider payloads.

**Impact:** AgentExecution/ToolCall, transitional AgentLog, User, SupplierIngredient, PurchaseRequest/Item and read-only Ingredient state; Agent public API, internal-auth, worker, service/repository and API Agent routes. Approval submit/reject/status and registry dispatch are proposed capabilities; direct conversion must pass the same gate.

**Acceptance expected, NOT RUN:** TC-02-03, TC-03-03 and future TC-08/09/10: approved current ADMIN creates one PENDING draft; STAFF/CUSTOMER/system/disabled/demoted approver and unknown tool deny zero business writes. Altered payload, stale supplier/stock/open-PR version, expired/revoked/rejected approval all deny. Concurrent approval replay/restart/timeout creates at most one draft. Budget boundary/excess and missing usage fail safely. Malicious model instructions cannot call approve/send/pay or exceed allowlist. Separate log writes from forbidden business writes in assertions. Existing guard mocks alone do not close this acceptance.

**Dependencies/owner:** D06/D09 and approved reliable inventory sources D02–D05; business write tools wait for their underlying service gates. Café owner decides authority/lifetime, security/backend lead approves protocol/budgets, supervisor approves academic tool/workflow scope.

## D11 — Payment attempts, settlement and reconciliation ADR

**Status: OWNER_AGREED in principle; required formal approvals PENDING. Question:** Does an order own one payment or multiple attempts, what marks paid, and how are retries/refunds handled without duplicate settlement?

**Current evidence:** S4 has Order.payments[] and TransactionStatus, while S6 historical orderId uniqueness and S7 singular `payment`/PaymentStatus expectations conflict. R3 REQ07 explicitly requires cardinality/status reconciliation; no new-schema/provider proof exists.

**Alternatives:** (A) one mutable Payment per order; (B) multiple immutable-attempt histories with one applied full settlement; (C) split tender/partial capture/partial refund. **Recommend B:** reuse Payment/PaymentCallback/PaymentReconciliation, unique(orderId,attemptNo), stable merchant reference and provider-scoped event/transaction identity. Permit only one unresolved active attempt; resolve uncertain old attempt before starting another. Each attempt is full frozen order amount in VND, whole đồng; no split tender/partial capture/partial refund initially. Preserve Order.paymentStatus as derived summary, update in the same settlement transaction, and expose attempts plus a compatibility summary DTO during transition. Reconcile SQL uniqueness/statuses with Prisma and generated client before enabling the API.

Cash settlement requires authenticated ADMIN/STAFF confirmation and operation key; online paid status requires verified provider signature, merchant/order/attempt reference, currency and exact amount against the server snapshot, never browser redirect success. Approved attempt progression: INITIATED→PENDING; AUTHORIZED optional; verified settlement→PAID; definitive nonpayment→FAILED/CANCELLED/EXPIRED. Timeout remains unresolved PENDING, not inferred failed; reconciliation resolves it. PAID cannot regress due to late failure events; verified full refund may transition PAID→REFUNDED with ADMIN authorization and distinct durable key. Reopening payment after refund requires a separate reviewed flow. A second genuine provider success is a duplicate-settlement exception for finance review/refund, never a second order settlement or silent discard. Callback audit preserves mismatches without applying them. Provider adapter-specific signature/events/refund validation must be documented before enabling that method; unsupported methods remain disabled.

**Trade-offs/risks:** B fits declared target relations and preserves history, but requires legacy API/SQL migration work and a duplicate-charge exception process. A loses attempt history; C increases accounting/state complexity. Refund and payment do not restore ingredients or alter preparation status.

**Impact:** Order, Payment, PaymentCallback, PaymentReconciliation; order/payment DTOs, checkout/create-attempt/callback/cash-confirm/refund/status/reconciliation workflows. Refund capability and provider contracts are future implementation, not current approvals. Supplier PR mark-paid is a distinct payable workflow and must not be conflated with customer settlement.

**Acceptance expected, NOT RUN:** TC-03-01 parity and future W07 tests: failed attempt then valid new attempt→one paid order with two historical attempts; duplicate verified event commits once; wrong signature/amount/currency/ref rejected zero settlement; timeout remains pending and blocks fresh charge until resolved. Late failed callback cannot regress paid. Concurrent successful callbacks apply one order settlement and flag the second real charge. Cash wrong role denied; replay cash/refund once; full refund leaves stock unchanged. Reconciliation reports missing/orphan/mismatch without inventing paid state. D03 fractional checkout incompatibility is rejected explicitly.

**Dependencies/owner:** D03/D09 and provider sandbox contract/credentials for later verification; café owner/finance role decides accounting/refund policy, payment/backend lead approves state/mapping, supervisor accepts scope.

## Recommended decision and implementation order

This is a dependency order, not authorization or a promised schedule. Decisions may be reviewed together; dependent writes stay blocked until the relevant choices and gates are explicitly accepted.

1. **Approve foundations:** D02, D04 and D09 base protocol; then D03. Record café walkthrough exceptions and real role assignments (W02-T01…03). Resolve canonical hashing after D02/D03; no cyclic dependency requires implementation first.
2. **Approve operational contracts:** D01, then D05 and D06; then D07/D08. Review D11 alongside the W03 data design, before freezing Payment cardinality; review D10 authority early, finalize it against D06/D09 and reliable data contracts. Sign each independently; a bundle approval must explicitly list the accepted IDs/options/version.
3. **Close W02/W03 design gates before engine writes:** version the approved SRS/BR/permission matrix,27-table/16-enum dictionary/ERD and ADRs; pin exact snapshot/reference/result/unknown-cost/count version fields, keys, FK/ownership constraints and API DTOs. Reconcile legacy batchId/legacyBatchId, performedBy/userId, servingUnit/unit, Product-vs-Ingredient stock and Payment cardinality. Unsupported legacy mappings remain quarantined. No extra allocation/idempotency/approval table is presumed approved by this register. If constrained reuse proves unsound, seek an explicit schema-scope decision.
4. **Close W04 migration safety separately:** repair the existing candidate's R3-reported MG05/06/07 findings in a separately authorized implementation task; obtain authoritative DDL and isolated DB target, backup/restore rehearsal preserving post-snapshot writes, parity and rollback evidence (TC-04-01…04). D01–D11 approval does not itself clear R3 W04 FAIL or authorize executing SQL. Physical DB remains untouched in R4.
5. **Implement and verify W05 core after gates:** D02/D03 unit/Decimal primitives and D09 transaction protocol → D01 Ingredient/Recipe CRUD/snapshots (W05-T01) → D04/D05 engine (W05-T02) → D06 GoodsReceipt (W05-T03) → real two-session race/fault evidence (W05-T04). All stock writers must use the same lock/invariant protocol; do not enable an unconverted side door.
6. **Integrate business services:** D08 item start/cancel/waste/remake and D07 count approval in W06 using the verified engine. D11 payment adapter/reconciliation is a separate W07 branch; refund integration depends on it. Preserve legacy behavior until the reviewed cutover, never silently double-write stock.
7. **Enable Agent progressively:** retain LOG_ONLY and prepare read/mock contracts while blocked. After business services, implement D10 registry/bound approval/durable workflow under D09 (W08/W09), then full permission/restart/E2E/freeze gates W10. No autonomous supplier send or payment is introduced. Dataset/baseline/model/prompt/budget approval and evaluation remain separate W03/W11 work, not closed by this register.

## Acceptance and approval handoff

All per-decision tests above are **expected tests, NOT RUN by R4**. Documentation review can support TC-02-01…04, TC-03-01/03 and TC-04-01 preparation, but cannot replace owner walkthrough/approval, PostgreSQL parity/race/rollback/restore tests or provider sandbox verification. W01 source inventory does not establish deployed behavior; W02 needs a frozen approved SRS; W03 needs exact representations/constraints and protocol; W04 needs real safety evidence; W05 needs all four engine deliverables. Follow [R3 task status](R3_TASK_STATUS.md) for actual task states, rather than resetting them from older weekly planning snapshots.

Future evidence must record source commit plus working-tree artifact hashes if dirty, schema/fixture/clock/provider versions, environment, procedure/command, inputs, expected/actual, timestamps, redacted logs and applicable invariant checks. Negative authorization assertions require zero forbidden business writes. Unit/mock results remain separate from PostgreSQL two-session and provider results. No weekly task or gate is closed here.

For **each D01–D11**, the approval record must contain decision ID, this document version/hash, exact selected option and parameter values, accepted exceptions/trade-offs, rejected alternatives, authorized person's name and role, decision timestamp, linked receipt/minutes/signature, and any explicit implementation conditions. Current values for all eleven: selected option **NOT APPROVED**, authorized person **UNKNOWN**, approval date **UNKNOWN**, receipt **NONE PROVIDED**, status **PROPOSED**. Conditional or partial acceptance must identify the precise approved sub-scope; it must not promote the whole decision. Missing names/receipts are not inferred from source code, a technical recommendation, supervisor silence or this task request.

Next action: café owner/authorized operational roles and technical reviewer review D02/D04/D09 foundations and the complete matrix, record explicit decisions, then version the SRS/ADRs and close prerequisite gates before implementation. Actual scheduling, staffing and academic approval receipts remain unresolved governance dependencies outside D01–D11.


## R5 superseding authority record — 2026-11-06

The project owner R5 chat instruction agrees in principle to all complete D01–D11 recommendations and parameters in this register. Status for every decision: OWNER_AGREED. Earlier proposal/NOT APPROVED wording describes R4 history, not current owner agreement. Owner personal name and exact timestamp UNKNOWN; evidence is the R5 instruction in this chat. Required stakeholder/technical/GVHD formal approvals remain PENDING: names, dates and receipts NONE PROVIDED; formally approved count 0. See [current draft contracts](R5_DRAFT_CONTRACTS.md) and [implementation evidence](R5_IMPLEMENTATION_REPORT.md). This does not approve migration, cutover or database writes.
