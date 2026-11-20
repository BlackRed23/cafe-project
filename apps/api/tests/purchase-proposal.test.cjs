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
      ingredient: { findUnique: async () => ({ id: 'milk', isActive: true, deletedAt: null, baseUnit: 'ml', updatedAt: new Date(0) }) },
      ingredientBatch: { findFirst: async () => null },
      purchaseOrderItem: { findFirst: async () => null },
      inventory: { findUnique: async () => ({ id: 'inv-milk', updatedAt: new Date(0) }) },
      inventoryBatch: { findFirst: async () => null },
      supplierIngredient: { findUnique: async () => ({ conversionQuantity: '1000', conversionTargetUnit: 'ml', minOrderQuantity: 1, purchaseUnit: 'bottle', pricePerBaseUnit: '0.1' }) },
      agentPurchaseProposal: {
        findUnique: async ({ where }) => state.proposals[where.id] ?? null,
        create: async ({ data }) => state.proposals[data.id] = { currentVersion: 1, ...data },
        update: async ({ where, data }) => Object.assign(state.proposals[where.id], data),
      },
      agentPurchaseProposalVersion: {
        findUnique: async ({ where }) => state.revisions[compound(where)] ?? null,
        create: async ({ data }) => state.revisions[data.proposalId + ':' + data.version] = { approvedAt: null, approvedById: null, createdAt: new Date(), ...structuredClone(data) },
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
  return {
    db, service: new PurchaseProposalService(db), users,
    state: () => structuredClone(state),
    // Only the in-memory fixture is mutated to simulate damaged persisted
    // rows. This helper cannot alter live PostgreSQL or real proposals.
    corruptVersion: (key, fields) => Object.assign(state.revisions[key], fields),
    fault: value => { failReceipt = value; }, serialization: n => { serializationFailures = n; }
  };
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
test('AI18: exact-revision ADMIN rejection is durable, replay-stable and forbids purchase after veto', async () => {
  const f = fixture(), p = await f.service.create('rejected', snapshot);
  const payload = { ...reference(p), reason: 'Supplier terms are not accepted' };
  await assert.rejects(f.service.reject('rejected', 'staff', payload), /ADMIN_REQUIRED/);
  await assert.rejects(f.service.reject('rejected', 'admin',
    { ...payload, contentHash: 'a'.repeat(64) }), /STALE_PROPOSAL/);
  const decision = await f.service.reject('rejected', 'admin', payload);
  assert.equal(decision.rejectedById, 'admin');
  assert.equal(decision.rejectionReason, payload.reason);
  assert.ok(decision.rejectedAt);
  const repeated = await new PurchaseProposalService(f.db).reject('rejected', 'admin', payload);
  assert.deepEqual(repeated, decision);
  await assert.rejects(f.service.reject('rejected', 'admin',
    { ...payload, reason: 'Changed rejection reason' }), /PROPOSAL_ALREADY_REJECTED/);
  await assert.rejects(f.service.approve('rejected', 'admin', reference(p)), /PROPOSAL_REJECTED/);
  await assert.rejects(f.service.execute('rejected', command(p)), /PROPOSAL_REJECTED/);
  assert.equal(Object.keys(f.state().requests).length, 0);
  assert.equal(Object.keys(f.state().receipts).length, 0);
});

test('AI18/AI19: rejected history survives new version, stale approval cannot restore old proposal', async () => {
  const f = fixture(), p = await f.service.create('rejected', snapshot);
  await f.service.reject('rejected', 'admin', {
    ...reference(p), reason: 'Replenishment no longer required'
  });
  const next = await f.service.revise('rejected', reference(p), {
    ...snapshot, quantity: 3
  });
  assert.equal(next.version, 2);
  assert.equal(next.approvedById, null);
  assert.ok(f.state().revisions['rejected:1'].rejectedAt);
  await assert.rejects(f.service.approve('rejected', 'admin', reference(p)), /STALE_PROPOSAL/);
  await assert.rejects(f.service.execute('rejected', command(next)), /APPROVAL_REQUIRED/);
  assert.equal(Object.keys(f.state().requests).length, 0);
});

test('AI18 concurrent ADMIN vetoes produce exactly one rejection decision', async () => {
  const f = fixture(), p = await f.service.create('rejected', snapshot);
  const data = { ...reference(p), reason: 'Independent operator review required' };
  const responses = await Promise.all(Array.from({ length: 6 },
    () => f.service.reject('rejected', 'admin', data)));
  assert.ok(responses.every(row => row.rejectedById === 'admin'));
  assert.equal(new Set(responses.map(row => row.rejectedAt.toISOString())).size, 1);
  assert.equal(Object.keys(f.state().requests).length, 0);
});

test('AI18: a veto before purchase execution overrides an older approval without erasing its audit', async () => {
  const f = fixture(), p = await f.service.create('veto-approved', snapshot);
  const approved = await f.service.approve('veto-approved', 'admin', reference(p));
  assert.ok(approved.approvedAt);
  const rejected = await f.service.reject('veto-approved', 'admin', {
    ...reference(p), reason: 'Do not place purchase, unsafe stock projection'
  });
  assert.equal(rejected.approvedById, 'admin');
  assert.equal(rejected.rejectedById, 'admin');
  await assert.rejects(f.service.execute('veto-approved', command(p)),
    /PROPOSAL_REJECTED/);
  assert.equal(Object.keys(f.state().requests).length, 0);
});

test('AI18/AI19: review status reads active ADMIN and exact hash in one serializable transaction, never authorizes execution', async () => {
  const f = fixture(), p = await f.service.create('status-review', snapshot);
  const ref = reference(p);
  const pending = await f.service.readReviewStatus('status-review', 'admin', ref);
  assert.equal(pending.status, 'PENDING_APPROVAL');
  assert.equal(pending.writesPerformed, false);
  assert.equal(pending.purchaseRequestId, null);
  await assert.rejects(f.service.readReviewStatus('status-review', 'staff', ref), /ADMIN_REQUIRED/);
  await assert.rejects(f.service.readReviewStatus('status-review', 'admin', {
    ...ref, contentHash: '0'.repeat(64)
  }), /STALE_PROPOSAL/);
  await f.service.reject('status-review', 'admin', {
    ...ref, reason: 'Rejection remains operator controlled'
  });
  const rejected = await f.service.readReviewStatus('status-review', 'admin', ref);
  assert.equal(rejected.status, 'REJECTED');
  assert.equal(rejected.rejectedById, 'admin');
  assert.equal(rejected.writesPerformed, false);
  f.users.admin.isActive = false;
  await assert.rejects(f.service.readReviewStatus('status-review', 'admin', ref), /ADMIN_REQUIRED/);
  assert.equal(Object.keys(f.state().requests).length, 0);
});
test('AI19/AI22: deactivated original approver cannot remain authorized by an unrelated active ADMIN read or repeat approval', async () => {
  const f = fixture(), p = await f.service.create('disabled-approver', snapshot);
  f.users.reviewer = { id: 'reviewer', role: 'ADMIN', isActive: true };
  const approved = await f.service.approve('disabled-approver', 'admin', reference(p));
  assert.equal(approved.approvedById, 'admin');
  f.users.admin.isActive = false;
  for (const action of [
    () => f.service.readReviewStatus('disabled-approver', 'reviewer', reference(p)),
    () => f.service.approve('disabled-approver', 'reviewer', reference(p))
  ]) {
    await assert.rejects(action(),
      error => error.statusCode === 409 && error.code === 'APPROVER_NO_LONGER_ACTIVE');
  }
  await assert.rejects(f.service.execute('disabled-approver', command(p)), /ADMIN_REQUIRED/);
  assert.equal(f.state().revisions['disabled-approver:1'].approvedById, 'admin');
  assert.equal(Object.keys(f.state().requests).length, 0);
  assert.equal(Object.keys(f.state().receipts).length, 0);
});
test('AI18/AI19: later authorized veto remains visible and a newer revision requires independent approval after role loss', async () => {
  const f = fixture(), p = await f.service.create('review-after-demotion', snapshot);
  f.users.reviewer = { id: 'reviewer', role: 'ADMIN', isActive: true };
  await f.service.approve('review-after-demotion', 'admin', reference(p));
  f.users.admin.role = 'STAFF';
  await assert.rejects(f.service.readReviewStatus('review-after-demotion', 'reviewer', reference(p)),
    error => error.statusCode === 409 && error.code === 'APPROVER_NO_LONGER_ACTIVE');
  const rejected = await f.service.reject('review-after-demotion', 'reviewer',
    { ...reference(p), reason: 'Original ADMIN no longer authorized' });
  assert.equal(rejected.rejectedById, 'reviewer');
  const visible = await f.service.readReviewStatus('review-after-demotion', 'reviewer', reference(p));
  assert.equal(visible.status, 'REJECTED');
  const next = await f.service.revise('review-after-demotion', reference(p), { ...snapshot, quantity: 3 });
  assert.equal(next.approvedById, null);
  await assert.rejects(f.service.execute('review-after-demotion', command(next)), /APPROVAL_REQUIRED/);
  assert.equal(Object.keys(f.state().requests).length, 0);
});
test('AI19/AI23: malformed persisted snapshot returns explicit integrity 409, not HTTP500 or stale', async () => {
  const f = fixture(), p = await f.service.create('corrupt-row', snapshot);
  const ref = reference(p);
  f.corruptVersion('corrupt-row:1', { snapshot: {
    supplierId: 'supplier', ingredientId: 'milk', quantity: -99,
    unit: 'bottle', baseUnit: 'ml', unitsPerPack: '1000',
    unitPrice: '100.00', notes: 'untrusted malformed', emailContent: null
  } });
  for (const candidate of [ref, { ...ref, contentHash: 'f'.repeat(64) }]) {
    await assert.rejects(f.service.readReviewStatus('corrupt-row', 'admin', candidate),
      error => error.statusCode === 409 && error.code === 'SNAPSHOT_INTEGRITY');
  }
  await assert.rejects(f.service.approve('corrupt-row', 'admin', ref),
    error => error.statusCode === 409 && error.code === 'SNAPSHOT_INTEGRITY');
  assert.equal(Object.keys(f.state().requests).length, 0);
  assert.equal(Object.keys(f.state().receipts).length, 0);
});
test('AI18/AI19: damaged stored hash or half-written ADMIN rejection metadata fails closed', async () => {
  const f = fixture(), p = await f.service.create('bad-metadata', snapshot);
  f.corruptVersion('bad-metadata:1', { rejectedById: 'admin', rejectedAt: null,
    rejectionReason: 'Forged inconsistent decision' });
  await assert.rejects(f.service.readReviewStatus('bad-metadata', 'admin', reference(p)),
    error => error.statusCode === 409 && error.code === 'SNAPSHOT_INTEGRITY');
  f.corruptVersion('bad-metadata:1', { rejectedById: null,
    rejectionReason: null, contentHash: 'a'.repeat(64) });
  await assert.rejects(f.service.readReviewStatus('bad-metadata', 'admin', reference(p)),
    error => error.statusCode === 409 && error.code === 'SNAPSHOT_INTEGRITY');
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
