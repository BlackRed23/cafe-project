const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
let server, browser, origin;
const evidence = path.resolve(__dirname, '../../..', 'reports/frontend-design');
before(async () => {
  const root = path.resolve(__dirname, '..');
  const { build } = await import(pathToFileURL(require.resolve('vite', { paths: [root] })).href);
  const outDir = path.join(evidence, `browser-build-${process.pid}`);
  await build({ root, mode: 'design-verification', define: { 'import.meta.env.VITE_DATA_PROVIDER': JSON.stringify('api'), 'import.meta.env.VITE_API_URL': JSON.stringify('/api') }, build: { outDir, emptyOutDir: false, rolldownOptions: { input: { app: path.join(root, 'index.html'), design: path.join(root, 'tests/fixtures/design-system.html') } } }, logLevel: 'error' });
  const mime = { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.html': 'text/html' };
  server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const relative = pathname === '/__design' ? 'tests/fixtures/design-system.html' : pathname.startsWith('/assets/') ? pathname.slice(1) : 'index.html';
    const file = path.resolve(outDir, relative);
    if (!file.startsWith(outDir + path.sep)) { res.writeHead(403).end(); return; }
    try { const body = await fs.readFile(file); res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }); res.end(body); }
    catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); origin = `http://127.0.0.1:${server.address().port}`;
  try { browser = await chromium.launch({ headless: true }); }
  catch (error) { if (!error.message.includes("Executable doesn't exist")) throw error; browser = await chromium.launch({ channel: 'msedge', headless: true }); }
  await fs.mkdir(evidence, { recursive: true });
}, { timeout: 120000 });
after(async () => {
  await browser?.close();
  server?.closeAllConnections();
  if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}, { timeout: 60000 });

test('Design primitives: labels, errors, password, modal keyboard/focus, pagination, responsive and reduced motion', { timeout: 60000 }, async () => {
  const page = await browser.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(origin + '/__design');
    const password = page.getByLabel('Password', { exact: true });
    await password.fill('test-only'); assert.equal(await password.getAttribute('aria-invalid'), 'true');
    assert.match(await password.getAttribute('aria-describedby'), /help/);
    assert.match(await password.evaluate(el => el.getAttribute('aria-describedby').split(' ').map(id => document.getElementById(id)?.textContent).join(' ')), /Validation message/);
    await page.getByRole('button', { name: 'Hiện mật khẩu' }).click(); assert.equal(await password.getAttribute('type'), 'text');
    assert.equal(await page.getByLabel('Batch', { exact: true }).inputValue(), 'batch');
    assert.equal(await page.getByRole('button', { name: 'Saving' }).isDisabled(), true);
    await page.getByRole('button', { name: 'Open dialog' }).click();
    const dialog = page.getByRole('dialog', { name: 'Test dialog' }); await dialog.waitFor();
    await page.getByRole('button', { name: 'Report test error' }).click();
    await dialog.getByRole('alert').filter({ hasText: 'Test modal feedback' }).waitFor();
    assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true);
    for (let index = 0; index < 6; index++) await page.keyboard.press('Tab');
    assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true);
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' });
    assert.equal(await page.getByRole('button', { name: 'Open dialog' }).evaluate(el => el === document.activeElement), true);
    assert.equal(await page.evaluate(() => document.body.style.overflow), '');
    await page.getByRole('button', { name: 'Open dialog' }).click(); await page.getByRole('button', { name: 'Save test' }).click(); await page.getByText('Test saved', { exact: true }).waitFor();
    const savedFeedback = page.getByRole('alert').filter({ hasText: 'Test saved feedback' });
    await savedFeedback.waitFor();
    assert.equal(await savedFeedback.evaluate(el => el.closest('dialog') === null), true);
    await page.getByRole('button', { name: 'Trang 2', exact: true }).click(); assert.equal(await page.getByRole('button', { name: 'Trang 2', exact: true }).getAttribute('aria-current'), 'page');
    await page.getByRole('textbox', { name: 'Tìm kiếm...' }).fill('record 0'); await page.getByRole('cell', { name: 'Test record 0', exact: true }).waitFor();
    for (const width of [375, 768, 1440]) { await page.setViewportSize({ width, height: 900 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); await page.screenshot({ path: path.join(evidence, `components-${width}.png`), fullPage: true }); }
    await page.emulateMedia({ reducedMotion: 'reduce' }); assert.equal(await page.locator('.ds-loading svg').evaluate(el => getComputedStyle(el).animationDuration), '1e-05s');
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('Production ingredients: existing redirect, filters, role gates, dialog and read failure with browser-only fixtures', { timeout: 90000 }, async () => {
  for (const role of ['ADMIN', 'STAFF']) {
    const context = await browser.newContext({ reducedMotion: 'reduce' }); const page = await context.newPage(); const mutations = []; let failRead = false;
    await context.addInitScript(() => localStorage.setItem('access_token', 'design-test-only'));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith('/api/')) {
        if (route.request().method() !== 'GET') { mutations.push(url.pathname); return route.abort(); }
        if (failRead && url.pathname === '/api/ingredients') return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Test read unavailable' }) });
        const data = url.pathname === '/api/auth/me' ? { id: 'test-user', name: 'Test operator', role } : url.pathname === '/api/ingredients' ? (url.searchParams.get('search') === 'absent' ? [] : [{ id: 'test-stock', name: 'Test coffee ingredient', sku: 'TEST-ONLY', baseUnit: 'g', quantity: 2, reserved: 0, availableQuantity: 2, minThreshold: 5, costPerBaseUnit: 100, stockValue: 200, status: 'LOW_STOCK', batches: [] }]) : [];
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
      }
      if (url.origin !== origin) return route.abort();
      return route.continue();
    });
    try {
      await page.goto(origin + '/admin/inventory'); await page.getByRole('heading', { name: 'Nguyên liệu & Giá vốn', exact: true }).waitFor();
      assert.equal(new URL(page.url()).pathname, '/admin/ingredients');
      await page.getByRole('cell', { name: /^Test coffee ingredient/ }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Quét nguyên liệu bằng AI Agent' }).count(), role === 'ADMIN' ? 1 : 0);
      const filter = page.getByRole('checkbox', { name: 'Chỉ hiện nguyên liệu chạm ngưỡng thấp' });
      const filtered = page.waitForRequest(req => req.url().includes('/api/ingredients?lowStock=true')); await filter.check(); await filtered;
      await page.getByRole('textbox', { name: 'Tìm nguyên liệu', exact: true }).fill('absent'); await page.getByRole('heading', { name: 'Chưa có nguyên liệu nào phù hợp.' }).waitFor();
      await page.getByRole('textbox', { name: 'Tìm nguyên liệu', exact: true }).fill(''); await page.getByRole('cell', { name: /^Test coffee ingredient/ }).waitFor();
      if (role === 'ADMIN') { await page.getByRole('button', { name: 'Thêm nguyên liệu', exact: true }).click(); await page.getByRole('dialog', { name: 'Thêm nguyên liệu mới' }).waitFor(); await page.getByLabel('Tên nguyên liệu', { exact: true }).fill('Test draft only'); await page.keyboard.press('Escape'); }
      for (const width of [375, 768, 1440]) { await page.setViewportSize({ width, height: 900 }); assert.equal(await page.locator('.ingredients-workspace').evaluate(el => el.scrollWidth <= el.clientWidth + 1), true); await page.screenshot({ path: path.join(evidence, `ingredients-${role}-${width}.png`), fullPage: true }); }
      failRead = true; await page.getByRole('textbox', { name: 'Tìm nguyên liệu', exact: true }).fill('failure'); await page.getByRole('button', { name: 'Thử lại', exact: true }).waitFor();
      assert.equal(await page.getByRole('heading', { name: 'Chưa có nguyên liệu nào phù hợp.' }).count(), 0);
      failRead = false; await page.getByRole('button', { name: 'Thử lại', exact: true }).click(); await page.getByRole('cell', { name: /^Test coffee ingredient/ }).waitFor();
      assert.deepEqual(mutations, []);
    } catch (error) {
      console.error(JSON.stringify({ role, url: page.url(), body: (await page.locator('body').innerText()).slice(0, 1200), error: error.message }));
      throw error;
    } finally { await context.close(); }
  }
});
