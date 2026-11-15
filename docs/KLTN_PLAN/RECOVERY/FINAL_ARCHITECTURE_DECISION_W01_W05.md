# Week 01–05 final architecture decision

2026-11-07, Asia/Saigon. Status: **DECISION PROPOSAL — OWNER APPROVAL PENDING**.

Recommendation: retain the binding **27 business tables / 16 ENUM types** and approve the bounded release below. This is an explicit reduction of release scope, not fulfillment of full D09. If full D09 is mandatory for this release, the 27-table proposal must be rejected and the authorized decision maker must approve the single-table BusinessOperation exception (28/16). Neither approval is evidenced. No implementation or weekly acceptance gate is cleared by this document.

Authority: [R9 U1–U6 and sections 4–8](R9_27_TABLE_REDESIGN.md), [D09 and decision owners](R4_DECISION_REGISTER.md), [agreed-in-principle contracts](R5_DRAFT_CONTRACTS.md), and [R8 C28 comparison](R8_ARCHITECTURE_REVIEW.md). R9 supersedes the rejected generic Agent journal representation. This record makes a bounded decision proposal using those findings; it does not reopen architecture discovery or initiate another recovery round.

## U1: exact D09 release boundary

“Supported” below means a feasible proposed representation requiring implementation and acceptance evidence, not a capability verified in the current application. The positive command allowlist is exhaustive; an unlisted write is disabled pending a separately approved contract.

| Supported command | Durable owner and boundary |
|---|---|
| Create Order with frozen items and reservations | One Order creation receipt; typed item/snapshot/allocation children in the same transaction. Frozen creation response survives later item changes. |
| Start or void one item; final cancel one Order | Individually named, immutable OrderItem/Order transition receipts. Start includes expiry replacement and consume atomically; cancel releases unstarted reservations and classifies started loss without restoring stock. |
| Create and publish a new immutable Recipe version | Genuine Recipe version with distinct creation/publication receipts. No mutable published children. |
| Create a complete PurchaseRequest draft | One PurchaseRequest creation receipt; whole-pack lines and frozen commercial inputs. Release exposes no later edit/approve/send/pay command. |
| Create complete StockCount draft; submit, approve or cancel once | StockCount creation and separate transition receipts; submitted batch lines frozen. Zero-variance approval stores its result on the count, with no fabricated movement. |
| Create complete one-item GoodsReceipt draft; confirm once | GoodsReceipt creation/confirmation receipts; one PR item, positive whole packs, arbitrary positive base-quantity lot splits. Confirmation atomically writes all batches/imports and received totals. |
| One-batch manual import or waste | Exactly one real InventoryTransaction owns command identity/result and its stock effect. No zero movement or multi-batch command root. Receipt-origin stock must use GoodsReceipt instead. |
| Create a full-value CASH Payment attempt and settle it once | Payment creation/settlement receipts; locked Order, immutable amount/currency, one applied settlement. No external dispatch. No-charge checkout is excluded. |

Each endpoint has a fixed command namespace and a scope-wide unique key across all rows of its owner table, not just per resource. No global cross-endpoint namespace is promised. Key reuse with changed payload yields 409; same key/hash returns the exact frozen result after current authorization, including after restart. Hash includes actor, target, expected versions and all effectful canonical input. Effects, deterministic child identities and the bounded complete response commit atomically. Named slots cannot be overwritten. Retain keys/results for retained business-history lifetime; approve response-size/PII limits before implementation and reject oversize before effects. At most three confirmed-rollback attempts; unknown commit requires authoritative key lookup before re-execution.

Validation, authorization and stale-version failures remain safe zero-effect responses, but this proposal **does not retain and replay distinct rejected-command outcomes**. They must never occupy a successful transition slot. A repeat may be evaluated against newer state; this is an explicit D09 exclusion requiring approval.

The following are unsupported by this selected 27-table representation, rather than proven impossible in every conceivable 27-table model:

| Unsupported operation/guarantee | Exact release exclusion |
|---|---|
| Repeated Ingredient, Product, Supplier/mapping, Order, PR, receipt or count draft edits | No general amendment/PATCH command, delete-and-recreate history workaround, or mutable last-key receipt. Ingredient K1→A, K2→B, replay K1 cannot recover its original result from the current row. Mutable master-data maintenance is outside this release; approved initial reference data is a prerequisite. |
| Arbitrary no-op/rejection history | No durable replay guarantee for distinct stale edits, failed approvals, insufficient-stock attempts or other rejected commands. Successful zero-variance count approval remains supported. |
| Generic bulk/multi-resource root responses | No “receive entire delivery” across several GoodsReceipt documents, bulk edits, multi-batch manual waste/import or generic batch-command API. Atomic children of an allowlisted Order/count/receipt command remain supported. |
| Receipt correction/reversal and commercial reopening | No confirmed-receipt correction, pack/payable recalculation, PR reopening, or stock return treated as receipt correction. No rewriting consumed/reserved lots. |
| Remake, general adjustment/return, repeated cancel/amend cycles | Disabled unless already covered by a named one-shot command above; allocation RELEASE/CONSUME and count ADJUSTMENT remain internal real events. |
| External effects | No PR approve/send/pay, supplier email dispatch, online charge, callback application, automated reconciliation or refund in this release. Existing Payment/Callback/Reconciliation identities remain retained; their broader safe protocols require U5 closure. |
| Generic D09 operation lookup/global key registry | Lookup only within the named endpoint namespace and genuine owner. No cross-domain registry or complete command-history claim. |

This explicitly narrows D09/REQ13 and affected D01/D06/D07/D08/D10/D11 workflows. It does not revise their agreed baseline automatically. Failed-command retention, edits and excluded workflows remain deferred requirements with no completion credit.

## Exact proposed U2–U5 decisions

| Conflict | Proposed release decision | Acceptance consequence / excluded feature |
|---|---|---|
| U2 Recipe identity / D01 | Accept R9 private sealed ITEM_VARIANT Recipes with one-way OrderItem ownership; keep MENU versions separate. Preserve normalized optional omissions, zero requirements, rational rounding deltas and immutable ADD toppings. Select LINE_TOTAL topping counts. | Explicit related-purpose Recipe extension and topping-count approval required. Menu-only Recipe identity would reject this proposal and block snapshot/order writes. Require source/product/owner constraints, immutable children and exact-math/overflow fixtures. REMOVE/SUBSTITUTE remain outside the existing ADD-only baseline. |
| U3 Agent history / D10 | Release Agent as read/recommend and LOG_ONLY only. Defer approval consumption and Agent-created PR writes, arbitrary proposal-line/revision history and persisted approval/budget implementation. Manual PR creation remains Purchasing-owned. | No claim that D10 write workflow is delivered. No fake calls or metadata rows. AgentExecution, AgentToolCall and AgentEvaluation retain exclusively genuine Agent meanings. This avoids approving an unsupported bounded proposal history as full D10. |
| U4 Receipts / D06 | Select R9 option B: one PR item per GoodsReceipt; arbitrary lot splits whose sum equals whole packs × frozen conversion. One document is one command; deliveryReference is descriptive only. | Owner/purchasing approval required for single-item receipt granularity and no grouped delivery replay. Partial deliveries and ADMIN/STAFF receipt remain; MOQ applies to order, not each delivery. Confirmed corrections, supplier-return commercial effects and PR reopening deferred. |
| U5 Finance / D03, D11 | Propose allocation-time valuation, retaining replacement allocation basis at consume; UNKNOWN distinct from known zero; aggregate exact extensions then item HALF_UP money2. Expose total COGS only; component COGS remains unavailable. Permit only positive whole-VND full-value CASH settlement. | Finance approval required for valuation and withholding ingredient/topping component subtotals. Reject fractional-VND/zero totals before effects, never silently round to integer or invent a zero charge. Online account/event namespace, verified callbacks, provider unknown outcomes, reconciliation and all refunds deferred; their acceptance remains blocked. |

For counts, require active ADMIN approval and batch/ingredient versions; allow owner self-count only with explicit approved reason policy. Otherwise self-approval is denied. FEFO, expiry at café midnight, exact units, atomic reservations and no automatic stock restoration remain unchanged obligations.

Receipt execution therefore requires an already authorized, preservation-verified PR with frozen lines. New create-only drafts cannot progress to receiving inside this release. Without such prerequisite PRs, receiving is blocked too; this proposal does not claim an end-to-end procurement release. Cash settlement similarly requires U5 approval and a verified Order lifecycle. These are acceptance consequences, not permission to bypass missing commercial authorization.

## 27 versus the single-table exception

| Dimension | Proposed bounded release: 27/16 | BusinessOperation exception: 28/16 |
|---|---|---|
| Inventory | All original R9 27 identities retained; all original 16 ENUM types/labels unchanged. No hidden runtime store. | Same 27 plus BusinessOperation only. Checked TEXT discriminators introduce no ENUM type. Count exception requires explicit approval. |
| Durable commands | Domain-specific immutable receipts for the positive allowlist; repeated edits/rejections and generic roots excluded. | Unique(scope, commandKind, callerKey), actor, canonical version/hash, typed subject/result links and immutable complete response; supports repeated edits, no-effect outcomes and multi-resource command roots without Agent coupling. |
| Transaction protocol | Per-domain key locks/uniqueness; effects and result atomic; current authorization before replay. | Same obligations; journal identity alone does not prove atomicity, concurrency or provider exactly-once behavior. Rejections require their own durable terminal-result transaction; transient/authorization failures need an explicit classification. |
| Other architectural conflicts | U2 private variants, U3 read-only Agent, U4 one-item receipts and U5 restricted finance as above. | Same choices can be retained. BusinessOperation does not add normalized receipt lines, snapshot rows or Agent proposal lines; it cannot by itself restore those excluded features. |
| Engineering consequence | More specialized receipt constraints; smaller release and explicit D09 amendment. | One coherent replay owner; restores the missing command-history representation, but domain validation, field-level contracts, retention and proof still required. |
| Decision | **Recommended under the current binding count, conditional on scope approval.** | **Preferred if full D09 cannot be deferred**, conditional on table-count exception; not an automatically selected fallback or permission to ship all original features. |

Neither alternative reuses SystemSetting, fake inventory movements, fabricated callbacks, Agent tables, JSON history arrays, external journals, partitions or views to conceal extra business persistence. BusinessOperation result JSON may be a validated immutable response copy; authoritative ownership remains typed.

## Approval and implementation boundary

Required signed decisions must identify this document/version and each selected option:

- Owner plus authorized technical/DB lead: approve the 27-table D09 allowlist and every exclusion, endpoint key namespace, history retention and response-size/PII policy; or approve the 28-table exception instead. Approving neither leaves all dependent writes blocked.
- Owner/operations and technical lead: U2 Recipe extension, LINE_TOTAL topping meaning, master-data edit exclusion and one-shot sales/count lifecycle; explicit self-count policy if enabled.
- Owner/purchasing lead: U4 one-item receipts, manual PR create-only scope, no grouped delivery replay/correction/send/pay.
- Owner/security lead and academic supervisor: U3 deferral of Agent write/approval workflows and related acceptance credit.
- Owner/finance and payment lead: U5 valuation, unavailable component COGS, cash-only/positive-whole-VND checkout and online/refund/reconciliation deferrals. Supervisor accepts revised release scope and deferred weekly criteria.

No approval is inferred from prior agreement in principle, this recommendation, or silence. Requirements/SRS/traceability and weekly acceptance criteria must record approved amendments before implementation.

Implementation-ready now: documentation-only owner decision capture, selected-option acceptance manifest and fixtures, pure canonicalization/math/FEFO test specifications, read-only legacy preservation mapping and all-writer/lock-order inventory. These preparations need no redesign round and clear no runtime acceptance gate.

Blocked now: Prisma/SQL contract changes, generated-client/DTO cutover, persistence adapters, protected mutation/grant changes, all dependent business write enablement and migrations. Once approvals are recorded, the allowlisted domains become eligible for a bounded field-complete implementation handoff; they are not yet deployed-ready. Excluded requirements remain blocked even after approving the limited release.

U6 remains an execution acceptance gate: catalog/client parity must prove exactly 27/16 (or explicitly approved 28/16), all protected writers and grants must enforce invariant/lock parity, and real PostgreSQL races, lost-response/restart faults, rollback and preservation/restore tests must pass. Use R9-01–20 where applicable; R9-07's repeated-edit counterexample is an acknowledged exclusion under 27, a required passing case under 28. Test disabled routes as exclusions, never mark their original criteria passed. Preserve legacy IDs/unknowns/new writes; retirement of Inventory, InventoryBatch, SupplierProduct and AgentLog needs separate preservation/cutover authorization. No migration scripts were executed and no current physical-state claim is made.

## Final decision matrix — stop point

| ID | Final proposed disposition | Required approval / gate | Ready or blocked |
|---|---|---|---|
| U1 | 27-table one-shot release; full D09 deferred. Use 28 only if full replay is mandatory and count exception approved. | Owner + technical decision maker select exactly one path and approve explicit exclusions. | Protocol specification ready; dependent persistence blocked. |
| U2 | Private sealed Recipe variants; normalized omissions; LINE_TOTAL toppings. | Owner + technical lead accept responsibility extension and snapshot tests. | Acceptance specification ready; order/menu persistence blocked. |
| U3 | Agent-only tables; read/recommend LOG_ONLY; no Agent business writes. | Owner/security/supervisor accept D10 release deferral. | Read-only preparation ready; approval/PR-write workflows blocked. |
| U4 | One-item receipt, whole packs, arbitrary base lot splits; no corrections/grouped root. | Owner/purchasing accept granularity and exclusions. | Receipt acceptance specification ready; receipt persistence blocked. |
| U5 | Allocation valuation, total COGS only, positive whole-VND cash only. | Finance approves policies/exclusions; payment evidence for any later expansion. | Finance fixtures ready; settlement persistence and excluded online/refund work blocked. |
| U6 | No waiver of integrity, preservation or actual database proof. | Approved field contract, all-writer/grant parity and passing race/fault/restart/restore evidence. | Read-only mapping/test planning ready; cutover/migrations and weekly acceptance blocked. |
| Next step | Record owner decisions against this matrix, then prepare one bounded implementation handoff for the selected scope. | No approval currently recorded. | Stop here; no automatic redesign, source changes or migration execution. |
