// Real source Express routes, real authentication and Prisma; no mocks or scheduled jobs.
const assert = require('node:assert/strict');
assert.equal(process.env.INGREDIENT_CAFEDB_CONFIRMED, 'YES');
require('dotenv').config({ path: 'apps/api/.env', quiet: true });
require('dotenv').config({ quiet: true });
const url = new URL(process.env.DATABASE_URL); assert.equal(url.pathname, '/cafedb');
url.hostname = '127.0.0.1'; url.port = '55432'; process.env.DATABASE_URL = url.toString();
require('ts-node').register({ project: 'apps/api/tsconfig.json', transpileOnly: true });
const express = require('express');
const app = express(); app.use(express.json());
app.use('/api/ingredients', require('../src/modules/ingredient/ingredient.route').ingredientRoutes);
app.use('/api/products', require('../src/modules/product/product.route').default);
app.use('/api/products', require('../src/modules/recipe/recipe.route').productRecipeRoutes);
app.use('/api/orders', require('../src/modules/order/order.route').default);
app.use('/api/system-settings', require('../src/modules/system-setting/system-setting.route').default);
app.use('/api/simulate-sale', require('../src/modules/simulate-sale/simulate-sale.route').default);
app.use(require('../src/common/error-handler').errorHandler);
const server = app.listen(5002, '127.0.0.1', () => console.log('Ingredient real-source acceptance server ready :5002'));
process.on('SIGTERM', () => server.close(() => process.exit()));
