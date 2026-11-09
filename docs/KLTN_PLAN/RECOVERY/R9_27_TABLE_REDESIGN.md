# Recovery R9 — 27-table architecture redesign and feasibility

2026-11-06, Asia/Saigon. Version R9.1. **DESIGN_REVIEW_COMPLETE; FULL_REQUIREMENT_FEASIBILITY_NOT_ESTABLISHED; IMPLEMENTATION_BLOCKED.**

The binding target remains exactly **27 business tables and 16 ENUM types**, preserving every original target identity. R9 rejects R7's generic business journal inside Agent tables and does not select R8 C32. Existing domain records can support bounded snapshots, allocations, counts, receipts and payment attempts. **Complete D09 command history remains unresolved without expanding a table's responsibility or narrowing the command contract.** Agent proposal history and receipt granularity have additional explicit conflicts. These are not features silently removed to make the count fit.

This is a design/feasibility document, not executable DDL or evidence that constraints exist. D01–D11 remain agreed in principle in R5; no formal approval receipts are evidenced. All new persistence/concurrency acceptance cases are NOT RUN. No database connection, migration, schema modification, reset, rollback, provider call or live business write occurred. Only this document is created; pre-existing dirty work is preserved.

## 1. Evidence and actual dependencies

Reviewed [R4](R4_DECISION_REGISTER.md), [R5 contracts](R5_DRAFT_CONTRACTS.md), [R5 report](R5_IMPLEMENTATION_REPORT.md), [R6](R6_IMPLEMENTATION_REPORT.md), [R7](R7_SCHEMA_CONTRACT.md) and [R8](R8_ARCHITECTURE_REVIEW.md). R7 is a conditional/rejected candidate, not implementation authority. R8 C32 is an unapproved alternative. The following working-tree sources were inspected; deployed state is not inferred from them.

| Source, relative to repository | Actual observation / implication |
|---|---|
| `packages/database/prisma/schema/*.prisma`, nine files | 31 models /16 enum declarations. Mutable Recipe, scalar recipe references on OrderItem, nullable ledger attribution, scalar orderItemId without relation, ingredient-level count uniqueness. Agent models retain Agent meanings. |
| `schema/migrations/20260718025427_init_schema_and_unique_keys/migration.sql` beneath database Prisma | Historical15 tables/6 types; Payment_orderId_key is singular; ledger batchId references InventoryBatch with SET NULL, actor is userId. Not target parity. |
| `schema/migrations/20260724120000_add_product_detail_fields/migration.sql` | Product descriptive columns only, no recovery invariant fix. |
| `packages/database/prisma/migration_27_tables/00_precheck.sql`, `03_verify.sql` | CREATE/TRUNCATE/INSERT in migration_backup; not read-only probes. Not executed. |
| Same directory, `01_expand.sql` | Adds transactionStatus beside old payment status and nullable unique keys; no complete replay/approval/allocation constraints. Existing batch FK cannot be assumed retargeted. |
| Same directory, `02_migrate_data.sql`, `04_contract_DO_NOT_RUN_YET.sql`, `05_rollback_plan.sql` | Mapping exceptions use backup schema; contract drops four legacy identities with CASCADE; rollback drops target tables/columns and resets transactionStatus. New-write preservation remains unproved. |
| `apps/api/src/modules/order/order.repository.ts` | Singular payment include/create, Number totals, Product/Inventory reservations; updateStatus deducts legacy stock at completion. No ingredient snapshot/item-start persistence. |
| `modules/purchase/purchase.repository.ts` beneath API | receive re-reads request status but uses outer request.items quantityReceived; writes legacy stock, optionally without batches, merges by batchCode. Existing duplicate/sum validation is reusable but not a race/replay solution. |
| `modules/inventory/{inventory.repository,inventory.service}.ts` | Legacy Inventory locks/import/adjust, Product history and SupplierProduct dependencies. No Ingredient allocation writer. |
| `modules/payment/{payment.repository,payment.service}.ts` | findUnique(orderId), PaymentStatus and direct status update; cannot serve as verified attempt settlement. |
| `apps/agent/src/services/agent.service.ts` | logId/userId conversion parses recommendation JSON and checks CONVERTED_TO_PR; not payload/version-bound approval. System runScan remains LOG_ONLY. |
| `apps/api/src/common/{ingredient-policy,inventory-core}.ts`, R6 contracts | Reusable offline exact math, FEFO, requirements/canonical identities; no durable storage. Batch-only child key needs item+ingredient+batch+phase+ordinal for multi-item writes. |
| API/database package manifests | Shared database/types, Express/Zod, Prisma/client ^6.19.3, modular schema directory. Installed legacy client compatibility is not target-schema evidence. |

Also affected at future cutover: product creation creates Inventory; supplier mapping uses SupplierProduct; simulation/restoration is another stock writer; purchase email/log hooks and Agent repository use AgentLog; shared types/web/reporting assume legacy units, Number DTOs and singular payment. All callers need an explicit implementation inventory before switchover. No applicable AGENTS.md appeared in the workspace inventory. Physical catalog/grants/client parity remain UNKNOWN. Historical R6 14/14 core and108/108 in-process tests do not verify R9 persistence.

## 2. Exact retained inventory and ownership

No original target identity is renamed into a different responsibility, merged away or removed to offset additions. Relations below describe ownership, not implemented changes.

| # | Table | Responsibility / principal relationships |
|---|---|---|
| 1 | User | Principal/current authority; retained actor references |
| 2 | Category | Typed Product/Ingredient classification |
| 3 | Product | Sellable menu identity; Category/Recipe/OrderItem |
| 4 | Ingredient | Base dimension and stock aggregate |
| 5 | IngredientBatch | Physical stock partition with one origin/expiry/valuation |
| 6 | InventoryTransaction | Immutable real stock/reservation event |
| 7 | StockCount | Count document, submission and approval lifecycle |
| 8 | StockCountItem | One counted batch/version/result in a count |
| 9 | Recipe | Menu recipe version; conditional private variant option below |
| 10 | RecipeIngredient | Ingredient contribution/requirement in a recipe |
| 11 | Topping | Published menu option version |
| 12 | ToppingIngredient | Ingredient contribution in a topping |
| 13 | Order | Customer sale and checkout aggregate |
| 14 | OrderItem | Frozen sale line/preparation lifecycle |
| 15 | OrderItemTopping | Frozen selected topping/version/count/price |
| 16 | Supplier | Procurement counterparty |
| 17 | SupplierIngredient | Current supplier quote/conversion |
| 18 | PurchaseRequest | Procurement request/commercial authorization |
| 19 | PurchaseRequestItem | Ordered ingredient/packs/frozen conversion/quote |
| 20 | GoodsReceipt | Receipt document and confirmation outcome |
| 21 | Payment | Full-value payment attempt/settlement disposition |
| 22 | PaymentCallback | Provider event verification/application |
| 23 | PaymentReconciliation | Account/date reconciliation summary |
| 24 | AgentExecution | Actual AI run/budgets; conditional single approval envelope |
| 25 | AgentToolCall | Actual tool invocation and typed outputs |
| 26 | AgentEvaluation | AI evaluation evidence only |
| 27 | SystemSetting | Configuration only |

Final target excludes four transitional models: **Inventory, InventoryBatch, SupplierProduct, AgentLog**. Their eventual retirement is unexecuted and needs independent preservation/cutover authorization. Current source remains31. `_prisma_migrations` is infrastructure, not a business table. No backup schema, view, partition, Redis/file journal or external store may hide additional runtime business storage from the target count.

Exact16 enum types, existing labels unchanged: **UserRole, CategoryKind, InventoryTransactionType, WasteReason, StockCountStatus, OrderStatus, ConsumptionStatus, PaymentStatus, PaymentMethod, TransactionStatus, CallbackStatus, ToppingType, PurchaseRequestStatus, GoodsReceiptStatus, ExecutionStatus, ToolCallStatus**. Proposed finite discriminators use named TEXT CHECKs, not new ENUM types. They still require integrity/parity review.

## 3. Count-preserving alternatives

These are viable **bounded representations**, not two fictional complete solutions. No full27-table candidate is demonstrated. Selecting a restriction below requires an explicit decision; R9 does not amend D01–D11.

| Concern | A — frozen composition / real intake events | B — private recipe variant / one-item receipt | Feasibility boundary |
|---|---|---|---|
| Snapshot | Freeze menu Recipe/Topping inputs; OrderItem pins source/servings/calculation version, selections in OrderItemTopping | One sealed private Recipe variant per item with normalized requirement/omission/delta RecipeIngredient rows | A works for all-included recipes but lacks normalized arbitrary omission membership. B supports complete snapshot but expands Recipe responsibility, requiring approval |
| Reservation | Real RESERVE ledger anchor and one RELEASE/CONSUME terminal | Same design | D05 already chooses ledger reuse; no need to invent a competing allocation implementation |
| Receipt | Multi-item header; each IMPORT is whole-pack intake for one new batch, with frozen item/conversion attribution | One PR item per GoodsReceipt; packs/conversion on header, arbitrary base split among positive origin batches | A cannot split a pack across lots. B changes receipt granularity and has no durable multi-document delivery root |
| Replay | Immutable natural event/document plus fixed one-shot parent transition receipt slots | Natural resource versions where already meaningful, e.g. Recipe/Payment | Both support finite subsets; neither stores repeated arbitrary draft edits/rejections/history |
| Agent approval | One proposal/decision envelope per genuine execution; typed output on actual single-ingredient tool calls | Decision on actual pending create_pr_draft tool invocation, referencing typed prior calls | Both remain Agent-only for bounded proposals. B complicates pre-dispatch revoke/retry. Neither supports arbitrary lines/revisions without further representation |

Local recommendation: review B snapshot, D05 ledger, choose receipt restriction explicitly, and prefer A Agent envelope if its bounded proposal contract is accepted. Keep full D09 and unsupported lifecycles blocked. Synthetic toppings for omissions, fake zero movements, SKIPPED metadata calls, generic Agent execution kinds and unbound JSON/array histories are rejected.

## 4. Mapping conventions and S01 snapshots

Notation: ID=nonempty TEXT FK; V=nonnegative BIGINT; Q=NUMERIC(14,3); U=NUMERIC(18,4); M=NUMERIC(14,2); TS=TIMESTAMPTZ(3); H=64 lowercase hex SHA-256; `?` nullable. Proposed fields are required for new-contract rows unless conditional. Reject scale/overflow before effects. IDs/ownership are typed FKs, never authoritative JSON paths. History FKs use RESTRICT, with referencing indexes. Tagged shapes explicitly handle NULL; SQL UNKNOWN must not accidentally pass a CHECK.

Prisma declares supported composite/scalar relations and uniqueness. SQL-only exclusion/partial indexes, deferred sums, immutability and privileges need a versioned parity manifest in a later authorized task. Each invariant has a domain owner, not one global Agent/business trigger framework.

| Table | Proposed fields/relations | Constraint / mutation owner |
|---|---|---|
| Product | rowVersion V | Menu locks Product for publication; no overlapping published MENU effective intervals [from,to), enforced with exclusion or serialized publish plus DB guard |
| Recipe | purpose CHECK MENU/ITEM_VARIANT; sourceRecipeId? self-FK; publishedAt?; sealedAt?; calculationVersion?; servings?; contentHash? | MENU no source, positive yield, partial unique(productId,version). Variant source is published MENU of same Product, positive servings, never menu-selectable, no variant chain; freeze content/children at seal |
| RecipeIngredient | Existing ingredient FK/unique(recipeId,ingredientId); sourceLineId? self-FK; omitted BOOLEAN; deltaNumerator/deltaDenominator NUMERIC(38,0)? | MENU positive. Variant normalized base quantity>=0; optional omission only against optional source; retain zero lines. Canonical rational denominator>0; calculator rejects overflow before writes |
| OrderItem | recipeId -> sealed variant; source version/yield scalars; rowVersion; contractVersion; immutable quantity/product/price | **One-way ownership**: unique(recipeId) for new variant items; composite(recipeId,productId) FK. No Recipe->OrderItem FK/cycle. Deferred exactly-one-owner guard prevents orphan new variant at commit; source scalars/servings match sealed recipe |
| Topping / ToppingIngredient | publishedAt, version, contentHash; frozen published children | Changes create new Topping ID; selection requires applicable published ADD. REMOVE/SUBSTITUTE remain disabled |
| OrderItemTopping | unique(orderItemId,toppingId), selectionBasis CHECK LINE_TOTAL, positive count, frozen price | Seal freezes selection; count applies to whole item line, pending owner confirmation |
| Ingredient | immutable baseUnit once used, CHECK g/ml/piece | No density conversion; piece exact requirements integral; inactive flag never changes historical unit |

Creation transaction selects exactly one current recipe under publication locks, validates sources/omissions/toppings, calculates using R6, inserts private variant/lines and item/selections, validates and seals before commit, then reserves atomically if integration is enabled. Menu APIs must filter MENU at repository boundary; private rows belong to Sales history and cannot be published or selected. This is a deliberate related-purpose extension, not proof of original menu-only single responsibility. If strict menu-only Recipe identity is mandatory, B is rejected and full S01 remains unresolved within27.

For each ingredient i: exact_i = source_i * servings/yield + sum(selected ADD effects); omission removes only the optional source contribution. target_i=HALF_UP(exact_i,0.001); delta_i=target_i-exact_i. Store zero requirements and rational deltas; piece exact_i must be integral. Sealing guard checks computed aggregate against frozen inputs. Rational capacity needs overflow fixtures, not a claim of unbounded NUMERIC capacity.

Alternative A uses immutable sources plus pinned algorithm version to reproduce exact quantities, avoiding mixed Recipe kinds. It is safe for all-included inputs with frozen selections, but cannot represent arbitrary omitted source lines using current child identities. Rejecting omissions globally would narrow D01. Mutable recipeVersion alone or today's algorithm does not preserve a snapshot.

## 5. S02/S05 allocations and transaction invariants

| Table | Mapping | Constraint |
|---|---|---|
| IngredientBatch | reserved Q default0; rowVersion V; unique(id,ingredientId); immutable origin | STOCK_BALANCE: 0<=reserved<=quantityRemaining; physical>=0 |
| InventoryTransaction | mandatory ingredientId/batchId/performedBy for live events; OrderItem relation for allocations; allocationId? self-FK; unique deterministic childKey; positive magnitude quantity; physicalDelta/reservedDelta Q | EVENT_SHAPE determines exact signs/zeros and required/forbidden typed sources; legacy free references descriptive only |
| Same | Terminal composite FK/guard to RESERVE with identical item/ingredient/batch/quantity | ALLOCATION_TERMINAL: partial unique(allocationId) across RELEASE/CONSUME; no partial terminal or terminal-of-terminal |
| Same | goodsReceiptId?, purchaseRequestItemId?, stockCountItemId? typed FKs | One applicable real source; ownership matching receipt/item/ingredient enforced by composite FKs/guard |
| Ingredient | quantity/reserved caches, rowVersion V | STOCK_SUM: quantity=sum(batch physical), reserved=sum(batch reserved); batch reserved=sum(open allocations); physical reconciles opening basis + immutable deltas |

Delta matrix: RESERVE=(0,+q), RELEASE=(0,-q), CONSUME=(-q,-q), IMPORT=(+q,0), WASTE/RETURN=(-q,0); ADJUSTMENT signed physicalDelta with abs(delta)=q, reservedDelta0. Live zero movements forbidden. Legacy ORDER/CANCEL/DAMAGE/SIMULATE_SALE require reviewed mapping or denial, never in-place reinterpretation. Zero count variance belongs to count result, not ledger.

Inventory is sole stock mutation owner. Protected mutation functions/adapters atomically update events, batch/ingredient caches and versions; narrow deferred constraint triggers validate touched sums at commit. Runtime role cannot directly write protected tables, disable guards or bypass trusted entrypoints. Function owner/search_path/EXECUTE grants need review. Prisma transaction alone cannot prevent another writer's bypass.

Concrete FK support: add unique(id,ingredientId) on IngredientBatch; unique(id,recipeId,ingredientId) on RecipeIngredient; unique(id,productId) on Recipe; unique(id,orderItemId,ingredientId,batchId) on InventoryTransaction. Terminal `(allocationId,orderItemId,ingredientId,batchId)` references that ledger tuple, with source-type/quantity checked under the allocation lock. Variant sourceLineId must reference its own source recipe/ingredient tuple, not merely any existing recipe line. Topping-only requirements have no sourceLineId and cannot be marked omitted. Receipt/count event attribution needs the corresponding parent/item composite tuple; independent valid FKs alone are insufficient. Waste/return/negative adjustment cannot reduce physical below reserved. No caller may directly choose cached reserved deltas or use a free reference string to satisfy a typed source requirement.

Invariant sketch: physical100/reserve18 ->100/18; release ->100/0; consume instead ->82/0. Allocation lock plus terminal uniqueness prevents release+consume. Ingredient lock serializes FEFO reservation decisions even when new batches appear. Recheck expiry at start; replacement writes RELEASE old + RESERVE new + CONSUME new atomically. If replacement cannot cover full target, roll back all and block start, preserving old allocation. Reallocation creates new identities; never edits reservation history. Started cancellation classifies loss on item, does not consume again; refund never restores inventory.

## 6. S03 durable replay — explicit limit

Do not store manual operations in AgentExecution/AgentToolCall/AgentEvaluation, SystemSetting, fake ledger rows or fabricated PaymentCallback events. Agent availability/retention/budgets cannot determine business replay.

For a **fixed one-shot** real transition, its owner may have individually named immutable receipt columns: scope, key, actor FK, requestHash, canonicalVersion, completedAt, resultVersion and frozen bounded result projection. Examples: StockCount approval, GoodsReceipt confirmation, OrderItem start, Payment attempt creation. Unique `(scope,commandKind,key)`, not key+hash. Each slot is one transition, never a mutable last-operation journal. Current authorization precedes replay; changed hash409, same hash returns exact old result after restart even if live resource changed. Typed FKs remain authoritative; validated result JSON is a presentation copy only. Maximum response size/PII/retention policy must be fixed before implementation; oversize is rejected before effects, never truncated after commit.

For individually named slots, commandKind is fixed by the slot and namespace includes its domain endpoint. A partial unique(scope,startKey), for example, spans **all** OrderItem rows with a start receipt, not merely one item's keys; the same scoped start key cannot operate on another item. The hash binds that item, actor, effectful input and expected versions. Receipt NULL shape is all-or-none, immutable after commit. Slots on different tables cannot claim a global cross-domain key namespace without an additional registry; the proposed bounded namespace explicitly does not do so. Replay lookup cannot recompute a result from today's costs or child status.

| Command family | Genuine owner / bounded representation | Uncovered requirement |
|---|---|---|
| Order create/final cancel, item start/void | Order/OrderItem one-shot receipts; typed item/ledger children | Arbitrary amendment/rejected-command histories |
| Count submit/approve/cancel | StockCount fixed receipts; zero variance retained without movement | Repeated DRAFT edits and distinct stale failures |
| Receipt create/confirm | GoodsReceipt real document/confirmation | Repeated edits, corrections and complete multi-document delivery result |
| Payment attempt/provider event | Payment/PaymentCallback real attempt/event identities | Arbitrary commands cannot be disguised as provider callbacks |
| Recipe publish | Actual immutable Recipe version | Ingredient/PR/draft changes are not recipe versions |
| Manual one-batch import/waste | Real stock event may hold its bounded command result | Multi-batch root/no-op/rejected command has no real event root |

Decisive counterexample: Ingredient edit K1 ->name A/result version2, K2 ->name B/version3; restart; replay K1. Current row cannot reconstruct K1's exact result, and last-key slot loses it. N fixed slots fail at N+1. No AI run/stock movement occurred. Appending JSON/arrays recreates a journal. This also affects PR/receipt/count draft edits and retained no-effect rejections. Consequently fixed slots **do not satisfy full D09** enumerated in R7/R8.

Natural versions are viable where records already represent versions (Recipe, Payment attempt). Making every Ingredient/Order/PR row a tagged revision would broaden identities, complicate all current FKs/uniqueness and create a new history engine; not approved here. Durable external storage would change the storage/count contract and is not a hidden substitute. This is a concrete feasibility failure, not proof that no conceivable27-table architecture exists.

Bounded protocol: acquire owner/key lock, compare canonical hash, persist all effects+full response atomically, then respond. Creation uses unique scoped create key on real resource or validated opaque client resource ID. Child identity is canonical tuple(item,ingredient,batch,phase,ordinal), not delimiter concatenation. At most3 confirmed-rollback attempts; unknown commit requires authoritative lookup before re-execution. Uncovered operations stay disabled. Email/provider effects are outside SQL atomicity; Payment intent/reference plus provider idempotency/lookup can support reconciliation, but PR_SEND/refund uncertain-outcome orchestration still needs an explicit durable contract. An in-memory cache is insufficient.

## 7. S04 Agent-only approval

Preferred bounded option: one immutable proposal/approval envelope on a **genuine AgentExecution**; typed proposal output on actual AgentToolCall invocations. Every tool row remains a real invocation with truthful stepNo/status/usage. No PROPOSAL_LINE/VERSION_BINDING fake rows or SKIPPED metadata. AgentEvaluation remains untouched.

| Owner | Typed additions | Guard |
|---|---|---|
| AgentExecution | proposalVersion/hash, supplierId FK/expectedSupplierVersion; nominatedApproverId FK/authVersion; approvalCreatedAt/expiresAt; decision CHECK PENDING/APPROVED/REJECTED/REVOKED/EXPIRED/CONSUMED; decisionAt/consumedAt; resultingPurchaseRequestId unique FK; rowVersion | Exactly one frozen proposal/run; expires at15min; active current ADMIN at decision/consumption; conditional terminal transition; consumed iff exactly one linked PENDING PR commits |
| AgentToolCall, actual single-ingredient recommendation/read invocation | proposedIngredientId FK, supplierIngredientId FK, expectedIngredientVersion/mappingVersion/openPrVersion, whole packs, frozen conversion/unit/quote | Composite guard matches execution supplier/mapping ingredient; positive whole packs/MOQ; immutable source output. Json only diagnostic, not authoritative line storage |
| User/Supplier/SupplierIngredient/Ingredient | authority/row/openPr versions as relevant | Every relevant auth/stock/quote/open-PR writer increments the guarded version under locks |
| PurchaseRequest | originatingAgentExecutionId? unique FK | Manual PR NULL, never depends on Agent. Agent write consumes exact proposal; Purchasing owns commercial validation; no automatic approve/send/pay |

Lifecycle: read ->freeze proposal ->WAITING_APPROVAL ->ADMIN decision ->lock/recheck authority/expiry/revoke/all versions ->create one draft and consumed link/write result. Two consumers serialize on execution; loser replays same PR. Demotion, expiry, stale mapping/open PR or revoke yields zero PR effects. Proposal cannot mutate after approval. Legacy logId conversion cannot bypass this. System worker stays LOG_ONLY.

Limits are explicit: one proposal/run; one typed ingredient output per actual invocation. Six dispatches including one write allow at most five separate line-producing calls; two provider calls/time/token limits may constrain further. One actual call returning8 lines cannot be represented by eight fictional calls. Arbitrary proposal cardinality, revisions/decision history in the same run and unbounded source guards remain unresolved. New genuine run for revision is a possible workflow restriction needing approval, not an automatic fix.

Alternative: approval scalars on actual pending create_pr_draft call referencing prior typed calls. It preserves Agent meaning but complicates approval-before-dispatch, revocation and retry identity. Same one-use guards apply; retries cannot create new consumable approvals. Execution envelope is clearer for review. Neither option proves unrestricted D10.

Retain D10 caps6 dispatches/2 provider calls/8000 tokens/60s active time/one write, provider timeout20s/two read attempts. Waiting is separate from active time; persisted accounting protocol remains to specify. No Agent budget applies to manual business commands.

## 8. S06 procurement, counts, cost and payments

### Receipts

PurchaseRequestItem freezes mandatory ingredientId, supplierIngredientId FK, ordered integer packs, quote/unitPrice, purchaseUnit/baseUnit, basePerPack Q>0, mappingVersion and rowVersion. Require 0<=quantityReceived<=quantity; freeze commercial content at commitment. Composite(id,requestId,ingredientId) supports receipt attribution; mapping supplier must equal PR supplier. Current quote edits cannot change history.

**A — multi-item, whole-pack intake:** real IMPORT owns receipt/item/batch FKs, receivedWholePacks positive integer and frozen conversion. Each new batch initial quantity=its packs*conversion; sum intake per item cannot exceed remainder. No line-anchor/self-links or draft batches. This is coherent real ledger use, but cannot represent four250g packs split350g/650g across lots. Whole-pack-per-lot restriction requires approval.

**B — one-item GoodsReceipt:** add purchaseRequestItemId/ingredientId, receivedWholePacks, frozen quote/conversion/unit to receipt header; composite FK matches same PR/item. Positive origin batches reference receipt/item/ingredient. Deferred RECEIPT_SUM: sum(batch initial)=packs*conversion. Batch base splits may be350/650; they are not pack counts. GoodsReceipt stays a receipt document, but narrowing to one item requires approval. deliveryReference groups reports only, not a hidden shipment header. A multi-document service transaction has no full durable delivery replay root until S03 closes.

Example: order10 packs*250g, receive4 ->1000g, remaining6. B permits350/650, A requires whole-pack splits such as500/500. Concurrent receive6+6 locks fresh PR/item remainder: one commits, never12. Invoice reuse across different deliveries is permitted; not replay identity. Drafts create no stock. Confirm freezes receipt; new delivery of same supplier lot creates a distinct internal batch/valuation partition, never merges by batchCode. Actor receivedBy becomes User FK; STAFF/ADMIN receipt authorization is checked.

Confirmed correction remains unresolved: must retain original intake, reverse only permissible real stock, decide pack/payable attribution, PR reopening and replacement links. Consumed/reserved lots cannot be rewritten. Supplier return does not implicitly correct received packs. Neither candidate proves unrestricted multi-item/arbitrary-split/correction lifecycle within27.

### Counts

StockCount adds rowVersion/submittedAt/selfApprovalReason and fixed approval receipt. StockCountItem adds batchId FK, expectedBatchVersion/expectedIngredientVersion, systemPhysical/systemReserved/actual/variance Q, optional unique adjustmentId FK. Replace unique(count,ingredient) with unique(count,batch); composite(batchId,ingredientId) FK. Submit freezes rows; variance=actual-systemPhysical, actual>=0. Approval locks/checks both versions and actual>=current reserved. Current ADMIN required; owner self-count exception needs explicit reason/policy. STAFF cannot approve.

500->480 creates one -20 ADJUSTMENT/cache update; zero variance completes count and stores approval result with no movement. Any intervening stock/reservation version change rejects stale count. Revised document/submission policy and repeated rejected-command receipts still depend on S03. Count rows cannot become Agent proposal lines or generic operation records.

### Costs

Nullable costs plus explicit completeness distinguish UNKNOWN from known0 on batch/movement/item. Preserve exact extension/basis and visible rounding delta. Proposed valuation boundary is allocation; consume retains it, expiry replacement uses new allocation basis. Finance must approve. Aggregate exact extensions before item HALF_UP money2, then sum stored item totals. Procurement pack total versus rounded four-decimal base cost has explicit delta; never fabricate legacy profit.

Mixed ingredient/topping contributions across differently priced lots require a conserved component-attribution algorithm. Known total COGS does not prove known component subtotals. Withholding components as NULL requires approval; do not silently narrow D03. Cancellation after start is loss classification, not second consumption. Whole-VND checkout incompatibility and zero-value/no-charge policy remain open.

### Payments

Payment remains one full-value attempt: unique(orderId,attemptNo), monotonic attemptNo under Order lock, frozen amount/currency/reference. External providers require providerAccountKey; unique(account,merchantRef), partial unique(account,providerTxnId). Callback event identity becomes(account,eventId); verified signature/ref/amount/currency/account required before effects, raw JSON diagnostic only.

Add appliedAt plus disposition CHECK UNRESOLVED/APPLIED/FAILED/EXCEPTION/REFUNDED with explicit TransactionStatus consistency. Partial unique(orderId) for UNRESOLVED; partial unique(orderId) where appliedAt IS NOT NULL, retained through refund. Actual second charge remains EXCEPTION, not deleted or applied again. Provider truth differs from order settlement disposition. INITIATED/PENDING/AUTHORIZED/unknown outcome stay unresolved; timeout alone never permits a new charge.

Canonical Payment.status uses TransactionStatus; Order.paymentStatus is derived compatibility summary. Audit old status/transactionStatus columns and singular index before any future cutover. Remove direct SUCCESS/status PATCH from verified settlement path. Verified callback applies attempt+order+event atomically; duplicate replays, late failure cannot regress paid. Failed then new attempt keeps both histories. Full refund can have one immutable authorization/result slot on settled attempt if exactly one full refund is supported; never clears appliedAt, restores stock or reopens sale. Repeated failed refund command history/unknown provider outcomes still need S03. PaymentReconciliation remains account/date summary, with account namespace and resolvedBy User FK, never a command journal.

## 9. Workflow ownership and transaction boundaries

Menu owns publication, Sales item/snapshot lifecycle, Inventory all stock events/caches, Purchasing PR/receipt conversion/commercial balances, Payments attempts/settlement, Agent proposals/budgets. Agent delegates validated draft creation to Purchasing; manual business services never import an Agent journal. Reuse R6 math/FEFO, auth and receipt validation, replacing persistence adapters rather than duplicating business rules in tools.

Proposed hierarchy for operations touching several owners: User authority rows sorted IDs; AgentExecution if present; Order; PurchaseRequest; count/receipt parents in fixed table-rank+ID order; Product; Supplier/mappings; Ingredient sorted IDs; IngredientBatch sorted IDs; allocations sorted IDs; insert events/results. Payment paths lock Order before Payment/Callback. Discovery reads are unlocked then revalidated under locks; discover all touched ingredient IDs before acquiring stock locks. No PR->Agent or Ingredient->required Product/PR inversion. This is a proposed protocol, **not a deadlock proof**; all-writer traces/two-session evidence required.

| Workflow | Atomic boundary | Failure / external boundary |
|---|---|---|
| Publish | Product lock, overlap/content validation, header/children freeze | At most one applicable publication |
| Order create | Source validation, sealed snapshots/selections, all-item FEFO reserve, bounded create result | Insufficient stock/overflow rolls back all variants/items |
| Item start | Expiry/reallocation, terminal consumes, caches, item state/cost/start receipt | No remote calls under locks; completion cannot deduct again |
| Cancel | Unstarted release once; started loss classification; bounded item/order receipt | Refund separate authorization |
| Receive | Fresh PR/item remainder, receipt/batches/imports/totals/versions/result | Emails/Agent scan after commit; unknown commit lookup before retry |
| Approve count | Authority, frozen versions, all adjustments/caches/status/result | Zero variance durable without movement; fault rolls back all |
| Agent consume | Authority/proposal guards, one PENDING PR, consumed link/truthful tool result | No SMTP/provider call while locked |
| Payment event | Verified event, order/attempt guards, settlement/callback/summary | Provider intent/reference and lookup outside transaction; unknown outcome reconciles |

Several domain receipts in one transaction do not supply a durable generic root response. No outbox/key registry is hidden in these boundaries. Operations lacking representation remain blocked.

## 10. S01–S06 disposition and R8 comparison

| Finding | R9 disposition | Remaining blocker |
|---|---|---|
| S01 | Conditional one-way private Recipe variant supports normalized snapshots; strict frozen composition viable subset | Recipe responsibility extension, LINE_TOTAL meaning, seal/overflow proof/history mapping |
| S02 | Real allocation anchors/one terminal/composite FKs | SQL parity and actual race/restart tests |
| S03 | Bounded real-domain receipts specified; **full D09 unresolved** | Repeated edits/no-effect histories/multi-resource root response |
| S04 | Genuine-run approval envelope/actual typed tool outputs for bounded proposal | Arbitrary line/revision/history representation; persisted usage contract |
| S05 | Domain-owned checks/versions/locks/protected mutation/deferred sums | All-writer switchover/grants/client/catalog parity/concurrency evidence |
| S06 | Per-batch counts/attempts feasible; two receipt alternatives and explicit unknown cost | Receipt scope/correction, component attribution, zero checkout/refund/provider policies and S03 |

| Dimension | R9 count-preserving direction | R8 C32 |
|---|---|---|
| Count | Original27/existing16, no exception | Original27 + BusinessOperation + OrderItemIngredientSnapshot + GoodsReceiptItem + AgentApproval + AgentApprovalItem =32/16, unapproved |
| Agent isolation | Manual commands entirely independent; bounded real-run approval | Dedicated Agent approval header/lines, actual calls remain pure |
| Snapshot | Related-purpose private recipe extension needs explicit acceptance | Dedicated item ingredient rows reduce menu coupling |
| Receipt | Whole-pack-per-lot or one-item-document restriction | Dedicated receipt lines support arbitrary item/lot splits |
| Replay | One-shot real-resource receipts; repeated-command history unresolved | Independent operation identity/result covers no-movement and repeated commands |
| Integrity | Specialized guards/restrictions and more domain receipt code | Simpler ownership FKs, but same concurrency/stock/retention/cutover proof required |
| Selection | Retain27 and document unresolved full feasibility | Do not automatically adopt; separate explicit count exception required |

C28 journal-only removes the largest D09 conflict but leaves snapshot/receipt/Agent-line questions. It is not selected as fallback. R9 does not prove mathematical impossibility at27; it demonstrates that no complete maintainable candidate has yet met all obligations without responsibility expansion or approved restrictions. Table count alone is never a validity proof.

## 11. Testable counterexamples and evidence plan

All are NOT RUN design acceptance intentions. Test service paths and direct SQL under runtime grants; mocks/typechecks cannot prove these database properties.

| ID / trace | Adversarial fixture | Required result / exposed limit |
|---|---|---|
| R9-01 S01 D01–03 | yield2 coffee36g/milk300ml, servings3, ADD/optional omission |54g/450ml before selected effects; aggregate rounding once; mandatory omission denied; zero/delta history retained |
| R9-02 S01 | Edit source/topping child after sale; wrong-product or second-item variant; concurrent overlap | Immutable history, FK/ownership denial, one publication |
| R9-03 S01-A | Omit milk with same pinned recipe and no membership record | Demonstrates composition-only candidate incomplete; note/JSON shortcut rejected |
| R9-04 S02/S05 | Two sessions reserve last18 of18, restart | One succeeds; allocations reconstruct caches exactly |
| R9-05 S02 | Release/consume race, terminal wrong batch/item/quantity | Exactly one matching terminal; foreign links denied |
| R9-06 S02 D04/D08 | Reserved lot expires at café midnight, replacement insufficient; crash after release | Whole start rollback; no partial consumption/lost reservation |
| R9-07 S03 D09 | K1 edit A, K2 edit B, restart/replayK1; N+1 edits for N slots | Exact old result required; fixed slots fail full contract |
| R9-08 S03 | Same-key concurrent retry, changed hash, unauthorized lookup, lost committed response | Once-only effect, immutable exact result,409/no leak for covered transitions |
| R9-09 S03/S06 | Zero count variance; distinct stale edit failures | Real count result/no movement; missing rejection history remains blocker |
| R9-10 S04 D10 | Demote ADMIN,15min boundary, mapping/open-PR/stock change, revoke/consume race | No unauthorized PR, exactly one PENDING draft on valid winner |
| R9-11 S04 | Actual invocation returns8 lines; create8 fake call rows | Reject bounded representation; never fictional dispatch/unchecked JSON authority |
| R9-12 S04 | Amend approved proposal/retry consumed write | Old approval cannot bind new content; same PR replay; revision history still unresolved |
| R9-13 S05 | Protected DML, wrong composite FK, zero adjustment; fault at every event/cache/state/result write | Denial/rollback, conserved sums; no partial result |
| R9-14 S06 D06 | PR10*250g, receive4 split350/650; concurrent6+6; repeated invoice | B accepts1000/remainder6, A rejects split; one6 succeeds; invoice not dedup |
| R9-15 S06 | Same supplier lot delivered twice at different prices; correction after consumption | Separate physical origins/valuation, no rewritten COGS; unsupported correction blocked |
| R9-16 S06 D07 |500->480 count, reservation after submit, self-count without reason | -20 once only if current/covered; stale/self-approval denied; zero count no movement |
| R9-17 S06 D03 |10g*200+8g*250+30ml*30; UNKNOWN/0;1/3 vs3/3; mixed topping cost |4900; unknown distinct;0.333/1.000; component totals cannot double count |
| R9-18 S06 D11 | Failed/new attempt; pending timeout; duplicate callback/second charge/late failure | Histories retained, one unresolved/applied, unknown blocks retry, exception preserves charge, no paid regression |
| R9-19 S06 | Event ID reused across merchant accounts; wrong signature/ref/amount/currency; refund retry | Account scope; invalid event no settlement; stock unchanged; uncertain provider lookup required |
| R9-20 All | Restore old snapshot after new writes; compare actual catalog/client | Preserve new history/keys; exact27/16 and complete constraint/grant parity |

Future evidence: pure formula/overflow fixtures, approved schema generated-client/DTO checks, isolated PostgreSQL two-session races, process kill/restart and lost-response faults, runtime-role bypass attempts, invariant queries, restore preserving post-snapshot writes. Do not execute current precheck/verify to obtain observational evidence. Historical R6 tests/socket limitations remain separate.

## 12. Preservation, conflicts and recommendation

Preserve raw legacy IDs, batch/actor/unit/timezone provenance, quantities/prices/payment statuses/provider refs, Agent diagnostics, unknown mappings and post-snapshot writes. Do not fabricate ingredient consumption from Product sales, old snapshots/approvals/replay responses or known costs. Unmapped history remains read-only and blocks affected cutover; new records cannot exploit LEGACY exemptions. Actor retention/pseudonymization must preserve attribution rather than SET NULL.

Future implementation must reconcile userId/performedBy, legacy/current batch FKs, singular payment index/relation, status/transactionStatus and Number/Decimal DTO mismatches. Keep four legacy tables until dependencies/preservation are proved. Existing destructive contract/rollback candidates are not repaired or authorized here. No dual decrement; no restore overwriting newer history; full field/FK/index/check/trigger/grant/client parity required.

| Conflict | Explicit decision needed | Disposition |
|---|---|---|
| U1 Full D09 | Demonstrate count-preserving durable command history respecting responsibilities, or explicitly amend requirements/count | No complete safe representation demonstrated; full dependent writes blocked |
| U2 Recipe identity | Accept private sealed variants/one-way ownership or supply strict menu-only snapshot/omission alternative | Proposed related-purpose extension, not approved |
| U3 Agent proposal/history | Accept bounded actual outputs/one proposal per run or supply arbitrary line/revision storage | No fake calls/generic metadata; unrestricted feature blocked |
| U4 Receipt lifecycle | Choose whole-pack-lot restriction or one-item receipt; resolve full correction/pack/payable/reopening | Neither restriction silently accepted; confirmed correction blocked |
| U5 Finance/provider | Approve valuation/component attribution, zero checkout, merchant namespace/refund/unknown outcomes | Mechanisms outlined, contracts pending |
| U6 Integrity/preservation proof | Formal selected contract, all-writer/grant parity, actual race/fault/restart/restore evidence | Physical state UNKNOWN; no weekly gate cleared |

Recommendation: retain27/16 and absolute Agent isolation; prioritize U1 before implementation because local snapshot/receipt improvements do not solve complete durable replay. Resolve U2–U5 against these counterexamples, then publish one field-complete selected contract and acceptance manifest. **Do not implement R7, adopt C32, reduce requirements or modify Prisma/SQL by implication.** A narrower approved27-table scope may be feasible but is not the full original contract.

Implementation readiness: **BLOCKED for schema/dependent business writes**. The requested feasibility document is complete; the architecture is not labeled valid/approved. Next action is a versioned decision record closing the conflicts, not migration execution. No permission question is necessary to deliver this architecture-only artifact.
