'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
require('ts-node').register({ project: 'apps/api/tsconfig.json', transpileOnly: true });
const { assessDemandFromLedger, assessBoundedDemandFromLedger, assessSupplyTiming,
  assessLotEvidence } = require('../src/modules/agent/ingredient-demand-risk');
const at = new Date('2026-11-19T12:00:00.000Z');
const day = 86400000;
const add = (offset, consumed) => ({
  createdAt: new Date(at.getTime() - (offset + 0.1) * day),
  quantity: -consumed
});

test('AI03: seven days demand increase versus the preceding seven days', () => {
  const rows = [
    ...Array.from({length: 7}, (_, i) => add(i, 5)),
    ...Array.from({length: 7}, (_, i) => add(i + 7, 2))
  ];
  const result = assessDemandFromLedger(rows, at);
  assert.equal(result.trend, 'RISING');
  assert.equal(result.recentSevenDays, 35);
  assert.equal(result.previousSevenDays, 14);
  assert.equal(result.dailyRate, 5);
  assert.equal(result.confidence, 'HIGH');
});

test('AI04: shrinking demand cannot become a negative recommendation', () => {
  const rows = [
    ...Array.from({length: 7}, (_, i) => add(i, 1)),
    ...Array.from({length: 7}, (_, i) => add(i + 7, 2))
  ];
  const result = assessDemandFromLedger(rows, at);
  assert.equal(result.trend, 'FALLING');
  assert.equal(result.dailyRate, 1);
  assert.ok(result.dailyRate >= 0);
});
test('AI04/AI12: a week without CONSUME is dormant LOW-confidence evidence, not an invented 30-day reorder rate', () => {
  const historical = Array.from({length: 15}, (_, i) => add(i + 8, 8));
  const result = assessDemandFromLedger(historical, at);
  assert.equal(result.recentSevenDays, 0);
  assert.ok(result.previousSevenDays > 0);
  assert.equal(result.dailyRate, 0);
  assert.equal(result.trend, 'FALLING');
  assert.equal(result.confidence, 'LOW');
  assert.ok(result.codes.includes('DEMAND_DORMANT_REVIEW'));
});

test('AI12: sparse demand labeled low-confidence fallback', () => {
  const result = assessDemandFromLedger([add(2, 3)], at);
  assert.equal(result.confidence, 'LOW');
  assert.ok(result.codes.includes('SPARSE_HISTORY_FALLBACK'));
  assert.equal(result.model, 'DETERMINISTIC_LEDGER_BASELINE');
});

test('AI03/AI13: daily outlier flagged and bounded rather than hidden', () => {
  const rows = [
    ...Array.from({length: 13}, (_, i) => add(i, 2)),
    add(14, 2), add(20, 2000)
  ];
  const result = assessDemandFromLedger(rows, at);
  assert.equal(result.anomalousDailySpikes, 1);
  assert.ok(result.codes.includes('OUTLIER_REVIEW_REQUIRED'));
  assert.ok(result.confidence !== 'HIGH');
});

test('AI13: malformed/future/positive CONSUME rows are never counted as demand', () => {
  const result = assessDemandFromLedger([
    add(2, -10), add(-1, 100), {createdAt: new Date('invalid'), quantity: -5}
  ], at);
  assert.equal(result.observedMovements, 0);
  assert.equal(result.confidence, 'LOW');
  assert.ok(result.codes.includes('INVALID_LEDGER_OBSERVATION'));
});

test('AI02/AI24: input count is bounded; no invalid or impossible observations accepted', () => {
  assert.throws(() => assessDemandFromLedger(new Array(10001).fill(add(1, 1)), at),
    /INVALID_FORECAST_INPUT/);
  const result = assessDemandFromLedger([add(0, 0)], at);
  assert.equal(result.dailyRate, 0);
  assert.equal(result.trend, 'UNKNOWN');
});

test('AI12/AI13: 10001 PostgreSQL CONSUME rows are held as truncated LOW-confidence evidence, never an HTTP 500', () => {
  const rows = Array.from({length: 10001}, (_, i) => add(i % 14, 1));
  const bounded = assessBoundedDemandFromLedger(rows, at);
  assert.equal(bounded.observedMovements, 10000);
  assert.equal(bounded.confidence, 'LOW');
  assert.ok(bounded.codes.includes('HISTORY_TRUNCATED'));
  assert.equal(bounded.model, 'DETERMINISTIC_LEDGER_BASELINE');
  const exact = assessBoundedDemandFromLedger(rows.slice(0, 10000), at);
  assert.equal(exact.codes.includes('HISTORY_TRUNCATED'), false);
});

test('AI02: projected stockout before catalog lead time is a review-only shortage, not supplier ETA proof', () => {
  const result = assessSupplyTiming({
    at, availableBase: 8, dailyDemandBase: 4,
    leadTimeDays: 5, unreceivedInboundBase: 100
  });
  assert.equal(result.projectedDemandBeforeArrivalBase, 20);
  assert.equal(result.projectedShortfallBeforeArrivalBase, 12);
  assert.equal(result.projectedCoverageDaysWithoutInbound, 2);
  assert.equal(result.hypotheticalCoverageDaysWithInbound, 27);
  assert.equal(result.arrivalEvidence, 'SUPPLIER_CATALOG_ESTIMATE');
  assert.ok(result.codes.includes('PROJECTED_STOCKOUT_BEFORE_LEAD_TIME'));
  assert.ok(result.codes.includes('INBOUND_SCENARIO_NOT_PHYSICAL'));
  assert.ok(result.codes.includes('ETA_IS_ESTIMATE_NOT_PROMISE'));
});

test('AI02/AI11/AI12: no confirmed lead time or sparse demand must not invent delivery promise', () => {
  const result = assessSupplyTiming({
    at, availableBase: 10, dailyDemandBase: 0, leadTimeDays: null,
    unreceivedInboundBase: 0
  });
  assert.equal(result.arrivalEstimateAt, null);
  assert.equal(result.projectedShortfallBeforeArrivalBase, null);
  assert.equal(result.hypotheticalCoverageDaysWithInbound, null);
  assert.ok(result.codes.includes('SUPPLIER_LEAD_TIME_UNVERIFIED'));
  assert.ok(result.codes.includes('DEMAND_RATE_UNCERTAIN'));
});

test('AI04/AI08: enough physical stock does not require replenishment, inbound is never physical', () => {
  const result = assessSupplyTiming({
    at, availableBase: 30, dailyDemandBase: 2, leadTimeDays: 3,
    unreceivedInboundBase: 6
  });
  assert.equal(result.projectedShortfallBeforeArrivalBase, 0);
  assert.equal(result.projectedCoverageDaysWithoutInbound, 15);
  assert.equal(result.hypotheticalCoverageDaysWithInbound, 18);
  assert.equal(result.codes.includes('PROJECTED_STOCKOUT_BEFORE_LEAD_TIME'), false);
});

test('AI13/AI24: unsafe timing observations fail closed instead of arbitrary purchase', () => {
  for (const wrong of [
    { availableBase: -1 }, { dailyDemandBase: Number.POSITIVE_INFINITY },
    { unreceivedInboundBase: NaN }, { leadTimeDays: -1 }, { leadTimeDays: 2.5 }
  ]) {
    assert.throws(() => assessSupplyTiming({
      at, availableBase: 1, dailyDemandBase: 1,
      leadTimeDays: 2, unreceivedInboundBase: 0, ...wrong
    }), /INVALID_SUPPLY_TIMING/);
  }
});

test('AI05/AI06/AI13/AI24: expired, unknown expiry and quarantined quantities remain distinct review evidence', () => {
  const lots = [
    { quantityRemaining: 10, qualityStatus: 'AVAILABLE', expirationDate: new Date(at.getTime() - day) },
    { quantityRemaining: 20, qualityStatus: 'AVAILABLE', expirationDate: null },
    { quantityRemaining: 30, qualityStatus: 'QUARANTINED', expirationDate: new Date(at.getTime() + day) },
    { quantityRemaining: 40, qualityStatus: 'AVAILABLE', expirationDate: new Date(at.getTime() + 3 * day) },
    { quantityRemaining: 50, qualityStatus: 'AVAILABLE', expirationDate: new Date(at.getTime() + 20 * day) }
  ];
  const result = assessLotEvidence(lots, at);
  assert.equal(result.totalBase, 150);
  assert.equal(result.usableBase, 110);
  assert.equal(result.nearExpiryBase, 40);
  assert.deepEqual(result.codes, [
    'EXPIRED_STOCK_PRESENT', 'UNKNOWN_EXPIRY_LOT', 'NON_AVAILABLE_LOT_PRESENT',
    'NEAR_EXPIRY_FEFO'
  ]);
  // No disposal, release, batch update or actual ordering is inferred.
});

test('AI06/AI13: malformed or negative lot stock is explicit integrity conflict, never a usable forecast', () => {
  for (const lot of [
    { quantityRemaining: -1, qualityStatus: 'AVAILABLE', expirationDate: null },
    { quantityRemaining: Number.POSITIVE_INFINITY, qualityStatus: 'AVAILABLE', expirationDate: null },
    { quantityRemaining: 1, qualityStatus: 'AVAILABLE', expirationDate: new Date(NaN) }
  ]) {
    assert.throws(() => assessLotEvidence([lot], at),
      error => error.statusCode === 409 && error.code === 'INVENTORY_INTEGRITY');
  }
});

test('AI13/AI24: exhausted lots are not phantom expiry risks', () => {
  const zero = assessLotEvidence([
    { quantityRemaining: 0, qualityStatus: 'QUARANTINED', expirationDate: new Date(at.getTime() - day) },
    { quantityRemaining: 0, qualityStatus: 'AVAILABLE', expirationDate: null }
  ], at);
  assert.equal(zero.usableBase, 0);
  assert.equal(zero.totalBase, 0);
  assert.deepEqual(zero.codes, []);
});
