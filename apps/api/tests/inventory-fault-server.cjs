// Explicit opt-in real Prisma/PostgreSQL rollback harness for TK-06 and KK stocktake.
// Injections occur AFTER real SQL writes and BEFORE the surrounding transaction commits.
const assert = require('node:assert/strict');
assert.equal(process.env.INVENTORY_FAULT_CONFIRMED, 'YES');
require('dotenv').config({ path: 'apps/api/.env', quiet: true });
const url = new URL(process.env.DATABASE_URL);
assert.equal(url.pathname, '/cafedb');
url.hostname = '127.0.0.1'; url.port = '55432';
process.env.DATABASE_URL = url.toString();
process.env.NODE_ENV = 'test';
require('ts-node').register({ project: 'apps/api/tsconfig.json', transpileOnly: true });
const { prisma } = require('@cafe-project/database');
const nativeTransaction = prisma.$transaction.bind(prisma);
prisma.$transaction = (callback, options) => {
  if (typeof callback !== 'function') return nativeTransaction(callback, options);
  return nativeTransaction(async tx => {
    const delegate = (model, key) => new Proxy(model, {
      get(target, name) {
        const original = Reflect.get(target, name);
        if (typeof original !== 'function') return original;
        if (key === 'inventoryTransaction' && name === 'create') {
          return async args => {
            const row = await original.call(target, args);
            if (args.data?.reason === '__TK06_IMPORT_ROLLBACK__') {
              throw new Error('TK06_TEST_ONLY_INJECTED_FAILURE_AFTER_LEDGER_INSERT');
            }
            return row;
          };
        }
        if (key === 'stockCount' && name === 'update') {
          return async args => {
            if (args.data?.status === 'COMPLETED') {
              const count = await tx.stockCount.findUnique({ where: args.where, select: { note: true } });
              if (count?.note?.includes('__TK06_APPROVAL_ROLLBACK__') ||
                  count?.note?.includes('__KK_APPROVAL_ROLLBACK__')) {
                const row = await original.call(target, args);
                throw new Error('TEST_ONLY_INJECTED_FAILURE_AFTER_APPROVAL_UPDATE');
              }
            }
            return original.call(target, args);
          };
        }
        return original.bind(target);
      }
    });
    const wrapped = new Proxy(tx, {
      get(target, name) {
        if (name === 'inventoryTransaction' || name === 'stockCount') {
          return delegate(Reflect.get(target, name), name);
        }
        return Reflect.get(target, name);
      }
    });
    return callback(wrapped);
  }, options);
};
const express = require('express');
const app = express(); app.set('json replacer', (_key, value) => typeof value === 'bigint' ? value.toString() : value); app.use(express.json());
app.use('/api/ingredients', require('../src/modules/ingredient/ingredient.route').ingredientRoutes);
app.use('/api/stocktakes', require('../src/modules/inventory/stocktake.route').stocktakeRoutes);
app.use('/api/products', require('../src/modules/product/product.route').default);
app.use('/api/products', require('../src/modules/recipe/recipe.route').productRecipeRoutes);
app.use('/api/orders', require('../src/modules/order/order.route').default);
app.use(require('../src/common/error-handler').errorHandler);
const server = app.listen(5003, '127.0.0.1', () => console.log('TK-06 fault-only HTTP server ready :5003'));
process.on('SIGTERM', () => server.close(() => process.exit()));
