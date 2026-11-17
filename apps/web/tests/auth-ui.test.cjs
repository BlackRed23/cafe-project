const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const jsx = require('react/jsx-runtime');
function nodes(n) {
  if (Array.isArray(n)) return n.flatMap(nodes);
  return n && typeof n === 'object' ? [n, ...nodes(n.props?.children)] : [];
}
function page(kind, values, { fail = false, role = 'CUSTOMER', returnUrl } = {}) {
  const calls = { payloads: [], routes: [], states: [], google: [] };
  let index = 0;
  const Input = () => null, Button = () => null, Link = () => null;
  const send = async payload => { calls.payloads.push(payload); if (fail) throw Error('Server error'); };
  const mocks = {
    react: { useState: initial => { const i = index++; return [values[i] === undefined ? initial : values[i], v => calls.states.push([i, v])]; } },
    'react/jsx-runtime': jsx,
    'react-router-dom': { Link, useNavigate: () => v => calls.routes.push(v), useLocation: () => ({ state: { returnUrl } }) },
    '@react-oauth/google': { useGoogleLogin: config => { calls.google.push(config); return () => {}; } },
    '../contexts/AuthContext': { useAuth: () => ({ login: send, register: send, loginWithGoogle: send }) },
    '../contexts/ToastContext': { useToast: () => ({ success() {}, error() {} }) },
    '../components/common/Input': { Input }, '../components/common/Button': { Button },
    '../features/auth/AuthEditorial': { AuthEditorial: () => null },
    '../api/client': { getErrorMessage: err => err.message },
  };
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, `../src/pages/${kind}Page.tsx`), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: id => {
    assert.ok(Object.hasOwn(mocks, id), id); return mocks[id];
  }, localStorage: { getItem: () => JSON.stringify({ role }) } });
  const all = nodes(module.exports[`${kind}Page`]());
  return { calls, all, Input, Button, Link, submit: () => all.find(n => n.type === 'form').props.onSubmit({ preventDefault() {} }) };
}
test('Login preserves payload, return URL, customer/admin redirects and failure feedback', async () => {
  for (const options of [{}, { role: 'ADMIN' }, { returnUrl: '/cart' }, { fail: true }]) {
    const p = page('Login', ['a@b.com', ' Password1! '], options); await p.submit();
    assert.equal(JSON.stringify(p.calls.payloads), JSON.stringify([{ email: 'a@b.com', password: ' Password1! ' }]));
    assert.deepEqual(p.calls.routes, options.fail ? [] : [options.returnUrl || (options.role === 'ADMIN' ? '/admin/dashboard' : '/')]);
    if (options.fail) assert.ok(p.calls.states.some(([, v]) => v === 'Server error'));
    assert.deepEqual(p.calls.states.at(-1), [4, false]);
  }
});
test('Register preserves trimming and validation; never submits invalid passwords', async () => {
  const valid = ['  Name  ', ' a@b.com ', ' 0987654321 ', ' Password1! ', 'Password1!'];
  const p = page('Register', valid); await p.submit();
  assert.equal(JSON.stringify(p.calls.payloads), JSON.stringify([{ name: 'Name', email: 'a@b.com', password: 'Password1!', phone: '0987654321' }]));
  for (const password of ['', 'short', 'a'.repeat(65), 'alllowercase1!']) {
    const invalid = page('Register', [...valid.slice(0, 3), password, password]); await invalid.submit();
    assert.equal(invalid.calls.payloads.length, 0);
    assert.ok(invalid.calls.states.some(([, v]) => v?.password));
  }
  const mismatch = page('Register', [...valid.slice(0, 4), 'different']); await mismatch.submit();
  assert.equal(mismatch.calls.payloads.length, 0);
});
test('Auth forms retain navigation, autofill, password controls and live API errors', () => {
  for (const kind of ['Login', 'Register']) {
    const p = page(kind, []);
    assert.ok(p.all.some(n => n.type === p.Link && n.props.to === (kind === 'Login' ? '/register' : '/login')));
    assert.ok(p.all.some(n => n.type === p.Input && n.props.type === 'password' && n.props.autoComplete));
    assert.equal(p.calls.google[0].scope, 'openid email profile');
    const error = page(kind, kind === 'Login' ? ['', '', {}, 'API error'] : ['', '', '', '', '', {}, 'API error']);
    assert.ok(error.all.some(n => n.props?.role === 'alert' && n.props.children === 'API error'));
  }
});
test('Existing password visibility control preserves label, input linkage and keyboard button', () => {
  for (const visible of [false, true]) {
    let chosen;
    const module = { exports: {} };
    const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/components/common/Input.tsx'), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
    vm.runInNewContext(code, { module, exports: module.exports, require: id => ({
      react: { forwardRef: fn => fn, useId: () => 'password', useState: () => [visible, v => { chosen = v; }] },
      'react/jsx-runtime': jsx, 'lucide-react': { Eye: () => null, EyeOff: () => null },
    })[id] });
    const all = nodes(module.exports.Input({ type: 'password', label: 'Password', error: 'Invalid' }));
    const input = all.find(n => n.type === 'input'), button = all.find(n => n.type === 'button');
    assert.equal(input.props.type, visible ? 'text' : 'password');
    assert.equal(input.props['aria-describedby'], 'password-error');
    assert.equal(button.props.type, 'button'); assert.equal(button.props['aria-pressed'], visible);
    button.props.onClick(); assert.equal(chosen, !visible);
  }
});
