const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { Prisma } = require('@prisma/client');

// In-memory transaction contract only: NOT PostgreSQL isolation/unique-constraint proof.
function load(file, overrides = {}, cache = new Map()) {
  file = path.resolve(__dirname, '../src', file);
  function evaluate(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const mod = { exports: {} }; cache.set(filename, mod);
    const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const req = name => {
      if (name in overrides) return overrides[name];
      if (name === '@cafe-project/database') return { Prisma, prisma: {} };
      if (name.startsWith('.')) return evaluate(path.resolve(path.dirname(filename), name + '.ts'));
      return require(name);
    };
    new Function('require', 'module', 'exports', source)(req, mod, mod.exports);
    return mod.exports;
  }
  return evaluate(file);
}
const { PurchaseProposalService } = load('modules/agent/purchase-proposal.service.ts');
const snapshot = { supplierId: 'supplier', ingredientId: 'milk', quantity: 2, unit: 'bottle', baseUnit: 'ml', unitsPerPack: '1000', unitPrice: '100.00', notes: 'approved milk', emailContent: null };
const reference = p => ({ version: p.version, contentHash: p.contentHash });
const command = (p, idempotencyKey = 'key') => ({ ...reference(p), idempotencyKey });

function fixture() {
  let state = { proposals: {}, revisions: {}, requests: {}, receipts: {}, sequence: 0 };
  const users = { admin: { id: 'admin', role: 'ADMIN', isActive: true }, staff: { id: 'staff', role: 'STAFF', isActive: true } };
  let tail = Promise.resolve(), failReceipt = false, serializationFailures = 0;
  const db = { async $transaction(work, options) {
    assert.equal(options.isolationLevel, 'Serializable');
    const prior = tail; let release; tail = new Promise(r => { release = r; }); await prior;
    const before = structuredClone(state);
    const compound = w => w.proposalId_version.proposalId + ':' + w.proposalId_version.version;
    const byProposal = w => Object.values(state.requests).find(r => r.agentProposalId === w.agentProposalId_agentProposalVersion.agentProposalId && r.agentProposalVersion === w.agentProposalId_agentProposalVersion.agentProposalVersion) ?? null;
    const tx = {
      $queryRaw: async () => [], user: { findUnique: async ({ where }) => users[where.id] ?? null },
      supplier: { findUnique: async () => ({ status: 'ACTIVE' }) },
      ingredient: { findUnique: async () => ({ id: 'milk', isActive: true, baseUnit: 'ml' }) },
      supplierIngredient: { findUnique: async () => ({ conversionQuantity: '1000', conversionTargetUnit: 'ml', minOrderQuantity: 1, purchaseUnit: 'bottle', pricePerBaseUnit: '0.1' }) },
      agentPurchaseProposal: {
        findUnique: async ({ where }) => state.proposals[where.id] ?? null,
        create: async ({ data }) => state.proposals[data.id] = { currentVersion: 1, ...data },
        update: async ({ where, data }) => Object.assign(state.proposals[where.id], data),
      },
      agentPurchaseProposalVersion: {
        findUnique: async ({ where }) => state.revisions[compound(where)] ?? null,
        create: async ({ data }) => state.revisions[data.proposalId + ':' + data.version] = { approvedAt: null, approvedById: null, ...structuredClone(data) },
        update: async ({ where, data }) => Object.assign(state.revisions[compound(where)], data),
      },
      purchaseRequest: {
        findUnique: async ({ where }) => byProposal(where),
        findFirst: async ({ where }) => Object.values(state.requests).find(r => r.agentProposalId === where.agentProposalId) ?? null,
        create: async ({ data }) => {
          if (Object.values(state.requests).some(r => r.agentProposalId === data.agentProposalId && r.agentProposalVersion === data.agentProposalVersion)) throw Object.assign(new Error('unique'), { code: 'P2002' });
          const row = { ...data, id: 'pr-' + ++state.sequence, totalAmount: data.totalAmount.toString(), items: [{ ...data.items.create }] };
          state.requests[row.id] = row; return row;
        },
      },
      agentPurchaseCommandReceipt: {
        findUnique: async ({ where }) => state.receipts[where.key] ?? null,
        create: async ({ data }) => { if (failReceipt) throw new Error('INJECTED_RECEIPT_FAILURE'); return state.receipts[data.key] = structuredClone(data); },
      },
    };
    try {
      if (serializationFailures-- > 0) throw Object.assign(new Error('serialization'), { code: 'P2034' });
      return structuredClone(await work(tx));
    } catch (error) { state = before; throw error; } finally { release(); }
  } };
  return { db, service: new PurchaseProposalService(db), users, state: () => structuredClone(state), fault: value => { failReceipt = value; }, serialization: n => { serializationFailures = n; } };
}

test('1: proposal exists before PR; execute without approval denied', async () => {
  const f = fixture(), p = await f.service.create('proposal', snapshot);
  assert.equal(Object.keys(f.state().requests).length, 0);
  await assert.rejects(f.service.execute(p.proposalId, command(p)), /APPROVAL_REQUIRED/);
  assert.equal(Object.keys(f.state().requests).length, 0);
});
test('2: STAFF, disabled ADMIN, and forged approval fields rejected', async () => {
  const f = fixture(), p = await f.service.create('proposal', snapshot);
  await assert.rejects(f.service.approve(p.proposalId, 'staff', reference(p)), /ADMIN_REQUIRED/);
  f.users.admin.isActive = false;
  await assert.rejects(f.service.approve(p.proposalId, 'admin', reference(p)), /ADMIN_REQUIRED/);
  await assert.rejects(f.service.execute(p.proposalId, { ...command(p), approved: true, actorId: 'admin', role: 'ADMIN' }));
});
test('3: exact ADMIN revision creates matching approved snapshot once', async () => {
  const f = fixture(), p = await f.service.create('proposal', snapshot);
  const approved = await f.service.approve(p.proposalId, 'admin', reference(p));
  assert.equal(approved.approvedById, 'admin'); assert.ok(approved.approvedAt);
  const r = await f.service.execute(p.proposalId, command(p));
  assert.equal(r.purchaseRequest.supplierId, snapshot.supplierId);
  assert.equal(r.purchaseRequest.items[0].quantity, 2); assert.equal(r.purchaseRequest.totalAmount, '200');
  assert.equal(r.purchaseRequest.items[0].unitPrice, '100.00'); assert.equal(r.purchaseRequest.status, 'APPROVED');
  assert.equal(r.purchaseRequest.notes, snapshot.notes); assert.equal(Object.keys(f.state().requests).length, 1);
});
test('4: edit increments version, retains old approval history, demands fresh approval', async () => {
  const f = fixture(), p = await f.service.create('proposal', snapshot);
  await f.service.approve(p.proposalId, 'admin', reference(p));
  const revised = await f.service.revise(p.proposalId, reference(p), { ...snapshot, quantity: 3 });
  assert.equal(revised.version, 2); assert.equal(revised.approvedById, null);
  assert.equal(f.state().revisions['proposal:1'].approvedById, 'admin');
  await assert.rejects(f.service.execute(p.proposalId, command(p)), /STALE_PROPOSAL/);
  await assert.rejects(f.service.execute(p.proposalId, command(revised)), /APPROVAL_REQUIRED/);
  await f.service.approve(p.proposalId, 'admin', reference(revised));
  const result = await f.service.execute(p.proposalId, command(revised)); assert.equal(result.purchaseRequest.items[0].quantity, 3);
});
test('5: replacement payload or different hash cannot replace approved snapshot', async () => {
  const f = fixture(), p = await f.service.create('proposal', snapshot);
  await f.service.approve(p.proposalId, 'admin', reference(p));
  await assert.rejects(f.service.execute(p.proposalId, { ...command(p), snapshot: { ...snapshot, quantity: 99 } }));
  await assert.rejects(f.service.execute(p.proposalId, { ...command(p), contentHash: '0'.repeat(64) }), /STALE_PROPOSAL/);
  assert.equal(Object.keys(f.state().requests).length, 0);
});
test('6/7/11: retry, changed key, and new service after lost response recover same PR', async () => {
  const f = fixture(), p = await f.service.create('proposal', snapshot);
  await f.service.approve(p.proposalId, 'admin', reference(p));
  const committed = await f.service.execute(p.proposalId, command(p)); // caller discards response
  const restarted = new PurchaseProposalService(f.db);
  const replay = await restarted.execute(p.proposalId, command(p));
  const otherKey = await restarted.execute(p.proposalId, command(p, 'other'));
  assert.equal(replay.purchaseRequest.id, committed.purchaseRequest.id);
  assert.equal(otherKey.purchaseRequest.id, committed.purchaseRequest.id);
  assert.equal(Object.keys(f.state().requests).length, 1);
  await assert.rejects(restarted.revise(p.proposalId, reference(p), { ...snapshot, quantity: 3 }), /ALREADY_EXECUTED/);
});
test('8: same command key different proposal rejected without second PR', async () => {
  const f = fixture(), a = await f.service.create('a', snapshot), b = await f.service.create('b', { ...snapshot, quantity: 3 });
  await f.service.approve('a', 'admin', reference(a)); await f.service.approve('b', 'admin', reference(b));
  await f.service.execute('a', command(a));
  await assert.rejects(f.service.execute('b', command(b)), /IDEMPOTENCY_CONFLICT/);
  assert.equal(Object.keys(f.state().requests).length, 1);
});
test('9: concurrent approvals/executions serialize in mock contract; unique SQL remains integration requirement', async () => {
  const f = fixture(), p = await f.service.create('proposal', snapshot);
  await Promise.all(Array.from({ length: 8 }, () => f.service.approve('proposal', 'admin', reference(p))));
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => f.service.execute('proposal', command(p, 'parallel-' + i))));
  assert.equal(new Set(results.map(r => r.purchaseRequest.id)).size, 1);
  assert.equal(Object.keys(f.state().receipts).length, 8);
});
test('10: receipt failure rolls back PR; approved proposal remains retryable', async () => {
  const f = fixture(), p = await f.service.create('proposal', snapshot);
  await f.service.approve('proposal', 'admin', reference(p)); f.fault(true);
  await assert.rejects(f.service.execute('proposal', command(p)), /INJECTED_RECEIPT_FAILURE/);
  assert.equal(Object.keys(f.state().requests).length, 0); assert.equal(Object.keys(f.state().receipts).length, 0);
  f.fault(false); await f.service.execute('proposal', command(p)); assert.equal(Object.keys(f.state().requests).length, 1);
});
test('serialization retry rechecks transaction; revoked ADMIN cannot authorize new write', async () => {
  const f = fixture(); f.serialization(2); const p = await f.service.create('proposal', snapshot);
  await f.service.approve('proposal', 'admin', reference(p)); f.users.admin.role = 'STAFF';
  await assert.rejects(f.service.execute('proposal', command(p)), /ADMIN_REQUIRED/);
  assert.equal(Object.keys(f.state().requests).length, 0);
});
test('12: Agent runtime has no Prisma PurchaseRequest mutation, legacy scan outputs proposals', () => {
  const root = path.resolve(__dirname, '../../agent/src');
  function files(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => d.isDirectory() ? files(path.join(dir, d.name)) : d.name.endsWith('.ts') ? [path.join(dir, d.name)] : []); }
  for (const file of files(root)) assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /\b(?:prisma|tx)\.purchaseRequest\.(?:create|createMany|upsert|update|updateMany|delete|deleteMany)\s*\(/, file);
  const service = fs.readFileSync(path.join(root, 'services/agent.service.ts'), 'utf8');
  assert.match(service, /const createdPurchaseRequests: never\[\] = \[\]/); assert.doesNotMatch(service, /createdPurchaseRequests\.push/);
  assert.match(service, /proposeFromRecommendation/);
});

test('HTTP: service token cannot approve or reach manual PR route; JWT identity cannot be body-spoofed', async t => {
  const express = require('express');
  const { Readable } = require('node:stream');
  const f = fixture(), p = await f.service.create('proposal', snapshot);
  const token = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-';
  const previous = process.env.AGENT_INTERNAL_TOKEN; process.env.AGENT_INTERNAL_TOKEN = token;
  t.after(() => { if (previous === undefined) delete process.env.AGENT_INTERNAL_TOKEN; else process.env.AGENT_INTERNAL_TOKEN = previous; });
  const authSource = { verifyAuthToken: token => { if (!['signed-admin', 'signed-staff'].includes(token)) throw Error('invalid'); return { id: token.slice(7) }; }, getCurrentUser: async id => f.users[id] };
  const router = load('modules/agent/purchase-proposal.route.ts', { './auth.service': authSource, '../auth/auth.service': authSource });
  const app = express(); app.use(express.json()); app.use('/agent', router.createPurchaseProposalRouter(f.service));
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ error: error.message }));
  // Dispatch Express in process; no listening socket, provider, DB or file writes.
  const dispatch = (url, body, headers = {}) => new Promise((resolve, reject) => {
    const { ServerResponse } = require('node:http');
    const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
    Object.assign(req, { method: 'POST', url, headers: { host: 'test', 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(JSON.stringify(body ?? ''))), ...headers } });
    const res = new ServerResponse(req); let raw = '';
    res.write = chunk => { raw += chunk; return true; };
    res.end = chunk => { if (chunk) raw += chunk; resolve({ status: res.statusCode, raw }); };
    app.handle(req, res, reject);
  });
  assert.equal((await dispatch('/agent/purchase-proposals/proposal/approve', { ...reference(p), role: 'ADMIN' }, { 'x-agent-internal-token': token })).status, 401);
  assert.equal((await dispatch('/agent/purchase-proposals/proposal/approve', reference(p), { authorization: 'Bearer signed-staff' })).status, 403);
  assert.equal((await dispatch('/agent/internal/purchase-proposals/proposal/approve', { ...reference(p), approved: true }, { 'x-agent-internal-token': token })).status, 404);
  assert.equal((await dispatch('/agent/purchase-proposals/proposal/approve', { ...reference(p), actorId: 'admin' }, { authorization: 'Bearer signed-admin' })).status, 400);
  assert.equal((await dispatch('/agent/purchase-proposals/proposal/approve', reference(p), { authorization: 'Bearer signed-admin' })).status, 200);
  assert.equal((await dispatch('/agent/internal/purchase-proposals/proposal/execute', command(p), { 'x-agent-internal-token': token })).status, 200);
});

test('Agent receives Backend result then verifies persisted snapshot; mismatched result fails closed', async t => {
  const client = load('../../agent/src/services/purchase-proposal.client.ts');
  const f = fixture(), p = await f.service.create('proposal', snapshot);
  await f.service.approve('proposal', 'admin', reference(p));
  const result = await f.service.execute('proposal', command(p));
  let tampered = false;
  const previous = process.env.AGENT_INTERNAL_TOKEN; process.env.AGENT_INTERNAL_TOKEN = 'test-service-secret';
  t.after(() => { if (previous === undefined) delete process.env.AGENT_INTERNAL_TOKEN; else process.env.AGENT_INTERNAL_TOKEN = previous; });
  t.mock.method(global, 'fetch', async (_url, options) => ({ ok: true, json: async () => ({ data: options.method === 'POST' ? result : { ...p, purchaseRequest: { ...result.purchaseRequest, items: [{ ...result.purchaseRequest.items[0], quantity: tampered ? 99 : 2 }] } } }) }));
  assert.equal((await client.executeApprovedPurchaseProposal('proposal', reference(p), 'key')).verified, true);
  tampered = true;
  await assert.rejects(client.executeApprovedPurchaseProposal('proposal', reference(p), 'key'), /UNVERIFIED/);
});
