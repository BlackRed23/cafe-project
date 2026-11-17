const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const jsx = require('react/jsx-runtime');
const root = path.resolve(__dirname, '..');
function load(file, mocks = {}, globals = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, console,
    require: name => { assert.ok(Object.hasOwn(mocks, name), `Unexpected dependency: ${name}`); return mocks[name]; }, ...globals });
  return module.exports;
}
const feedback = load('src/pages/admin/productFeedback.ts');
const failure = (status, message) => ({ response: { status, data: { message } } });
const sample = { id: 'coffee', name: 'Cà phê', sku: 'CF01', price: 0, unit: 'hộp', categoryId: 'beans', isActive: false, requiresRecipe: null, updatedAt: '2026-11-17T00:00:00.000Z' };

test('Product validation accepts zero; preserves explicit classification; rejects precision, limits and unreviewed activation', () => {
  const values = { ...sample, description: '' };
  assert.equal(Object.keys(feedback.validateProduct(values)).length, 0);
  for (const price of [-1, NaN, Infinity, 1.001, 10000000000]) assert.ok(feedback.validateProduct({ ...values, price }).price);
  assert.ok(feedback.validateProduct({ ...values, isActive: true }).requiresRecipe);
  for (const requiresRecipe of [true, false]) assert.equal(feedback.validateProduct({ ...values, isActive: true, requiresRecipe }).requiresRecipe, undefined);
  assert.ok(feedback.validateProduct({ ...values, sku: 'x'.repeat(101) }).sku);
  assert.ok(feedback.validateProduct({ ...values, description: 'x'.repeat(1001) }).description);
});

test('Product errors distinguish conflicts and never disclose server diagnostics', () => {
  assert.equal(feedback.productFailure(failure(409, 'Duplicate SKU')).kind, 'sku');
  assert.equal(feedback.productFailure(failure(409, 'Product changed. Reload before updating.')).kind, 'stale');
  assert.equal(feedback.productFailure(failure(409, 'Invalid required recipe')).kind, 'recipe');
  assert.equal(feedback.productFailure(failure(409, 'History exists'), 'delete').kind, 'history');
  for (const status of [400, 401, 403, 404, 500, 502, 503]) assert.ok(!feedback.productFailure(failure(status, 'SQL PRIVATE_DIAGNOSTIC')).message.includes('PRIVATE_DIAGNOSTIC'));
  assert.match(feedback.productFailure(new Error('private host')).message, /Chưa nhận được xác nhận/);
});

function apiHarness() {
  const calls = [];
  let reply = { success: true, data: { product: sample, products: [sample] } };
  const apiClient = Object.fromEntries(['get', 'post', 'put', 'patch', 'delete'].map(method => [method, async (...args) => { calls.push([method, ...args]); return { data: reply }; }]));
  const unwrapApiField = (value, field) => value.data?.[field];
  const api = load('src/api/products.api.ts', { './client': { apiClient, unwrapApiField } }).productsApi;
  return { api, calls, reply: value => { reply = value; } };
}

test('Product API uses configured transport, contract envelopes and exact update version; keeps null DTO classification', async () => {
  const h = apiHarness();
  const list = await h.api.getProducts({ includeInactive: true });
  assert.equal(list[0].requiresRecipe, null);
  assert.equal(h.calls[0][1], '/products');
  assert.equal(h.calls[0][2].params.includeInactive, true);
  assert.equal((await h.api.getProductById('coffee')).id, 'coffee');
  await h.api.createProduct({ name: sample.name, price: 0, categoryId: 'beans', requiresRecipe: false });
  assert.equal(h.calls.at(-1)[2].requiresRecipe, false);
  await h.api.updateProduct('coffee', { expectedUpdatedAt: sample.updatedAt, requiresRecipe: true });
  assert.equal(h.calls.at(-1)[2].expectedUpdatedAt, sample.updatedAt);
  assert.equal(h.calls.at(-1)[2].requiresRecipe, true);
  const count = h.calls.length;
  await assert.rejects(h.api.updateProduct('coffee', { isActive: false }), /version required/);
  assert.equal(h.calls.length, count);
});

test('Product API rejects malformed and unsuccessful responses instead of claiming success or empty data', async () => {
  const h = apiHarness();
  h.reply({ success: false, data: null });
  for (const request of [() => h.api.getProducts(), () => h.api.createProduct({}), () => h.api.deleteProduct('coffee'), () => h.api.purgeProduct('coffee')]) await assert.rejects(request());
});

const Input = () => null, Button = () => null, Alert = () => null, ConfirmDialog = () => null;
function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  return node && typeof node === 'object' ? [node, ...nodes(node.props?.children)] : [];
}
function formHarness({ product, saveError } = {}) {
  const slots = [], effects = [], calls = { creates: [], updates: [], notices: [], navigation: [] };
  let cursor = 0;
  const react = {
    useState: initial => { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef: initial => { const i = cursor++; return slots[i] ??= { current: initial }; },
    useEffect: effect => { effects.push(effect); }, useCallback: fn => fn,
  };
  const toast = Object.fromEntries(['success', 'error', 'warning', 'info'].map(type => [type, message => calls.notices.push({ type, message })]));
  const save = async payload => { if (saveError) throw saveError; return { ...sample, ...payload }; };
  const icons = new Proxy({}, { get: () => () => null });
  const { AdminProductFormPage } = load('src/pages/admin/AdminProductFormPage.tsx', {
    react, 'react/jsx-runtime': jsx, 'react-router-dom': { useParams: () => ({ id: product?.id }), useNavigate: () => target => calls.navigation.push(target), Link: () => null },
    '../../mock/config': { mockEnabled: false }, '../../mock/MockWorkspace': { MockWorkspace: () => null },
    '../../api/products.api': { productsApi: { getProductById: async () => product, createProduct: async payload => { calls.creates.push(payload); return save(payload); }, updateProduct: async (id, payload) => { calls.updates.push({ id, payload }); return save(payload); } } },
    '../../api/categories.api': { categoriesApi: { getCategories: async () => [{ id: 'beans', name: 'Hạt' }] } },
    '../../api/upload.api': { uploadApi: {} }, '../../api/ingredients.api': { ingredientsApi: { getIngredients: async () => [] } },
    '../../api/recipes.api': { recipesApi: { getRecipesByProduct: async () => [] } },
    '../../components/common/Input': { Input }, '../../components/common/Button': { Button }, '../../components/common/Loading': { Loading: () => null },
    '../../contexts/ToastContext': { useToast: () => toast }, '../../components/common/Alert': { Alert }, '../../components/common/ConfirmDialog': { ConfirmDialog },
    '../../features/recipes/RecipeManager': { RecipeManager: () => null },
    './productFeedback': feedback, './products.css': {}, '../../utils/formatCurrency': { formatCurrency: String }, '../../utils/formatDate': { formatDate: String },
    'lucide-react': icons, '../../constants/units': { ALLOWED_PRODUCT_UNITS: ['hộp'], isAllowedProductUnit: value => value === 'hộp' },
  }, { window: { setTimeout: () => 1, clearTimeout: () => {}, location: { reload: () => {} } } });
  function render() { cursor = 0; const wrapper = AdminProductFormPage(); return nodes(wrapper.type(wrapper.props)); }
  const field = label => render().find(node => node.type === Input && node.props.label === label);
  const select = label => render().find(node => node.type === 'select' && node.props['aria-label'] === label);
  const submit = () => render().find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  render();
  return { render, field, select, submit, calls, init: async () => { effects[0](); await new Promise(resolve => setImmediate(resolve)); } };
}

test('Product form preserves null on edit by omitting classification, sends loaded version and allows zero price', async () => {
  const h = formHarness({ product: sample }); await h.init();
  await h.submit();
  assert.equal(h.calls.updates.length, 1);
  assert.equal(h.calls.updates[0].payload.expectedUpdatedAt, sample.updatedAt);
  assert.equal(h.calls.updates[0].payload.price, 0);
  assert.equal(Object.hasOwn(h.calls.updates[0].payload, 'requiresRecipe'), false);
  assert.equal(h.calls.notices.filter(n => n.type === 'success').length, 1);
});

test('Product form blocks repeated submit after confirmed create and keeps explicit false classification', async () => {
  const h = formHarness();
  h.field('Tên sản phẩm').props.onChange({ target: { value: 'Cà phê mới' } });
  h.field('Giá bán (VND)').props.onChange({ target: { value: '0' } });
  h.select('Danh mục sản phẩm').props.onChange({ target: { value: 'beans' } });
  h.render().find(n => n.props?.id === 'product-recipe-class').props.onChange({ target: { value: 'false' } });
  await Promise.all([h.submit(), h.submit()]);
  await h.submit();
  assert.equal(h.calls.creates.length, 1);
  assert.equal(h.calls.creates[0].requiresRecipe, false);
});

test('Stale Product update keeps draft, requires confirmed reload and never retries with a new timestamp', async () => {
  const h = formHarness({ product: { ...sample, requiresRecipe: false }, saveError: failure(409, 'Product changed. Reload before updating.') }); await h.init();
  h.field('Tên sản phẩm').props.onChange({ target: { value: 'Bản nháp cần giữ' } });
  await h.submit(); await h.submit();
  assert.equal(h.calls.updates.length, 1);
  assert.equal(h.field('Tên sản phẩm').props.value, 'Bản nháp cần giữ');
  assert.equal(h.calls.notices.some(n => n.type === 'success'), false);
  const reload = h.render().find(n => n.type === Button && n.props.children === 'Tải lại dữ liệu');
  reload.props.onClick();
  assert.equal(h.render().find(n => n.type === ConfirmDialog).props.isOpen, true);
});

test('Duplicate SKU stays inline and retains Product draft without success notification', async () => {
  const h = formHarness({ product: sample, saveError: failure(409, 'Duplicate SKU') }); await h.init();
  await h.submit();
  assert.match(h.field('Mã SKU').props.error, /đã được sử dụng/);
  assert.equal(h.field('Mã SKU').props.value, sample.sku);
  assert.equal(h.calls.notices.some(n => n.type === 'success'), false);
});
