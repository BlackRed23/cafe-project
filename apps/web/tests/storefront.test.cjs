const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const jsx = require('react/jsx-runtime');

const root = path.resolve(__dirname, '..');
function load(file, mocks, globals = {}) {
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports,
    require: id => { assert.ok(Object.hasOwn(mocks, id), `Unexpected dependency ${id}`); return mocks[id]; },
    ...globals,
  });
  return module.exports;
}
function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== 'object') return [];
  return [node, ...nodes(node.props?.children)];
}

test('Theme defaults to system, validates storage, persists explicit choice and survives blocked storage', () => {
  for (const saved of [null, 'invalid', 'light', 'dark', 'system']) {
    const writes = [], states = [];
    const { useStorefrontTheme } = load('src/features/storefront/useStorefrontTheme.ts', {
      react: { useState: initial => [initial(), value => states.push(value)] },
    }, { localStorage: { getItem: () => saved, setItem: (...args) => writes.push(args) } });
    const theme = useStorefrontTheme();
    assert.equal(theme.preference, ['light', 'dark'].includes(saved) ? saved : 'system');
    theme.choose('dark'); theme.choose('system');
    assert.deepEqual(states, ['dark', 'system']);
    assert.deepEqual(writes, [['coffee-inv-storefront-theme', 'dark'], ['coffee-inv-storefront-theme', 'system']]);
  }
  const states = [];
  const { useStorefrontTheme } = load('src/features/storefront/useStorefrontTheme.ts', {
    react: { useState: initial => [initial(), value => states.push(value)] },
  }, { localStorage: { getItem: () => { throw Error('blocked'); }, setItem: () => { throw Error('blocked'); } } });
  const theme = useStorefrontTheme(); assert.equal(theme.preference, 'system');
  assert.doesNotThrow(() => theme.choose('light')); assert.deepEqual(states, ['light']);
});

function layout({ authenticated = false, role = 'CUSTOMER', open = false } = {}) {
  const calls = { routes: [], logout: 0, effects: [], states: [], listeners: new Map() };
  const Link = () => null, Navigate = () => null;
  const user = authenticated ? { name: 'Customer', email: 'customer@example.test', role } : null;
  const icons = Object.fromEntries(['ShoppingCart', 'LogOut', 'ShieldAlert', 'Menu', 'X', 'ArrowRight', 'Key', 'ChevronDown', 'User', 'Package'].map(name => [name, () => null]));
  const { CustomerLayout } = load('src/layouts/CustomerLayout.tsx', {
    react: { useState: () => [open, value => calls.states.push(value)], useRef: () => ({ current: null }), useEffect: effect => calls.effects.push(effect) },
    'react/jsx-runtime': jsx,
    'react-router-dom': { Link, Outlet: () => null, Navigate, useLocation: () => ({ pathname: '/' }), useNavigate: () => route => calls.routes.push(route) },
    '../contexts/AuthContext': { useAuth: () => ({ user, isAuthenticated: authenticated, logout: () => calls.logout++ }) },
    '../contexts/CartContext': { useCart: () => ({ totalItems: 3 }) },
    'lucide-react': icons,
    '../assets/logo-inventory1.png': 'logo.png',
    '../features/storefront/StorefrontTheme': { ThemeControl: () => null },
    '../features/storefront/useStorefrontTheme': { useStorefrontTheme: () => ({ preference: 'system', choose() {} }) },
    '../features/storefront/useStorefrontMotion': { useStorefrontMotion: () => ({ current: null }) },
    '../features/storefront/storefront.css': {},
  }, { document: {
    addEventListener: (name, callback) => calls.listeners.set(name, callback),
    removeEventListener: name => calls.listeners.delete(name),
  } });
  return { tree: CustomerLayout(), calls, Link, Navigate };
}

test('Customer shell retains real routes, cart count, auth navigation and admin redirect', () => {
  const guest = layout(); const all = nodes(guest.tree);
  const carts = all.filter(n => n.type === guest.Link && n.props.to === '/cart');
  assert.equal(carts.length, 2);
  assert.ok(carts.every(n => n.props['aria-label'].includes('3')));
  for (const route of ['/', '/products', '/#gallery', '/#contact']) assert.ok(all.some(n => n.props?.to === route));
  const login = all.find(n => n.type === 'button' && n.props.children === 'Đăng nhập');
  login.props.onClick(); assert.deepEqual(guest.calls.routes, ['/login']);
  const account = layout({ authenticated: true, open: true }); const accountNodes = nodes(account.tree);
  for (const route of ['/profile', '/my-orders', '/change-password']) assert.ok(accountNodes.some(n => n.props?.to === route));
  const logout = accountNodes.find(n => n.type === 'button' && nodes(n).some(child => child.props?.children?.includes?.(' Đăng xuất')));
  assert.ok(logout); logout.props.onClick();
  assert.equal(account.calls.logout, 1); assert.deepEqual(account.calls.routes, ['/login']);
  const admin = layout({ authenticated: true, role: 'ADMIN' });
  assert.equal(admin.tree.type, admin.Navigate); assert.equal(admin.tree.props.to, '/admin/dashboard'); assert.equal(admin.tree.props.replace, true);
});

test('Mobile/account disclosure labels and Escape cleanup retain keyboard access', () => {
  const page = layout({ authenticated: true, open: true });
  const all = nodes(page.tree);
  for (const id of ['storefront-mobile-nav', 'storefront-account']) {
    assert.ok(all.some(n => n.props?.id === id));
    assert.ok(all.some(n => n.type === 'button' && n.props['aria-controls'] === id && n.props['aria-expanded'] === true));
  }
  const cleanup = page.calls.effects[1]();
  page.calls.listeners.get('keydown')({ key: 'Escape' });
  assert.deepEqual(page.calls.states, [false, false]);
  cleanup(); assert.equal(page.calls.listeners.has('keydown'), false);
  assert.ok(all.some(n => n.props?.href === '#storefront-main'));
  assert.ok(all.some(n => n.type === 'main' && n.props.id === 'storefront-main' && n.props.tabIndex === -1));
});
