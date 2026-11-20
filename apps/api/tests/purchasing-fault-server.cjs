// Dedicated opt-in fault process. Production services remain unmodified.
// Deliberate errors occur AFTER actual SQL writes but BEFORE Prisma commit.
const assert = require('node:assert/strict');
assert.equal(process.env.PURCHASING_FAULT_CONFIRMED, 'YES');
require('dotenv').config({ path: 'apps/api/.env', quiet: true });
const url = new URL(process.env.DATABASE_URL);
assert.equal(url.pathname, '/cafedb');
url.hostname = '127.0.0.1'; url.port = '55432'; process.env.DATABASE_URL = url.toString();
process.env.NODE_ENV = 'test';
require('ts-node').register({ project: 'apps/api/tsconfig.json', transpileOnly: true });
const { prisma } = require('@cafe-project/database');
const native = prisma.$transaction.bind(prisma);
prisma.$transaction = (callback, options) => {
  if (typeof callback !== 'function') return native(callback, options);
  return native(async tx => {
    const wrap = (model, key) => new Proxy(model, { get(target, name) {
      const method = Reflect.get(target, name);
      if (typeof method !== 'function') return method;
      if (key === 'inventoryTransaction' && name === 'create') return async args => {
        const row = await method.call(target, args);
        if (args.data?.referenceType === 'GoodsReceipt' &&
            args.data?.reason?.includes('__NH_LEDGER_ROLLBACK__'))
          throw new Error('NH_TEST_ONLY_FAILURE_AFTER_IMPORT_LEDGER_INSERT');
        return row;
      };
      if (key === 'purchaseOrder' && name === 'update') return async args => {
        if (args.data?.status === 'RECEIVED') {
          const po = await model.findUnique({ where: { id: args.where.id },
            include: { purchaseRequest: { select: { notes: true } } } });
          if (po?.purchaseRequest?.notes?.includes('__NH_PO_FINALIZE_ROLLBACK__')) {
            const row = await method.call(target, args);
            throw new Error('NH_TEST_ONLY_FAILURE_AFTER_PO_FINAL_STATUS_UPDATE');
          }
        }
        return method.call(target, args);
      };
      return method.bind(target);
    }});
    return callback(new Proxy(tx, { get(target, name) {
      if (name === 'inventoryTransaction' || name === 'purchaseOrder')
        return wrap(Reflect.get(target, name), name);
      return Reflect.get(target, name);
    }}));
  }, options);
};
const express = require('express');
const app = express();
app.set('json replacer', (_key, value) => typeof value === 'bigint' ? value.toString() : value);
app.use(express.json());
const supplier = require('../src/modules/supplier/supplier.route');
const purchase = require('../src/modules/purchase/purchase.route');
app.use('/api/ingredients', require('../src/modules/ingredient/ingredient.route').ingredientRoutes);
app.use('/api/suppliers', supplier.supplierRoutes);
app.use('/api/supplier-products', supplier.supplierProductRoutes);
app.use('/api/purchase-requests', purchase.default);
app.use('/api/purchase-orders', purchase.purchaseOrderRoutes);
app.use(require('../src/common/error-handler').errorHandler);
const server = app.listen(5005,'127.0.0.1',()=>console.log('Purchasing fault-only server ready :5005'));
process.on('SIGTERM',()=>server.close(()=>process.exit()));
