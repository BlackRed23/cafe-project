const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const jsx = require('react/jsx-runtime');
const root = path.resolve(__dirname, '..');
function load(file, mocks = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, console, require: key => { assert.ok(Object.hasOwn(mocks, key), key); return mocks[key]; } });
  return module.exports;
}
const helper = load('src/features/recipes/recipeForm.ts');
const ingredients = [{ id: 'beans', name: 'Hạt', sku: 'B', baseUnit: 'g', isActive: true }, { id: 'milk', name: 'Sữa', sku: 'M', baseUnit: 'ml', isActive: true }];
const draft = { yieldQuantity: 1, laborCost: 0, overheadCost: 0, note: '', ingredients: [{ ingredientId: 'beans', quantity: 0.5, unit: 'kg' }] };
const recipe = { id: 'r1', productId: 'coffee', productName: 'Cà phê', version: 1, isActive: true, yieldQuantity: 1, laborCost: 0, overheadCost: 0, note: null, ingredients: draft.ingredients, costSummary: { unitCost: 5000 } };
const preview = { breakdown: [{ ingredientId: 'beans', quantityBase: 500, baseUnit: 'g', lineCost: 5000 }], ingredientsCost: 5000, optionalIngredientsCost: 0, laborCost: 0, overheadCost: 0, totalBatchCost: 5000, unitCost: 5000 };

test('Recipe validation preserves normalized mass/volume and rejects empty, missing, duplicate, invalid quantities and dimensions', () => {
  assert.equal(helper.normalizedQuantity(0.5, 'kg', 'g'), 500);
  assert.equal(helper.normalizedQuantity(1.5, 'l', 'ml'), 1500);
  assert.equal(helper.normalizedQuantity(1, 'kg', 'ml'), null);
  assert.equal(helper.normalizedQuantity(1, 'l', 'g'), null);
  assert.equal(Object.keys(helper.validateRecipe(draft, ingredients)).length, 0);
  assert.ok(helper.validateRecipe({ ...draft, ingredients: [] }, ingredients).ingredients);
  for (const quantity of [0, -1, NaN, Infinity]) assert.ok(helper.validateRecipe({ ...draft, ingredients: [{ ...draft.ingredients[0], quantity }] }, ingredients)['row-0']);
  assert.ok(helper.validateRecipe(draft, [])['row-0']);
  assert.ok(helper.validateRecipe({ ...draft, ingredients: [...draft.ingredients, ...draft.ingredients] }, ingredients)['row-1']);
});

test('Recipe errors are Vietnamese and hide internal diagnostics', () => {
  for (const status of [400, 401, 403, 404, 409, 500]) assert.ok(!helper.recipeError({ response: { status, data: { message: 'PRIVATE SQL ERROR' } } }).includes('PRIVATE'));
  assert.match(helper.recipeError({ response: { status: 400, data: { message: 'unit dimension conversion' } } }), /khác chiều/);
  assert.match(helper.recipeError(new Error('secret')), /Nội dung nhập được giữ nguyên/);
});

test('Recipe API unwraps direct data, creates versions via POST, activates with empty body and never mutates historical content', async () => {
  const calls = [];
  let value = [recipe];
  const apiClient = Object.fromEntries(['get', 'post'].map(method => [method, async (...args) => { calls.push([method, ...args]); return { data: { success: true, data: value } }; }]));
  const { recipesApi: api } = load('src/api/recipes.api.ts', { './client': { apiClient, unwrapApiData: envelope => envelope.data } });
  assert.equal((await api.getRecipesByProduct('coffee'))[0].id, 'r1');
  value = recipe; assert.equal((await api.getActiveRecipe('coffee')).id, 'r1');
  const snapshot = JSON.stringify(recipe);
  value = { ...recipe, id: 'r2', version: 2 };
  assert.equal((await api.createRecipeVersion('coffee', draft)).version, 2);
  assert.equal(calls.at(-1)[0], 'post'); assert.equal(calls.at(-1)[1], '/products/coffee/recipes');
  assert.equal(Object.hasOwn(calls.at(-1)[2], 'expectedUpdatedAt'), false);
  await api.activateRecipeVersion('coffee', 'r1');
  assert.equal(calls.at(-1)[1], '/products/coffee/recipes/r1/activate');
  assert.equal(Object.keys(calls.at(-1)[2]).length, 0);
  assert.equal(JSON.stringify(recipe), snapshot);
  value = preview; await api.previewRecipeCost('coffee', draft);
  assert.equal(calls.at(-1)[1], '/products/coffee/recipes/cost-preview');
  value = { recipe }; await assert.rejects(api.getActiveRecipe('coffee'));
});

const Button = () => null, Input = () => null, ConfirmDialog = () => null;
function nodes(node) { return Array.isArray(node) ? node.flatMap(nodes) : node && typeof node === 'object' ? [node, ...nodes(node.props?.children)] : []; }
function harness({ admin = true, saveError } = {}) {
  const slots = [], effects = [], calls = { create: [], preview: [], activate: [], activeReads: 0, notices: [] };
  let cursor = 0;
  const react = {
    useState: initial => { const key = cursor++; if (!(key in slots)) slots[key] = typeof initial === 'function' ? initial() : initial; return [slots[key], next => { slots[key] = typeof next === 'function' ? next(slots[key]) : next; }]; },
    useRef: initial => { const key = cursor++; return slots[key] ??= { current: initial }; }, useEffect: effect => effects.push(effect),
  };
  const toast = Object.fromEntries(['success', 'error'].map(type => [type, message => calls.notices.push({ type, message })]));
  const { RecipeManager } = load('src/features/recipes/RecipeManager.tsx', {
    react, 'react/jsx-runtime': jsx,
    '../../api/recipes.api': { recipesApi: {
      getRecipesByProduct: async () => [recipe, { ...recipe, id: 'r0', version: 0, isActive: false }],
      getActiveRecipe: async () => { calls.activeReads++; return recipe; },
      previewRecipeCost: async (id, payload) => { calls.preview.push({ id, payload }); return preview; },
      createRecipeVersion: async (id, payload) => { calls.create.push({ id, payload }); if (saveError) throw saveError; return { ...recipe, id: 'r2', version: 2 }; },
      activateRecipeVersion: async (id, recipeId) => { calls.activate.push({ id, recipeId }); return { ...recipe, id: recipeId }; },
    } },
    '../../api/ingredients.api': { ingredientsApi: { getIngredients: async () => ingredients } },
    '../../contexts/AuthContext': { useAuth: () => ({ isAdmin: admin }) }, '../../contexts/ToastContext': { useToast: () => toast },
    '../../components/common/Button': { Button }, '../../components/common/Input': { Input }, '../../components/common/Alert': { Alert: () => null }, '../../components/common/Loading': { Loading: () => null }, '../../components/common/ConfirmDialog': { ConfirmDialog },
    '../../utils/formatCurrency': { formatCurrency: String }, './recipeForm': helper, './recipes.css': {},
  });
  const render = () => { cursor = 0; return nodes(RecipeManager({ productId: 'coffee', productName: 'Cà phê' })); };
  const button = text => render().find(node => node.type === Button && node.props.children === text);
  render();
  return { calls, render, button, init: async () => { effects[0](); await new Promise(resolve => setImmediate(resolve)); } };
}

test('STAFF can copy a Recipe and preview; no create/activation controls or ADMIN active endpoint request', async () => {
  const h = harness({ admin: false }); await h.init();
  h.button('Dùng làm bản nháp').props.onClick();
  await h.button('Xem trước chi phí').props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.calls.preview.length, 1);
  assert.equal(h.calls.create.length, 0);
  assert.equal(h.calls.activeReads, 0);
  assert.equal(h.button('Tạo phiên bản mới'), undefined);
});

test('ADMIN creation and activation require confirmation; duplicate submits blocked', async () => {
  const h = harness(); await h.init();
  h.button('Dùng làm bản nháp').props.onClick();
  h.button('Tạo phiên bản mới').props.onClick();
  assert.equal(h.calls.create.length, 0);
  const dialog = h.render().find(node => node.type === ConfirmDialog);
  assert.equal(dialog.props.isOpen, true);
  await Promise.all([dialog.props.onConfirm(), dialog.props.onConfirm()]);
  assert.equal(h.calls.create.length, 1);
  assert.equal(h.calls.create[0].payload.ingredients[0].unit, 'kg');
  assert.equal(h.calls.notices.filter(item => item.type === 'success').length, 1);
  const activate = h.render().find(node => node.type === Button && Array.isArray(node.props.children) && node.props.children.join('') === 'Kích hoạt v0');
  activate.props.onClick();
  assert.equal(h.calls.activate.length, 0);
  await h.render().find(node => node.type === ConfirmDialog).props.onConfirm();
  assert.equal(h.calls.activate[0].recipeId, 'r0');
});

test('Failed Recipe create retains draft and blocks write retries until list reload', async () => {
  const h = harness({ saveError: { response: { status: 409 } } }); await h.init();
  h.button('Dùng làm bản nháp').props.onClick(); h.button('Tạo phiên bản mới').props.onClick();
  await h.render().find(node => node.type === ConfirmDialog).props.onConfirm();
  assert.equal(h.calls.create.length, 1);
  assert.equal(h.button('Tạo phiên bản mới').props.disabled, true);
  assert.equal(h.render().find(node => node.type === Input && node.props.label === 'Định lượng 1').props.value, 0.5);
  assert.equal(h.calls.notices.some(item => item.type === 'success'), false);
});
