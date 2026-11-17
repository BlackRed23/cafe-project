// Explicit opt-in test DB only; never loads .env or falls back to DATABASE_URL.
// Requires migrated dedicated database + existing ADMIN and supplier/ingredient fixtures.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { randomUUID } = require('node:crypto');
const { PrismaClient, Prisma } = require('@prisma/client');

const testUrl = process.env.PURCHASE_APPROVAL_TEST_DATABASE_URL;
test('PostgreSQL: real unique constraint, concurrent writes, rollback, restart/retry', { skip: !testUrl && 'NOT_RUN: explicit PURCHASE_APPROVAL_TEST_DATABASE_URL absent' }, async () => {
  let parsed;
  try { parsed = new URL(testUrl); } catch { throw new Error('Invalid dedicated test DB configuration (value hidden)'); }
  assert.match(parsed.protocol, /^postgres(?:ql)?:$/);
  assert.match(decodeURIComponent(parsed.pathname), /test/i, 'Database name must explicitly contain test');
  assert.equal(process.env.PURCHASE_APPROVAL_TEST_DATABASE_CONFIRMED, 'YES', 'Explicit test-write confirmation required');
  const adminId = process.env.PURCHASE_APPROVAL_TEST_ADMIN_ID;
  const ingredientId = process.env.PURCHASE_APPROVAL_TEST_INGREDIENT_ID;
  const supplierId = process.env.PURCHASE_APPROVAL_TEST_SUPPLIER_ID;
  assert.ok(adminId && ingredientId && supplierId, 'Explicit existing test fixtures required');
  const db = new PrismaClient({ datasources: { db: { url: testUrl } } });
  function load(file) {
    const filename = path.resolve(__dirname, '../src', file), mod = { exports: {} };
    const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    new Function('require', 'module', 'exports', js)(name => name === '@cafe-project/database' ? { Prisma, prisma: db } : name.startsWith('.') ? load(path.relative(path.resolve(__dirname, '../src'), path.resolve(path.dirname(filename), name + '.ts'))) : require(name), mod, mod.exports);
    return mod.exports;
  }
  const { PurchaseProposalService } = load('modules/agent/purchase-proposal.service.ts');
  const ids = Array.from({ length: 3 }, () => 'approval-test-' + randomUUID());
  const keys = Array.from({ length: 8 }, () => 'approval-key-' + randomUUID());
  try {
    // Missing additive migration fails here; this script does not apply migrations.
    await db.agentPurchaseProposal.count();
    const admin = await db.user.findUnique({ where: { id: adminId }, select: { role: true, isActive: true } });
    assert.equal(admin?.role, 'ADMIN'); assert.equal(admin.isActive, true);
    const ingredient = await db.ingredient.findUniqueOrThrow({ where: { id: ingredientId } });
    const link = await db.supplierIngredient.findUniqueOrThrow({ where: { supplierId_ingredientId: { supplierId, ingredientId } } });
    const snapshot = { supplierId, ingredientId, quantity: Math.max(1, link.minOrderQuantity), unit: link.purchaseUnit,
      baseUnit: ingredient.baseUnit, unitsPerPack: link.conversionQuantity.toString(),
      unitPrice: link.pricePerBaseUnit.mul(link.conversionQuantity).toFixed(2), notes: 'isolated test only', emailContent: null };
    const service = new PurchaseProposalService(db);
    const p = await service.create(ids[0], snapshot), ref = { version: p.version, contentHash: p.contentHash };
    await assert.rejects(service.execute(ids[0], { ...ref, idempotencyKey: keys[0] }), /APPROVAL_REQUIRED/);
    await Promise.all([service.approve(ids[0], adminId, ref), service.approve(ids[0], adminId, ref)]);
    const results = await Promise.all(keys.slice(0, 4).map(idempotencyKey => service.execute(ids[0], { ...ref, idempotencyKey })));
    assert.equal(new Set(results.map(r => r.purchaseRequest.id)).size, 1);
    assert.equal(await db.purchaseRequest.count({ where: { agentProposalId: ids[0] } }), 1);
    const restarted = new PurchaseProposalService(db);
    assert.equal((await restarted.execute(ids[0], { ...ref, idempotencyKey: keys[4] })).purchaseRequest.id, results[0].purchaseRequest.id);
    const q = await service.create(ids[1], snapshot), qr = { version: q.version, contentHash: q.contentHash };
    await service.approve(ids[1], adminId, qr);
    await assert.rejects(service.execute(ids[1], { ...qr, idempotencyKey: keys[0] }), /IDEMPOTENCY_CONFLICT/);
    // Fail after INSERT PurchaseRequest but before receipt commit on a real transaction.
    const failing = new PurchaseProposalService({ $transaction: (work, options) => db.$transaction(tx => work(new Proxy(tx, {
      get(target, key) { return key === 'agentPurchaseCommandReceipt' ? { findUnique: args => target.agentPurchaseCommandReceipt.findUnique(args), create: async () => { throw new Error('INJECTED_RECEIPT_FAILURE'); } } : Reflect.get(target, key); },
    })), options) });
    await assert.rejects(failing.execute(ids[1], { ...qr, idempotencyKey: keys[5] }), /INJECTED_RECEIPT_FAILURE/);
    assert.equal(await db.purchaseRequest.count({ where: { agentProposalId: ids[1] } }), 0);
    const recovered = await service.execute(ids[1], { ...qr, idempotencyKey: keys[5] });
    // Direct SQL/ORM bypass still cannot insert second PR for same proposal/version.
    await assert.rejects(db.purchaseRequest.create({ data: { requestNumber: 'test-' + randomUUID(), supplierId,
      requestedBy: adminId, agentProposalId: ids[1], agentProposalVersion: qr.version } }), e => e.code === 'P2002');
    assert.equal((await restarted.execute(ids[1], { ...qr, idempotencyKey: keys[5] })).purchaseRequest.id, recovered.purchaseRequest.id);
  } finally {
    // Only records with this run's random proposal IDs; no fixture/user cleanup.
    await db.$transaction(async tx => {
      const requests = await tx.purchaseRequest.findMany({ where: { agentProposalId: { in: ids } }, select: { id: true } });
      const requestIds = requests.map(r => r.id);
      await tx.agentPurchaseCommandReceipt.deleteMany({ where: { purchaseRequestId: { in: requestIds } } });
      await tx.purchaseRequestItem.deleteMany({ where: { requestId: { in: requestIds } } });
      await tx.purchaseRequest.deleteMany({ where: { id: { in: requestIds } } });
      await tx.agentPurchaseProposalVersion.deleteMany({ where: { proposalId: { in: ids } } });
      await tx.agentPurchaseProposal.deleteMany({ where: { id: { in: ids } } });
    });
    await db.$disconnect();
  }
});
