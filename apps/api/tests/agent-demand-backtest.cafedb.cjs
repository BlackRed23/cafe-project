// Read-only PostgreSQL demand backtest for AI02/03/04/12.
// This compares deterministic *forecast baselines*, not purchase outcomes,
// not a trained Agent vs. a human, and never claims superiority.
// Runs only through an explicitly confirmed test-owned cafedb proxy.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
require('dotenv').config({ path: 'apps/api/.env', quiet: true });
assert.equal(process.env.BACKTEST_CAFEDB_CONFIRMED, 'YES');
const dbUrl = new URL(process.env.DATABASE_URL);
assert.equal(dbUrl.pathname, '/cafedb');
dbUrl.hostname = '127.0.0.1'; dbUrl.port = process.env.BACKTEST_DB_PORT || '15432';
process.env.DATABASE_URL = dbUrl.toString();
process.env.NODE_ENV = 'test';
require('ts-node').register({ project: 'apps/api/tsconfig.json', transpileOnly: true });
const { PrismaClient } = require('@prisma/client');
const { assessDemandFromLedger } = require('../src/modules/agent/ingredient-demand-risk');
const db = new PrismaClient({ datasources: { db: { url: dbUrl.toString() } } });
const folder = 'D:/KLTN/cafe-project-artifacts/reports/agent';
fs.mkdirSync(folder, { recursive: true });
const runId = 'ai-demand-backtest-' + randomUUID(), path = folder + '/' + runId + '.json';
const dayMs = 86400000;
const safe = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const output = { runId, startedAt: new Date().toISOString(),
    database: 'cafedb', mode: 'REAL_POSTGRES_READ_ONLY_OFFLINE_LEDGER_BACKTEST',
    caseIds: ['AI02','AI03','AI04','AI12'], verdict: 'NOT_RUN',
    comparisons: [], approvedBusinessPolicy: false, humanBenchmarkAvailable: false,
    graphModelPredictionAvailable: false, noPredictionSuperiorityAsserted: true };
const json = x => JSON.stringify(x, (_key, value) =>
    typeof value === 'bigint' ? String(value) : value, 2);
async function main() {
    try {
        const [identity] = await db.$queryRawUnsafe('SELECT current_database() AS name');
        assert.equal(identity.name, 'cafedb');
        const before = await Promise.all([
            db.inventoryTransaction.count(),
            db.purchaseRequest.count(),
            db.purchaseOrder.count(),
            db.agentPurchaseCommandReceipt.count()
        ]);
        const at = new Date();
        const cutoffToday = Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate());
        const since = new Date(cutoffToday - 90 * dayMs);
        const ledger = await db.inventoryTransaction.findMany({
            where: { type: 'CONSUME', ingredientId: { not: null },
                createdAt: { gte: since, lt: new Date(cutoffToday) } },
            select: { ingredientId: true, createdAt: true, quantity: true },
            orderBy: { createdAt: 'desc' },
            take: 20001
        });
        output.observationsRead = ledger.length;
        output.truncated = ledger.length >= 20001;
        const groups = new Map();
        for (const movement of ledger) {
            const qty = Number(movement.quantity), consumed = -qty;
            if (!safe(consumed)) continue;
            const key = movement.ingredientId;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push({ createdAt: movement.createdAt, quantity: qty });
        }
        output.ingredientSeries = groups.size;
        let eligible = 0, sparse = 0;
        if (!output.truncated) for (const [ingredientId, series] of groups) {
            const activeHistory = new Set(series
                .filter(row => row.createdAt.getTime() < cutoffToday - 7 * dayMs &&
                    row.createdAt.getTime() >= cutoffToday - 37 * dayMs)
                .map(row => Math.floor(row.createdAt.getTime() / dayMs)));
            if (activeHistory.size < 14) { sparse++; continue; }
            const forecasts = [], actual = [], naiveThirty = [];
            for (let delta = 7; delta >= 1; delta--) {
                const t = cutoffToday - delta * dayMs;
                const training = series.filter(row => row.createdAt.getTime() < t &&
                    row.createdAt.getTime() >= t - 30 * dayMs);
                const observed = series.filter(row => row.createdAt.getTime() >= t &&
                    row.createdAt.getTime() < t + dayMs)
                    .reduce((sum, row) => sum - row.quantity, 0);
                const last30 = training.reduce((sum, row) => sum - row.quantity, 0) / 30;
                const predicted = assessDemandFromLedger(training, new Date(t)).dailyRate;
                actual.push(observed); forecasts.push(predicted); naiveThirty.push(last30);
            }
            const mae = predicted => predicted.reduce((sum, value, index) =>
                sum + Math.abs(value - actual[index]), 0) / actual.length;
            const agentless = mae(forecasts), baseline = mae(naiveThirty);
            output.comparisons.push({
                ingredientId, activeTrainingDays: activeHistory.size,
                backtestDays: 7, ledgerConsumptionMAE: Number(agentless.toFixed(3)),
                thirtyDayBaselineMAE: Number(baseline.toFixed(3)),
                meaning: 'DETERMINISTIC_RULE_VS_30_DAY_BASELINE_ONLY',
                agentPredictionEvaluated: false, humanPerformanceEvaluated: false
            });
            eligible++;
        }
        const after = await Promise.all([
            db.inventoryTransaction.count(),
            db.purchaseRequest.count(),
            db.purchaseOrder.count(),
            db.agentPurchaseCommandReceipt.count()
        ]);
        output.beforeAfterCountsIdentical = json(before) === json(after);
        assert.equal(output.beforeAfterCountsIdentical, true);
        output.eligibleSeries = eligible; output.sparseSeries = sparse;
        output.verdict = output.truncated ? 'PARTIAL_LEDGER_LIMIT_REACHED' :
            eligible ? 'BACKEND_PASS_BASELINE_BACKTEST_ONLY' :
                'BACKEND_PASS_READONLY_INSUFFICIENT_HISTORY';
        output.summary = eligible
            ? 'Metrics compare two deterministic demand baselines only. The true LangGraph Agent and operator outcomes are not controlled or benchmarked.'
            : 'Insufficient independent daily sale histories for a statistically useful holdout; do not claim Agent improves on manual or rules.';
    } catch (error) {
        output.verdict = 'FAIL'; output.error = String(error.stack || error).slice(0, 1300);
        process.exitCode = 1;
    } finally {
        await db.$disconnect();
        output.finishedAt = new Date().toISOString();
        fs.writeFileSync(path, json(output), 'utf8');
        console.log(json({ path, runId, verdict: output.verdict,
            observationsRead: output.observationsRead,
            ingredientSeries: output.ingredientSeries, eligibleSeries: output.eligibleSeries,
            error: output.error?.slice(0, 400) }));
    }
}
main().catch(error => { console.error(error); process.exitCode = 2; });
