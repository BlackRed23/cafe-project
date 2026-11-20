const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const jsxRuntime = require('react/jsx-runtime');

const root = path.resolve(__dirname, '..');
const sourcePath = process.env.HOME_BASELINE_SOURCE || path.join(root, 'src/pages/HomePage.tsx');
const source = fs.readFileSync(sourcePath, 'utf8');
const compile = text => ts.transpileModule(text, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const stockModule = { exports: {} };
vm.runInNewContext(compile(fs.readFileSync(path.join(root, 'src/utils/productStock.ts'), 'utf8')), {
  exports: stockModule.exports, module: stockModule,
});

const product = (id, quantity = 2, extra = {}) => ({
  id, name: `Test coffee ${id}`, price: 65000, unit: 'hộp', inventory: { quantity }, ...extra,
});
const ProductCard = () => null;
const Loading = () => null;
const Link = () => null;

function elements(node) {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== 'object') return [];
  return [node, ...elements(node.props?.children)];
}

function harness({ products = [product('one')], loading = false, authenticated = true, items = [], didAdd = true, apiProducts = [], apiError } = {}) {
  const calls = { warnings: [], navigation: [], adds: [], states: [], effects: [], errors: [], scroll: [], requests: 0 };
  let stateIndex = 0;
  const react = {
    useState: () => {
      const index = stateIndex++;
      return [index === 0 ? products : loading, value => calls.states.push({ index, value })];
    },
    useEffect: effect => calls.effects.push(effect),
  };
  const mocks = {
    react,
    'react/jsx-runtime': jsxRuntime,
    'react-router-dom': { Link, useNavigate: () => (...args) => calls.navigation.push(args), useLocation: () => ({ pathname: '/' }) },
    'lucide-react': {},
    '../api/products.api': { productsApi: { getProducts: async () => { calls.requests++; if (apiError) throw apiError; return apiProducts; } } },
    '../contexts/CartContext': { useCart: () => ({ items, addToCart: (...args) => { calls.adds.push(args); return didAdd; } }) },
    '../contexts/ToastContext': { useToast: () => ({ warning: message => calls.warnings.push(message) }) },
    '../contexts/AuthContext': { useAuth: () => ({ isAuthenticated: authenticated }) },
    '../utils/productStock': stockModule.exports,
    '../components/product/ProductCard': { ProductCard },
    '../components/common/Loading': { Loading },
    '../features/home/HomeEditorial': { HomeHero: () => null, BrandStory: () => null, HomeGallery: () => null },
  };
  const module = { exports: {} };
  vm.runInNewContext(compile(source), {
    module, exports: module.exports,
    require: id => { assert.ok(Object.hasOwn(mocks, id), `Unexpected Home dependency: ${id}`); return mocks[id]; },
    window: { scrollTo: (...args) => calls.scroll.push(args) },
    console: { error: (...args) => calls.errors.push(args) },
  });
  const nodes = elements(module.exports.HomePage());
  const cards = nodes.filter(node => node.type === ProductCard);
  return { calls, nodes, cards, add: value => cards[0].props.onAddToCart(value) };
}

test('Home requests API products, retains stock-first selection and three-product limit', async () => {
  const data = [product('sold-out', 0), product('one'), product('inactive', 5, { is_active: false }), product('two'), product('three'), product('four')];
  const { calls } = harness({ apiProducts: data });
  calls.effects[0]();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.requests, 1);
  assert.deepEqual(calls.scroll, [[0, 0]]);
  assert.deepEqual(Array.from(calls.states.find(state => state.index === 0).value, item => item.id), ['one', 'two', 'three']);
  assert.equal(calls.states.find(state => state.index === 1).value, false);
  assert.equal(data[0].id, 'sold-out');
});

test('Home keeps loading, empty and failed-read behavior', async () => {
  const pending = harness({ loading: true });
  assert.equal(pending.nodes.filter(node => node.type === Loading).length, 1);
  assert.equal(pending.cards.length, 0);
  const empty = harness({ products: [] });
  assert.equal(empty.cards.length, 0);
  assert.ok(empty.nodes.some(node => typeof node.props?.children === 'string' && node.props.children.includes('Chưa có sản phẩm')));
  const error = new Error('Home read test failure');
  const failed = harness({ products: [], apiError: error });
  failed.calls.effects[0]();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(failed.calls.errors[0][1], error);
  assert.equal(failed.calls.states.find(state => state.index === 1).value, false);
  assert.equal(failed.calls.adds.length, 0);
});

test('Home passes original API-backed products to existing ProductCard and keeps product route', () => {
  const products = [product('one'), product('two')];
  const { cards, nodes } = harness({ products });
  assert.equal(cards.length, 2);
  assert.equal(cards[0].props.product, products[0]);
  assert.equal(cards[1].props.product, products[1]);
  assert.ok(nodes.some(node => node.type === Link && node.props.to === '/products'));
});

test('Home redirects unauthenticated cart actions with existing return URL and feedback', () => {
  const { add, calls } = harness({ authenticated: false });
  add(product('one'));
  assert.equal(calls.adds.length, 0);
  assert.equal(calls.warnings.length, 1);
  assert.match(calls.warnings[0], /đăng nhập/);
  assert.equal(calls.navigation[0][0], '/login');
  assert.equal(calls.navigation[0][1].state.returnUrl, '/');
});

test('Home blocks absent/zero stock and quantities already held in cart', () => {
  for (const value of [product('one', 0), product('one', 1, { inventory: undefined })]) {
    const { add, calls } = harness(); add(value);
    assert.equal(calls.adds.length, 0);
    assert.match(calls.warnings[0], /hết hàng/);
  }
  const value = product('one', 2);
  const { add, calls } = harness({ items: [{ product: value, quantity: 2 }] });
  add(value);
  assert.equal(calls.adds.length, 0);
  assert.match(calls.warnings[0], /bạn đã có 2/);
});

test('Home delegates one-unit addition and preserves cart rejection feedback', () => {
  const value = product('one', 3);
  for (const didAdd of [true, false]) {
    const { add, calls } = harness({ didAdd, items: [{ product: value, quantity: 1 }] });
    add(value);
    assert.equal(calls.adds.length, 1);
    assert.equal(calls.adds[0][0], value);
    assert.equal(calls.adds[0][1], 1);
    assert.equal(calls.navigation.length, 0);
    assert.equal(calls.warnings.length, didAdd ? 0 : 1);
    if (!didAdd) assert.match(calls.warnings[0], /Chỉ còn 2/);
  }
});

test('Editorial sections use existing local coffee images and real menu navigation', () => {
  const editorial = fs.readFileSync(path.join(root, 'src/features/home/HomeEditorial.tsx'), 'utf8');
  for (const file of ['hero-bg.jpg', 'about-video-bg.jpg', 'gallery-1.jpg', 'gallery-2.jpg', 'gallery-3.jpg']) {
    assert.ok(fs.existsSync(path.join(root, 'public/images', file)), file);
    assert.ok(editorial.includes('/images/' + file), file);
  }
  assert.ok(editorial.includes('to="/products"'));
  assert.ok(editorial.includes('href="#about"'));
  assert.ok(editorial.includes('loading="lazy"'));
  assert.ok(editorial.includes('fetchPriority="high"'));
  assert.match(editorial, /md:grid-cols-2/);
  assert.match(editorial, /md:grid-cols-\[1\.15fr_\.75fr_\.9fr\]/);
  assert.match(editorial, /motion-reduce:transition-none/);
  assert.match(editorial, /bg-\[var\(--sf-story\)\]/);
  assert.match(editorial, /bg-\[var\(--sf-soft\)\]/);
  assert.match(source, /md:grid-cols-3/);
  assert.match(source, /bg-\[var\(--sf-paper\)\]/);
  assert.doesNotMatch(source, /home\.css/);
  assert.doesNotMatch(editorial, /home\.css/);
  assert.ok(!editorial.includes('testimonials'));
});

test('Home distinguishes failed menu API from a genuinely empty list', () => {
  assert.match(source, /loadFailed \? \(/);
  assert.match(source, /role="alert"/);
  assert.match(source, /sortProductsInStockFirst\(data\)/);
  assert.match(source, /onAddToCart=\{handleAddToCart\}/);
});
