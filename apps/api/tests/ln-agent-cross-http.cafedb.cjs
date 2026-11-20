// Opt-in cross-module acceptance. Real HTTP -> Agent service -> Backend -> Prisma -> existing cafedb.
// No external LLM, supplier mail, charge/refund or destructive database cleanup.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const { randomUUID, randomBytes } = require('node:crypto');
assert.equal(process.env.LN_CAFEDB_CONFIRMED, 'YES', 'Explicit approval to use existing cafedb required');
require('dotenv').config({ path: 'apps/api/.env', quiet: true });
const dbURL = new URL(process.env.DATABASE_URL);
assert.equal(dbURL.pathname, '/cafedb');
dbURL.hostname = '127.0.0.1';
dbURL.port = process.env.LN_DB_PORT || '15432';
process.env.DATABASE_URL = dbURL.toString();
process.env.NODE_ENV = 'test';
process.env.AGENT_INTERNAL_TOKEN = randomBytes(32).toString('base64url');
process.env.PAYMENT_REFUND_POLICY_ENABLED = 'false';
process.env.PAYMENT_REFUND_EXECUTION_ENABLED = 'false';
require('ts-node').register({ project: 'apps/api/tsconfig.json', transpileOnly: true });
const { prisma: db } = require('@cafe-project/database');
const jwt = require('jsonwebtoken');
const express = require('express');
const runId = 'ln-agent-' + randomUUID();
const dir = 'D:/KLTN/cafe-project-artifacts/reports/cross-workflow';
fs.mkdirSync(dir, { recursive: true });
const evidence = dir + '/' + runId + '.json';
const report = { runId, date: new Date().toISOString(), db: 'cafedb', evidenceClass: 'REAL_AGENT_HTTP_AND_BACKEND_PRISMA_PG_NOT_LANGGRAPH', requests: [], cases: [], operationalNotes: ['Existing AgentService/AgentWorkflow used; LangGraph runtime not available', 'All fixtures additive; no real supplier email, financial charge or refund'] };
const stringify = value => JSON.stringify(value, (key, data) => {
  if (/authorization|token|password|secret|signature/i.test(key)) return undefined;
  if (typeof data === 'bigint') return String(data);
  return data;
}, 2);
const save = () => fs.writeFileSync(evidence, stringify(report), 'utf8');
const listen = server => new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve(server.address().port)); });
const close = server => server ? new Promise(resolve => server.close(resolve)) : Promise.resolve();
let agentServer, backendServer, base, adminToken, admin, supplier;
const call = async (method, path, body, role = 'ADMIN') => {
  const started = new Date().toISOString();
  const response = await fetch(base + path, {
    method, headers: { 'content-type': 'application/json',
      ...(role === 'ADMIN' ? { authorization: 'Bearer ' + adminToken } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(45000)
  });
  const raw = await response.text();
  let data; try { data = JSON.parse(raw); } catch { data = { raw: raw.slice(0, 250) }; }
  const event = { id: 'H' + (report.requests.length + 1), method, path, role, status: response.status,
    started, ended: new Date().toISOString(), request: body, response: data };
  report.requests.push(event); return event;
};
const must = (event, status) => { assert.equal(event.status, status, stringify(event)); return event.response.data; };
const fixture = async (name, initial = 20) => {
  const tag = runId + '-' + name;
  const ingredient = await db.ingredient.create({
    data: { sku: tag, name: 'LN Agent test ' + name, baseUnit: 'g', quantity: String(initial),
      reserved: '0', minThreshold: '100', costPerBaseUnit: '0.1', expiryClassification: 'PERISHABLE',
      isActive: true, ...(initial > 0 ? { batches: { create: {
        batchCode: tag + '-batch', quantityInitial: String(initial), quantityRemaining: String(initial),
        unitCost: '0.1', qualityStatus: 'AVAILABLE',
        expirationDate: new Date(Date.now() + 20 * 86400000)
      } } } : {}) }
  });
  const link = await db.supplierIngredient.create({ data: {
    supplierId: supplier.id, ingredientId: ingredient.id, pricePerBaseUnit: '0.1',
    purchaseUnit: 'bag', conversionQuantity: '100', conversionTargetUnit: 'g',
    minOrderQuantity: 1, leadTimeDays: 2, isPreferred: true
  } });
  const batch = await db.ingredientBatch.findFirst({ where: { ingredientId: ingredient.id } });
  return { ingredient, batch, link };
};
const test = async (id, fn) => {
  const start = report.requests.length;
  try { const assertions = await fn(); report.cases.push({ id, verdict: 'BACKEND_PASS', requestIds: report.requests.slice(start).map(x => x.id), assertions }); }
  catch (error) { report.cases.push({ id, verdict: 'FAIL', requestIds: report.requests.slice(start).map(x => x.id), error: error.stack || String(error) }); process.exitCode = 1; }
  save(); console.log(id + ' ' + report.cases.at(-1).verdict);
};
const scan = ingredientId => call('POST', '/api/agent/scan-inventory', {
  ingredientIds: [ingredientId], scope: 'INGREDIENT', triggerType: 'LN_CROSS_WORKFLOW'
});
async function main() {
  admin = await db.user.findFirstOrThrow({ where: { role: 'ADMIN', isActive: true }, select: { id: true, role: true, email: true } });
  adminToken = jwt.sign(admin, process.env.JWT_SECRET, { expiresIn: '20m' });
  supplier = await db.supplier.create({ data: { name: runId + '-supplier', status: 'ACTIVE', email: null } });
  const { handleRequest } = require('../../agent/src/server.ts');
  agentServer = http.createServer((req, res) => {
    handleRequest(req, res).catch(() => { if (!res.headersSent) res.writeHead(500); res.end(); });
  });
  const agentPort = await listen(agentServer);
  process.env.AGENT_BASE_URL = 'http://127.0.0.1:' + agentPort;
  const app = express(); app.use(express.json()); app.set('json replacer', (_k, x) => typeof x === 'bigint' ? String(x) : x);
  app.use('/api/agent', require('../src/modules/agent/agent.route').default);
  app.use('/api/ingredients', require('../src/modules/ingredient/ingredient.route').ingredientRoutes);
  app.use(require('../src/common/error-handler').errorHandler);
  backendServer = http.createServer(app);
  const apiPort = await listen(backendServer);
  base = 'http://127.0.0.1:' + apiPort;
  process.env.API_INTERNAL_BASE_URL = base;
  report.agentPort = agentPort; report.apiPort = apiPort;
  const supplierProof = 'ADMIN_ATTESTATION_NOT_INDEPENDENTLY_VERIFIED';

  await test('LN-09', async () => {
    const { ingredient } = await fixture('inbound', 0);
    const pr = await db.purchaseRequest.create({ data: {
      requestNumber: runId + '-pr', status: 'APPROVED', supplierId: supplier.id,
      requestedBy: admin.id, approvedBy: admin.id, approvedAt: new Date(),
      items: { create: { ingredientId: ingredient.id, quantity: 3, unitPrice: '10' } }
    }, include: { items: true } });
    const po = await db.purchaseOrder.create({ data: {
      code: runId + '-po', purchaseRequestId: pr.id, supplierId: supplier.id,
      supplierName: supplier.name, createdById: admin.id,
      status: 'CONFIRMED', confirmedAt: new Date(), confirmedById: admin.id,
      confirmationSource: supplierProof,
      items: { create: { purchaseRequestItemId: pr.items[0].id,
        ingredientId: ingredient.id, quantityOrdered: 3, quantityReceived: 0,
        unit: 'bag', conversionToBase: '100', unitPrice: '10' } }
    } });
    const before = await db.purchaseRequest.count({ where: { items: { some: { ingredientId: ingredient.id } } } });
    const result = must(await scan(ingredient.id), 200);
    const after = await db.purchaseRequest.count({ where: { items: { some: { ingredientId: ingredient.id } } } });
    const hold = await db.agentLog.findFirst({ where: { action: 'SCAN_INGREDIENT_INBOUND_REVIEW', reference_id: ingredient.id }, orderBy: { triggered_at: 'desc' } });
    assert.ok(hold, stringify(result));
    assert.equal(after, before);
    assert.equal(result.createdProposals?.length || 0, 0);
    assert.equal((await db.purchaseOrder.findUnique({ where: { id: po.id } })).status, 'CONFIRMED');
    return { pr: pr.id, po: po.id, logId: hold.id, before, after, supplierProof, result: 'PO still conditional, no duplicate PR or PO' };
  });

  await test('LN-10', async () => {
    const { ingredient, batch } = await fixture('quarantine', 20);
    assert.ok(batch);
    const repo = require('../../agent/src/repositories/agent.repository.ts').agentRepository;
    const old = repo.getIngredientConsumption;
    let pause, resume, locked = false;
    const reached = new Promise(r => pause = r), gate = new Promise(r => resume = r);
    repo.getIngredientConsumption = async (...args) => {
      if (args[0] === ingredient.id && !locked) { locked = true; pause(); await gate; }
      return old.call(repo, ...args);
    };
    let scanResponse, lotResponse;
    try {
      const pending = scan(ingredient.id);
      await Promise.race([reached, new Promise((_r, rej) => setTimeout(() => rej(new Error('Agent never entered analysis gate')), 18000))]);
      lotResponse = await call('POST', '/api/ingredients/' + ingredient.id + '/batches/' + batch.id + '/quarantine',
        { requestId: randomUUID(), reason: 'LN10 quality hold during Agent analysis' });
      must(lotResponse, 200);
      resume();
      scanResponse = await pending;
    } finally { resume?.(); repo.getIngredientConsumption = old; }
    const data = must(scanResponse, 200);
    const hold = await db.agentLog.findFirst({ where: { action: 'SCAN_INGREDIENT_REVALIDATION_HOLD', reference_id: ingredient.id }, orderBy: { triggered_at: 'desc' } });
    const updated = await db.ingredientBatch.findUniqueOrThrow({ where: { id: batch.id } });
    assert.equal(updated.qualityStatus, 'QUARANTINED');
    assert.ok(hold, stringify(data));
    assert.equal(data.createdProposals?.length || 0, 0);
    return { holdId: hold.id, batchId: batch.id, quality: updated.qualityStatus,
      observation: 'Real HTTP quarantine completed while Agent scan paused at consumption analysis', noProposal: true };
  });

  await test('LN-15', async () => {
    const { ingredient, batch } = await fixture('stale-proposal', 20);
    const data = must(await scan(ingredient.id), 200);
    const proposal = data.createdProposals?.[0];
    assert.ok(proposal, stringify(data));
    const id = proposal.proposalId;
    const revision = await db.agentPurchaseProposalVersion.findFirstOrThrow({ where: { proposalId: id } });
    const before = await db.purchaseRequest.count({ where: { agentProposalId: id } });
    assert.equal(before, 0);
    must(await call('POST', '/api/ingredients/' + ingredient.id + '/batches/' + batch.id + '/quarantine',
      { requestId: randomUUID(), reason: 'LN15 stock changes after proposal generation' }), 200);
    const approval = await call('POST', '/api/agent/purchase-proposals/' + id + '/approve',
      { version: revision.version, contentHash: revision.contentHash });
    assert.equal(approval.status, 409, stringify(approval));
    const execute = await call('POST', '/api/agent/purchase-proposals/' + id + '/execute',
      { version: revision.version, contentHash: revision.contentHash, idempotencyKey: randomUUID() });
    assert.ok([403, 409].includes(execute.status), stringify(execute));
    assert.equal(await db.purchaseRequest.count({ where: { agentProposalId: id } }), 0);
    const fresh = await db.agentPurchaseProposalVersion.findUniqueOrThrow({ where: { proposalId_version: { proposalId: id, version: revision.version } } });
    assert.equal(fresh.approvedById, null);
    return { proposalId: id, staleApproval: approval.status, execute: execute.status,
      revisedQuality: 'QUARANTINED', createdPurchaseRequest: 0 };
  });
  save();
}
main().catch(error => { report.fatal = error.stack || String(error); process.exitCode = 1; save(); console.error(report.fatal); })
  .finally(async () => { await close(backendServer); await close(agentServer); await db.$disconnect(); console.log('EVIDENCE ' + evidence); });
