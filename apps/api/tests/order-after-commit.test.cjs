// Real order repository; fake transaction boundary/Agent transport, no DB or network.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function fixture({ failCommit = false, failLedger = false, failAgent = false } = {}) {
    let committed = false;
    const scans = [], errors = [];
    const updated = { id: 'order-1', status: 'COMPLETED' };
    const tx = {
        order: { updateMany: async () => ({ count: 1 }), findUnique: async () => updated },
        inventory: { findUnique: async () => ({ id: 'inventory-1' }), updateMany: async () => ({ count: 1 }) },
        inventoryBatch: { findMany: async () => [{ id: 'batch-1', quantity: 10 }], updateMany: async () => ({ count: 1 }) },
        inventoryTransaction: { create: async () => { if (failLedger) throw new Error('Injected ledger failure'); } }
    };
    const prisma = { $transaction: async callback => {
        const result = await callback(tx);
        assert.equal(scans.length, 0, 'Agent was started before transaction commit');
        if (failCommit) throw new Error('Injected commit failure');
        committed = true;
        return result;
    } };
    const exports = {};
    const source = fs.readFileSync(path.resolve(__dirname, '../src/modules/order/order.repository.ts'), 'utf8');
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
        exports, Date, console: { error: (...args) => errors.push(args) },
        require(name) {
            if (name === '@cafe-project/database') return { prisma, OrderStatus: { COMPLETED: 'COMPLETED', CANCELLED: 'CANCELLED', PROCESSING: 'PROCESSING', PENDING: 'PENDING' }, InventoryTransactionType: { ORDER: 'ORDER', CANCEL: 'CANCEL' } };
            if (name === './shipping.service') return {};
            if (name === '../agent/agent.client') return { scanInventoryViaAgentService: async (...args) => {
                scans.push(args);
                assert.equal(committed, true);
                if (failAgent) throw new Error('PRIVATE_AGENT_ERROR_MARKER');
            } };
            throw new Error(`Unexpected import: ${name}`);
        }
    });
    const order = { id: 'order-1', status: 'PROCESSING', stockDeductedAt: null, items: [{ productId: 'product-1', quantity: 3 }] };
    return { repo: exports.orderRepository, order, scans, errors, updated, committed: () => committed };
}

test('completion dispatches one Agent scan after transaction commit with original actor/order', async () => {
    const f = fixture();
    assert.equal(await f.repo.updateStatus(f.order, 'COMPLETED', 'admin'), f.updated);
    assert.equal(f.scans.length, 1);
    assert.equal(f.scans[0][1], 'admin');
    assert.equal(f.scans[0][0].sourceId, 'order-1');
    assert.deepEqual(Array.from(f.scans[0][0].productIds), ['product-1']);
});

for (const failure of ['failLedger', 'failCommit']) test(`${failure} leaves no remote scan`, async () => {
    const f = fixture({ [failure]: true });
    await assert.rejects(f.repo.updateStatus(f.order, 'COMPLETED', 'admin'), /Injected/);
    assert.equal(f.scans.length, 0);
    assert.equal(f.committed(), false);
});

test('postcommit Agent failure does not undo order success or log private provider detail', async () => {
    const f = fixture({ failAgent: true });
    assert.equal(await f.repo.updateStatus(f.order, 'COMPLETED', 'admin'), f.updated);
    assert.equal(f.committed(), true);
    assert.equal(f.scans.length, 1);
    assert.equal(f.errors.length, 1);
    assert.equal(JSON.stringify(f.errors).includes('PRIVATE_AGENT_ERROR_MARKER'), false);
});

test('cancellation or already-finalized completion does not dispatch a completion scan', async () => {
    const cancelled = fixture();
    await cancelled.repo.updateStatus(cancelled.order, 'CANCELLED', 'admin');
    assert.equal(cancelled.scans.length, 0);
    const finalized = fixture();
    finalized.order.stockDeductedAt = new Date();
    await finalized.repo.updateStatus(finalized.order, 'COMPLETED', 'admin');
    assert.equal(finalized.scans.length, 0);
});
