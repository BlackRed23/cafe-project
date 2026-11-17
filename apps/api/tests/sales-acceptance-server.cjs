// Real current source, auth, routes, Prisma and cafedb; no global scheduled jobs.
const assert = require('node:assert/strict');
assert.equal(process.env.SALES_CAFEDB_CONFIRMED, 'YES');
require('dotenv').config({ path: 'apps/api/.env', quiet: true });
require('dotenv').config({ quiet: true });
const url = new URL(process.env.DATABASE_URL); assert.equal(url.pathname, '/cafedb');
url.hostname = '127.0.0.1'; url.port = '55432'; process.env.DATABASE_URL = url.toString();
require('ts-node').register({ project: 'apps/api/tsconfig.json', transpileOnly: true });
const app = require('express')(); app.use(require('express').json());
const port = Number(process.env.SALES_API_PORT || 5002);
const fs = require('node:fs'); const { createHash } = require('node:crypto');
const files = ['order.repository.ts', 'order.service.ts', 'order.route.ts', 'order.validator.ts', 'order-operations.ts', 'order-submission.ts'];
fs.writeFileSync('D:/KLTN/cafe-project-artifacts/reports/sales/' + (process.env.SALES_RUNNER_LABEL || 'server') + '-runtime.json', JSON.stringify({
    pid: process.pid, started: new Date().toISOString(), base: `http://127.0.0.1:${port}/api`, source: files.map(file => ({ file: 'apps/api/src/modules/order/' + file,
        sha256: createHash('sha256').update(fs.readFileSync('apps/api/src/modules/order/' + file)).digest('hex') }))
}, null, 2));
app.use('/api/ingredients', require('../src/modules/ingredient/ingredient.route').ingredientRoutes);
app.use('/api/products', require('../src/modules/product/product.route').default);
app.use('/api/products', require('../src/modules/recipe/recipe.route').productRecipeRoutes);
app.use('/api/orders', require('../src/modules/order/order.route').default);
app.use('/api/payments', require('../src/modules/payment/payment.route').default);
app.use(require('../src/common/error-handler').errorHandler);
const server = app.listen(port, '127.0.0.1', () => console.log('Sales current-source acceptance ready :' + port + ' pid=' + process.pid));
process.on('SIGTERM', () => server.close(() => process.exit()));
