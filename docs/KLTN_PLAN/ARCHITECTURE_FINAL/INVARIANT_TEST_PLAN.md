# Invariant tests and evidence boundary

2026-11-07. Tests below are concrete acceptance specifications, **NOT RUN** unless stated in the final evidence paragraph. Use a separately authorized disposable PostgreSQL environment with the intended runtime role; never run current migration scripts to obtain evidence. Each case must capture input, role, schema/contract hash, SQL outcome, exact persisted state and invariant queries. Two-session tests need barriers, not timing-only sleeps. HTTP errors alone are insufficient evidence.

| ID / requirement | Adversarial fixture | Required assertion |
|---|---|---|
| T01 D01/S01 | yield2 coffee36g/milk300ml; three servings; optional omit milk; one whole-line ADD | 54g coffee, milk450ml before omission; explicit omitted line and zero requirement retained; aggregate ADD once |
| T02 D01 | Attempt mandatory omission, wrong-product source, second item owning variant, orphan sealed variant | Zero effects / FK or deferred seal failure; no optional-history loss |
| T03 D01 | Two concurrent overlapping publications; edit published recipe/topping child after order | One publication; historical snapshot remains exact and child edit denied |
| T04 D02 | 0.018kg, 0.15L, 0.5piece, g→ml, scale/overflow, change used baseUnit | 18g/150ml; invalid quantities/dimensions and used-unit edit denied |
| T05 D03 | 1g/3 servings; 3 servings together; allocations .333/.333/.334 | .333 versus1.000; exact rational rounding delta; allocations sum1.000 |
| T06 D03/U5 | Coffee10g×200 +8g×250, milk30ml×30; same ingredient also in two toppings, differently priced lots; unknown versus zero | Total4900 for first fixture; every mixed contribution/lot extension assigned exactly once; components sum item cost; unknown propagates, known zero remains zero |
| T07 D04 | B10 earlier expiry, A20 later expiry; need18; null lot; café next-midnight exact boundary | B10+A8; null/expired unusable; expiry invariant independent of host timezone |
| T08 D05/S02 | Two sessions reserve last18 of18; restart | Exactly one commits; physical/reserved/open allocations reconcile |
| T09 D05/08 | Race RELEASE versus CONSUME; terminal with wrong item/batch/quantity | One matching terminal; cross-owner link denied; 100/18→100/0 or82/0 |
| T10 D05/08 | Reserved lot expires; insufficient replacement; kill after release write | Full rollback preserves original reservation; successful replacement releases/reserves/consumes together |
| T11 D06/U4 | One receipt covers PR item A:4×250g split350/650; item B:2×100ml split75/125 | Same document keeps separate whole-pack lines and all four real origin lots; exact per-item sum; no anchor pretending fractional pack is whole |
| T12 D06 | Two sessions each receive6 packs against remaining6; repeat invoice on a separate valid delivery | One6 commits, no overreceipt; invoice alone never deduplicates real delivery |
| T13 D06/U4 | Edit multi-item draft twice, cancel one line, replay first edit after restart | No stock in draft; retain exact original result and pack/price line history; exposes both U1 and missing line owner |
| T14 D06/U4 | Confirm4 packs then correct1; repeat with one lot reserved/partly consumed; another PR receipt occurs meanwhile | Original unchanged, explicit correction/real permissible reversal, conserved packs/payables/reopening; cannot rewrite consumed stock or erase later receipt. Exact alternative disposition must be contractually specified before this can pass |
| T15 D07 | Batch500→480; repeat approval; second batch zero variance | One−20 adjustment, zero variance durable count result with no fake event |
| T16 D07 | Reservation after count submit; STAFF approve; owner self-count without/with required reason | Stale/STAFF/unaudited self-approval denied; approved exception auditable; retained required rejection replay |
| T17 D08 | Cancel before start; cancel after start; remake; refund afterward | Release only unstarted; classify started loss once; remake explicit new effects/history; refund restores no stock |
| T18 D09/U1 | I=Z/v1; K1 edit A→v2; K2 edit B→v3; restart; replay K1 | Exact original status/body A/v2, current I stays B/v3; changed K1 payload409 |
| T19 D09/U1 | For arbitrary n, n distinct edits plus stale/no-op commands; replay each after restart; specifically N+1 for N slots | All required Ri retained; no fixed history cap or disguised domain rows. Finite run alone is insufficient: inspect append model/identity proof too |
| T20 D09 | Barrier two same-key/hash commands; third same key/different hash | One effect/result; waiter receives exact result, changed hash409; authoritative scoped uniqueness |
| T21 D09 | Multi-item Order touches shared ingredient/batch; lose response after commit | Typed child keys distinguish item+ingredient+batch+phase+ordinal; one root result recovers every child without reapplying |
| T22 D09 | Distinct stale edits rejected; intervening state changes; replay each rejection | Required original rejection outcomes persist with zero effects; transient DB rollback not mistaken for retained business rejection |
| T23 D09 | Drop connection during commit; retry while original transaction unresolved | Pending/authoritative lookup; no duplicate; at most3 confirmed-rollback attempts, unknown is never assumed rollback |
| T24 D09/S05 | Revoke actor access after original success; attempt replay and direct protected SQL | Current access denial leaks no historical result; runtime DML bypass denied; immutable receipt cannot be overwritten/deleted |
| T25 D10/U3 | One actual recommendation call returns8 lines; revise twice in same genuine run | Eight typed source-bound lines/revision history, one actual call; zero fabricated tool rows |
| T26 D10 | Approve hash H then change quote/ingredient/open-PR version, demote ADMIN, test15min boundary | Stale/unauthorized/expired consume creates no PR; old approval cannot bind changed content |
| T27 D10 | Concurrent revoke/consume; two consumers; restart/replay consumed write | One valid winner/one PENDING PR; retained decision/revision results; no auto approve/send/pay |
| T28 D10 | Parallel calls reserve budget; crash before/after provider reply; approval wait | Durable accounting never exceeds6 dispatches/2 calls/8000 tokens/60s active/one write; waiting not active; 20s timeout/two read attempts. Unknown usage cannot be reset to free budget |
| T29 D11 | Failed payment then new full attempt; unresolved timeout; duplicate real charge | Both histories; unknown blocks retry; one applied, second charge preserved EXCEPTION |
| T30 D11 | Same eventId in two merchant accounts; wrong signature/amount/currency/reference/account | Correct namespace; invalid events never settle; real duplicate event once only |
| T31 D11 | Paid then late failure, refund, then attempted new settlement | No paid regression; applied uniqueness survives refund; stock/order not silently reopened |
| T32 D11/U5 | Full refund rejected twice then succeeds; provider accepted but response lost; worker crash | Distinct required command/dispatch outcomes retained; authoritative provider lookup before retry; one full refund effect, no stock restore |
| T33 D03/11 | Fractional-VND total; legitimate zero-total order; provider reconciliation orphan | No silent rounding or invented charge; exact zero-order/account reconciliation policy must be specified before acceptance |
| T34 All/S05 | Every stock writer including simulation, imports, receipts, counts, sales; fault after each event/cache/state/result write | Sole protected inventory boundary, rollback all or conserved committed result; no dual decrement/legacy bypass |
| T35 U6 | Compare source/generated client/SQL/catalog/grants under approved schema | Exactly27/16 plus field/FK/index/check/trigger/grant parity; every missing invariant fails gate |
| T36 U6 | Snapshot backup, subsequent sales/payment/receipt and new keys, recovery rehearsal | Preserve all later business writes/replay identities; no DELETE/reset/CASCADE shortcut; unknown legacy mapping not fabricated |

Independent verification actually run in this task: `node --test --test-reporter=tap apps/api/tests/ingredient-policy.test.cjs apps/api/tests/inventory-core.test.cjs` exited0: **14 passed, 0 failed, 0 skipped**. It verifies existing pure conversion, expiry/FEFO, requirements/rational rounding, total-cost completeness, planning and canonical identity helpers. It does not execute T01–36 as database acceptance, prove component attribution, persistence, approval, provider behavior or recovery. No PostgreSQL connection, migration, provider request, worker or database-dependent write was executed.
