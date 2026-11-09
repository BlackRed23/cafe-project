# Requirements and inventory preparation

R1 — 2026-11-05, Asia/Saigon. **DRAFT / NOT APPROVED / NOT IMPLEMENTED**. Independent preparation under W02-T01…03, W04-T04 and W05; no predecessor gate is bypassed. Original BR01–BR08 and REQ01–REQ16 remain unchanged. This document develops existing requirements and makes open decisions reviewable; it does not stand in for a café interview, approved SRS or implementation evidence.

## Use cases for owner walkthrough

| Flow / original requirement | Actor / prerequisites | Main outcome | Error/exception branches requiring validation |
|---|---|---|---|
| Receiving / REQ03 | Current permitted receiver; sent/approved PR per policy; active ingredient, supplier mapping, positive conversion and durable operation key | Partial receipt → batch, aggregate, ledger and received totals in one transaction | Wrong role, duplicate item ID, stale PR, repeated key, changed payload under same key, excess quantity, invalid expiry/unit, disabled ingredient, injected failure |
| Ordering/preparing / REQ01/02/04 | Authorized order actor; immutable active recipe version, positive yield, sufficient eligible stock | Compute ingredient needs → reserve → commit physical consumption once at approved preparation transition | Missing recipe/version, stale snapshot, insufficient eligible stock, wrong dimension, expiry while reserved, concurrent last portion, duplicate submit |
| Cancellation / REQ04 | Authorized actor; current order/item state and recorded allocations | Before preparation: release allocations once; after commitment: preserve consumed stock and record waste classification according to owner policy | Duplicate cancellation, mixed prepared/unprepared items, refund handled separately, expired reserved batch, stale state, partial preparation |
| Count / REQ05 | Permitted counter and approver; ingredient quantity/version snapshot | Approve variance with actor/reason and aggregate/batch/ledger consistency | Stale snapshot, duplicate approval, reserved quantity exceeds proposed physical stock, unknown source batch; no blind aggregate overwrite |
| Waste / REQ04/05 | Authorized actor, explicit source batches and reason | Unconsumed damaged/expired physical stock decremented with ledger; already consumed drink waste classified without second physical deduction | Wrong batch ownership, insufficient quantity, reserved stock needing release/reallocation, duplicate event, invalid reason/amount |
| AI reorder / REQ08/10/11/12/13 | Active ADMIN; verified stock/supplier data; approval tied to proposal/version | Read → recommendation → human review → PR draft via business service and durable key | System purchase denied, unknown supplier, invalid finite quantity, stale/rejected approval, write timeout queried by key before retry, duplicate open PR |

Sources: WEEK_02 §4; REQUIREMENTS_TRACEABILITY; API inventory/order/purchase repositories and Agent service/internal-auth. The legacy code does not implement these complete ingredient flows.

## BR01–BR08 and hand-worked examples

| ID | Existing rule developed for review | Expected example / boundary | Open owner decision |
|---|---|---|---|
| BR01 | Ingredient base-unit dimension, positive recipe yield, immutable recipe version/snapshot; validate finite quantities, no implicit cross-dimension conversion | 0.018 kg = 18 g; 0.15 L = 150 ml; 1 g → ml rejected without explicit ingredient density; NaN/Infinity/negative/zero yield rejected | Canonical unit vocabulary, count granularity, allowed purchase packs, rounding precision and density policy |
| BR02 | Physical quantity equals sum of remaining physical batches including expired stock; 0≤reserved≤quantity. Availability excludes expired batches and allocated reservations | Physical 100 g + expired 20 g = 120 g, eligible 100 g, allocated eligible 30 g → available 70 g; cannot reserve 80 g | Expiry instant/timezone/day-end, null expiry ordering, reservation timeout/reallocation |
| BR03 | Partial receiving respects ordered purchase units; conversion snapshot immutable; key replay cannot increase inventory twice; over-receipt rejected | Order 10 bags × 250 g, receive 4 → 1,000 g; replay same operation → still 1,000 g; later receive 7 bags rejected, remaining only 6 | Purchase quantity Int represents pack count or base unit; MOQ/partial-pack policy and supplier invoice identity |
| BR04 | Before preparation release only reservation; after commitment never restore consumed ingredients automatically; waste/refund are distinct events | Reserve 18 g from 100 g: physical 100, reserved 18. Cancel before commit →100/0. Commit→82/0; cancel prepared drink→82/0, waste classification references consumed 18 g, no second decrement | Partial preparation, release/commit timing, drink remake and return-to-stock policy |
| BR05 | Count approval uses snapshot/version; signed variance with approver/reason and batch attribution; deny stale approval | Snapshot 500 g, actual 480 g → variance −20 g. If stock changed since snapshot, reject/recount rather than overwrite | Counter vs approver separation, reconciliation of unallocated legacy quantities |
| BR06 | COGS from allocated batch unit cost and immutable recipe/topping snapshot; historical missing cost stays UNKNOWN | Use 10 g at 200 VND/g + 8 g at 250 VND/g → 4,000 VND ingredient cost; 30 ml milk at 30 VND/ml adds 900, total 4,900 | Money rounding boundary, labor/overhead allocation and unknown historical-cost representation |
| BR07 | Payment event signature/reference/currency/amount verified, idempotent event application; attempts separate from order summary | Duplicate provider event produces one applied settlement; mismatched amount rejected | Payment attempt/status/cardinality ADR must reconcile Prisma, SQL and API; no live payment completion claimed |
| BR08 | Deny by default; principal active/current role checked server-side; approval bound to payload/version; system cannot buy as ADMIN | Disabled/deleted/demoted ADMIN token cannot enter protected write; current tests verify zero handler writes | Approver roles, permission of STAFF receiving, stale approval expiry and transaction-bound recheck |

Recipe calculation proposal for BR01: `needBase = recipeIngredient.quantityBase × orderedServings / recipe.yieldQuantity`, aggregate by ingredient ID in its canonical base unit. Example: a recipe yields 2 servings from 36 g coffee + 300 ml milk; 3 servings need 54 g + 450 ml. Add topping needs separately per selected quantity and aggregate same ingredient. REMOVE/SUBSTITUTE must be explicit approved deltas/mappings; never subtract arbitrary unrelated ingredients or permit negative totals. Snapshot recipe ID/version/yield, all ingredient amounts, approved topping effects, conversion and resulting allocations. Later recipe changes must not rewrite an existing order snapshot.

Decimal arithmetic must avoid JS binary Number for persisted quantities/costs. Review NUMERIC(14,3) amount and (18,4) unit-cost scale, overflow and rounding before implementation. For non-terminating division (e.g. 1 g / 3 servings), owner must approve rounding and conservation across allocations; do not silently truncate each batch independently. Existing Math.ceil pack conversion in legacy inventory is not an ingredient conversion engine.

## Observed permission matrix (not a new approved policy)

| Operation / boundary | ADMIN | STAFF | CUSTOMER | System |
|---|---|---|---|---|
| API inventory read/ledger | Allow | Allow | Deny | No user JWT |
| API inventory import/adjust/threshold | Allow | Deny | Deny | Deny |
| API PR read | Allow | Allow | Deny | Deny |
| API PR create/approve/send/complete/pay/delete | Allow | Deny | Deny | Deny |
| API PR receive | Allow | Allow in current route; confirm policy | Deny | Deny |
| Agent logs read | Allow | Allow | Deny | Internal rules apply |
| Agent scan/recommend/create PR | Allow with current principal | Deny | Deny | Purchase deny; worker LOG_ONLY analysis/log |
| Internal log create | Internal authenticated path | Internal authenticated path | Deny | Allowed authenticated log path; no forged ADMIN |

Evidence: API inventory.route.ts, purchase.route.ts, agent.route.ts and Agent internal-auth/server guards. Current-account lookup now occurs at API auth boundary. Resource ownership and business state must still be checked inside each service. GET inventory currently may create missing legacy inventories (SEC05); it is not safe to use as a catalog-only DB probe.

## W05 transaction design and acceptance cases

This is proposed design only. Reuse existing transaction/conditional-update patterns; do not create more inventory tables or wire an alternative live write path while W04 is blocked.

1. **Selection:** validate all inputs/units/recipe snapshot and current actor. Compute needs before locking. Lock ingredient aggregates in stable ingredient-ID order, then candidate batches in stable selection order. Re-read balances under locks. FEFO proposed order `(expirationDate ASC NULLS LAST, receivedAt ASC, id ASC)`; FIFO `(receivedAt ASC, id ASC)` when approved policy chooses it. Both exclude expired/deleted/ineligible batches. UTC instants with explicit café timezone boundary must be agreed. Null expiry is a policy decision, not implicitly safe.
2. **Allocation:** plan the full required quantity across eligible batches. If insufficient, roll back all ingredients; no partial reservation. Each allocation must be durably tied to item/batch/key. Aggregate Ingredient.reserved alone cannot identify per-batch reservations; current schema needs an approved representation using existing ledger/reference/idempotency facilities or an approved design change. Do not assume optional scalar orderItemId is an enforced FK.
3. **Atomic writes:** receipt + received quantity + batch + aggregate + ledger commit together; reserve/release/consume + item state + allocation + durable key commit together. Checks protect physical ≥ reserved ≥ 0 and batch remaining ≥ 0; all writers follow the same lock order. Expired stock stays in physical reconciliation until an explicit waste/quarantine movement.
4. **Concurrency:** conditional rowVersion/current-status updates must affect exactly the intended rows. Conflict returns a controlled outcome and leaves no committed movement. Serializable/deadlock retries are bounded and repeat the entire transaction only after confirmed rollback; unknown commit outcome is resolved by durable key, not blind retry. A unique request number alone is not an operation key.
5. **Idempotency:** bind authenticated operation type, durable business key and canonical payload fingerprint. Same key/same payload returns committed result, same key/different payload conflicts, concurrent same key commits once, rollback leaves no partial state. Multi-batch ledger lines need deterministic unique child keys plus an atomic operation-level marker/result in an approved existing representation. Existing nullable ledger/receipt keys alone do not prove this protocol.
6. **Cancellation/waste:** use current item state/allocations. Release reserved stock once before commitment. Prepared cancellation does not increment Ingredient.quantity. Classify loss against original consume movement; reject double waste deduction. Waste of untouched batch stock decrements physical batch+aggregate and appends reason/actor ledger atomically, after handling allocations.
7. **Side effects:** Agent scan/email only after commit; durable delivery requires an approved outbox/checkpoint strategy. Current order completion starts Agent work inside the transaction (SEC06), so it cannot be copied unchanged. Provider timeout must not cause duplicate purchase creation.

| Test / task | Required input and expected result | Current actual / level |
|---|---|---|
| TC-05-01 / W05-T01 | 3 servings/yield2 →54 g/450 ml; topping/negative/NaN/wrong-unit and immutable snapshot tests; API/UI permission smoke | Design example reviewed; no Ingredient/Recipe CRUD integration test executed |
| TC-05-02 / W05-T02 | FEFO ties/null-expiry/FIFO fixtures; two concurrent reservations for last stock; 0≤reserved≤physical and batch sum equality | NOT RUN on PostgreSQL; legacy mock tests cannot close this |
| TC-05-03 / W05-T03 | 10 packs/receive4/replay/conflicting key/receive7; duplicate item IDs; simultaneous partial receipts | NOT RUN; no GoodsReceipt business adapter implemented |
| TC-05-04 / W05-T04 | Inject failure after each batch/aggregate/ledger/item/key step; two real sessions; retry/deadlock/unknown-commit/cancel/waste and legacy regression | Only existing legacy mocks executed; required PostgreSQL evidence absent |

Expected illustrative batch fixture: A received earlier, expires later, 20 g; B received later, expires sooner, 10 g; need 18 g. FEFO → B10+A8; FIFO → A18. Expired C20 remains in physical sum but cannot fulfill either plan. These are specified expected values, not executed engine outputs.

SRS traceability remains [REQ01–REQ16](../REQUIREMENTS_TRACEABILITY.md). No new IDs supersede those requirements. Open approvals, physical dictionary/ERD, safe restore runbook, tool contracts and frozen experiment dataset remain in the backlog. Hand calculations above are document review evidence only and cannot close PostgreSQL integration acceptance.
