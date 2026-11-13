const { test } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { EventEmitter } = require('node:events');
const { PassThrough, Writable } = require('node:stream');
const readline = require('node:readline');
function loadSource(file, overrides = {}) {
    const filename = path.resolve(__dirname, '../scripts', file);
    const module = { exports: {} };
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText;
    const sourceRequire = request => {
        if (Object.hasOwn(overrides, request)) return overrides[request];
        if (request.startsWith('.')) return loadSource(request + '.ts', overrides);
        return require(request);
    };
    const compiled = vm.runInThisContext(`(function(exports, require, module, process, console, Buffer, URL) {${code}\n})`, { filename });
    compiled(module.exports, sourceRequire, module, overrides.globals?.process ?? process, overrides.globals?.console ?? console, Buffer, URL);
    return module.exports;
}
const { accounts, bootstrap, validateUrl, validatePassword } = loadSource('bootstrap-test-accounts.ts');

const targets = () => accounts('admin@example.test', 'staff@example.test');
const secret = () => randomBytes(24).toString('base64url');
function fixture({ rows = [], guard = {}, failCreate = 0, changeAfterRead = false } = {}) {
    const state = { rows: [...rows], writes: 0, transactions: 0, readonly: 0, hashes: 0, prompts: 0 };
    const client = {
        async $transaction(run, options) {
            state.transactions++;
            const before = [...state.rows];
            let readOnly = false;
            const tx = {
                async $executeRaw(strings) {
                    assert.match(strings.join(''), /SET TRANSACTION READ ONLY/);
                    readOnly = true; state.readonly++;
                },
                async $queryRaw(strings) {
                    if (strings.join('').includes('pg_advisory')) {
                        assert.equal(options.isolationLevel, 'Serializable');
                        return [];
                    }
                    return [{ database: 'cafedb_v2_test', schema: 'public', allowed: true, ...guard }];
                },
                user: {
                    async findMany({ where }) {
                        return state.rows.filter(row => row.email.toLowerCase() === where.email.equals);
                    },
                    async create({ data, select }) {
                        assert.equal(readOnly, false);
                        assert.deepEqual(select, { id: true });
                        assert.deepEqual(Object.keys(data).sort(), ['email', 'isActive', 'name', 'password', 'provider', 'role']);
                        state.writes++;
                        if (failCreate === state.writes) throw new Error('simulated create failure');
                        state.rows.push({ ...data, googleId: null });
                        return { id: 'mock' };
                    },
                },
            };
            try {
                const result = await run(tx);
                if (changeAfterRead && state.transactions === 1) state.rows.push(existing('ADMIN', { role: 'CUSTOMER' }));
                return result;
            } catch (error) { state.rows = before; throw error; }
        },
    };
    return { state, client, password: async () => { state.prompts++; return secret(); }, hash: async (value, rounds) => { state.hashes++; return bcrypt.hash(value, rounds); } };
}
function existing(role, override = {}) {
    const account = targets().find(value => value.role === role);
    return { ...account, provider: 'local', password: 'opaque-existing-hash', isActive: true, googleId: null, ...override };
}

test('URL guard accepts only explicit PostgreSQL test database with safe parameters', () => {
    assert.equal(validateUrl('postgresql://localhost/cafedb_v2_test?schema=public'), 'postgresql://localhost/cafedb_v2_test?schema=public');
    for (const url of [undefined, 'invalid', 'mysql://localhost/cafedb_v2_test', 'postgresql://localhost/cafedb_v2',
        'postgresql://localhost/cafedb_v2_test_other', 'postgresql://localhost/%63afedb_v2_test',
        'postgresql://localhost/cafedb_v2_test?schema=private', 'postgresql://localhost/cafedb_v2_test?options=dbname=prod',
        'postgresql://localhost/cafedb_v2_test?host=other', 'postgresql://localhost/cafedb_v2_test?schema=public&schema=public',
        'postgresql://localhost/cafedb_v2_test#fragment']) assert.throws(() => validateUrl(url));
});
test('requires distinct emails and exact ADMIN/STAFF account plan', async () => {
    assert.throws(() => accounts('same@example.test', 'SAME@example.test'));
    assert.throws(() => accounts('', 'staff@example.test'));
    const f = fixture();
    await assert.rejects(bootstrap(f.client, [{ ...targets()[0], role: 'CUSTOMER' }, targets()[1]]));
    assert.equal(f.state.transactions, 0);
});
test('default dry-run is read-only, never prompts, hashes or writes', async () => {
    const f = fixture();
    assert.deepEqual(await bootstrap(f.client, targets()), { mode: 'dry-run', created: 0, existing: 0, planned: 2 });
    assert.equal(f.state.readonly, 1); assert.equal(f.state.writes, 0); assert.equal(f.state.prompts, 0);
});
for (const guard of [{ database: 'production' }, { schema: 'other' }, { allowed: false }]) {
    test(`fails closed before input/write: ${JSON.stringify(guard)}`, async () => {
        const f = fixture({ guard });
        await assert.rejects(bootstrap(f.client, targets(), true, f.password, f.hash));
        assert.equal(f.state.writes, 0); assert.equal(f.state.prompts, 0);
    });
}
for (const override of [{ role: 'CUSTOMER' }, { isActive: false }, { provider: 'google' }, { googleId: 'linked' }, { password: null }, { email: 'ADMIN@example.test' }]) {
    test(`conflicting account rejects entire plan: ${Object.keys(override)[0]}`, async () => {
        const f = fixture({ rows: [existing('ADMIN', override)] });
        await assert.rejects(bootstrap(f.client, targets(), true, f.password, f.hash));
        assert.equal(f.state.writes, 0); assert.equal(f.state.prompts, 0);
    });
}
test('ambiguous case-insensitive accounts rejected', async () => {
    const f = fixture({ rows: [existing('ADMIN'), existing('ADMIN', { email: 'ADMIN@example.test' })] });
    await assert.rejects(bootstrap(f.client, targets()));
});
test('apply creates only missing users, bcrypt cost 12; no credentials in summary', async () => {
    const f = fixture(); const passwords = new Map();
    const result = await bootstrap(f.client, targets(), true, async role => {
        const value = secret(); passwords.set(role, value); return value;
    }, f.hash);
    assert.deepEqual({ ...result }, { mode: 'apply', created: 2, existing: 0, planned: 2 });
    assert.equal(f.state.transactions, 2);
    for (const row of f.state.rows) {
        assert.equal(await bcrypt.compare(passwords.get(row.role), row.password), true);
        assert.equal(bcrypt.getRounds(row.password), 12);
        assert.equal(JSON.stringify(result).includes(row.email), false);
        assert.equal(JSON.stringify(result).includes(row.password), false);
        assert.equal(JSON.stringify(result).includes(passwords.get(row.role)), false);
    }
});
test('existing matching users preserved, rerun has zero writes/hashes/input', async () => {
    const rows = [existing('ADMIN'), existing('STAFF')];
    const f = fixture({ rows });
    assert.equal((await bootstrap(f.client, targets(), true, f.password, f.hash)).created, 0);
    assert.deepEqual(f.state.rows, rows);
    assert.equal(f.state.writes, 0); assert.equal(f.state.hashes, 0); assert.equal(f.state.prompts, 0);
});
test('one matching account skipped; only missing account prompted/created', async () => {
    const f = fixture({ rows: [existing('ADMIN')] });
    const result = await bootstrap(f.client, targets(), true, f.password, f.hash);
    assert.equal(result.created, 1); assert.equal(result.existing, 1);
    assert.equal(f.state.prompts, 1); assert.equal(f.state.rows[0].password, 'opaque-existing-hash');
});
test('rechecks account conflicts after password entry, before first write', async () => {
    const f = fixture({ changeAfterRead: true });
    await assert.rejects(bootstrap(f.client, targets(), true, f.password, f.hash));
    assert.equal(f.state.writes, 0);
});
test('second create failure rolls back both accounts', async () => {
    const f = fixture({ failCreate: 2 });
    await assert.rejects(bootstrap(f.client, targets(), true, f.password, f.hash));
    assert.equal(f.state.rows.length, 0);
});
test('password input failure/invalid password/hash failure never starts writes', async () => {
    for (const passwordFor of [async () => { throw new Error('cancel'); }, async () => '']) {
        const f = fixture();
        await assert.rejects(bootstrap(f.client, targets(), true, passwordFor, f.hash));
        assert.equal(f.state.writes, 0); assert.equal(f.state.transactions, 1);
    }
    const f = fixture();
    await assert.rejects(bootstrap(f.client, targets(), true, f.password, async () => { throw new Error('hash failure'); }));
    assert.equal(f.state.writes, 0);
});
test('password bounds prevent bcrypt truncation and whitespace login mismatch', () => {
    validatePassword(secret());
    for (const value of ['', 'x'.repeat(11), 'é'.repeat(37), 'x'.repeat(73), ' x'.repeat(12), 'x'.repeat(12) + '\n']) {
        assert.throws(() => validatePassword(value));
    }
});

function terminal(isTTY = true) {
    const input = new EventEmitter();
    Object.assign(input, {
        isTTY, isRaw: false, paused: true,
        isPaused() { return this.paused; },
        pause() { this.paused = true; }, resume() { this.paused = false; },
        setRawMode(value) { this.isRaw = value; },
    });
    let output = '';
    const fakeProcess = { stdin: input, stdout: { isTTY, write(value) { output += value; } } };
    const { hiddenInput } = loadSource('bootstrap-test-accounts-cli.ts', {
        '@prisma/client': { PrismaClient: class { constructor() { throw new Error('Real client forbidden in test'); } } },
        'node:readline': { emitKeypressEvents() {} },
        globals: { process: fakeProcess },
    });
    return { input, hiddenInput, output: () => output };
}
test('hidden input never echoes secret; restores terminal and listeners on Enter', async () => {
    const t = terminal();
    const pending = t.hiddenInput('Password: ');
    const value = secret();
    t.input.emit('keypress', value, {});
    t.input.emit('keypress', undefined, { name: 'return' });
    assert.equal(await pending, value);
    assert.equal(t.output(), 'Password: \n');
    assert.equal(t.input.isRaw, false); assert.equal(t.input.paused, true);
    assert.equal(t.input.listenerCount('keypress'), 0);
});
for (const event of ['cancel', 'end', 'error']) {
    test(`hidden input restores terminal on ${event}`, async () => {
        const t = terminal(); const pending = t.hiddenInput('Password: ');
        if (event === 'cancel') t.input.emit('keypress', undefined, { ctrl: true, name: 'c' });
        else t.input.emit(event);
        await assert.rejects(pending);
        assert.equal(t.input.isRaw, false); assert.equal(t.input.paused, true);
        assert.equal(t.input.listenerCount('keypress'), 0);
    });
}
test('hidden input refuses redirected or already raw terminal', () => {
    assert.throws(() => terminal(false).hiddenInput('Password: '));
    const t = terminal(); t.input.isRaw = true;
    assert.throws(() => t.hiddenInput('Password: '));
});

// Exercise Node's real readline decoder, rather than emitting synthetic keypress
// events. Windows/paste input may deliver CR and LF in separate chunks.
function realTerminal(client) {
    const input = new PassThrough();
    Object.assign(input, { isTTY: true, isRaw: false, setRawMode(value) { this.isRaw = value; return this; } });
    let output = '';
    const stdout = new Writable({ write(chunk, encoding, done) { output += chunk.toString(); done(); } });
    Object.assign(stdout, { isTTY: true, columns: 80 });
    const logs = [];
    const fakeProcess = { stdin: input, stdout, argv: ['node', 'bootstrap-test-accounts-cli.ts'], env: { DATABASE_URL: 'postgresql://localhost/cafedb_v2_test?schema=public' } };
    const cli = loadSource('bootstrap-test-accounts-cli.ts', {
        '@prisma/client': { PrismaClient: class { constructor() { if (!client) throw new Error('Database forbidden'); return client; } } },
        globals: { process: fakeProcess, console: { log(value) { logs.push(value); }, error(value) { logs.push(value); } } },
    });
    return { input, stdout, cli, fakeProcess, logs, output: () => output };
}
const nextTurn = () => new Promise(resolve => setImmediate(resolve));
test('regression: readline close then split CRLF must not submit empty confirmation', async () => {
    const t = realTerminal();
    const rl = readline.createInterface({ input: t.input, output: t.stdout });
    const email = new Promise(resolve => rl.question('Email: ', resolve));
    t.input.write('admin@example.test\r');
    await email; rl.close();
    const password = secret();
    const first = t.cli.hiddenInput('Password: ');
    t.input.write(password + '\r');
    assert.equal((await first) === password, true, 'Password must retain entered value');
    const confirmation = t.cli.hiddenInput('Confirm: ');
    await nextTurn();
    t.input.write('\n');
    await nextTurn();
    t.input.write(password + '\r');
    assert.equal((await confirmation) === password, true, 'Confirmation must retain entered value');
    assert.equal(t.input.isRaw, false);
    assert.equal(t.output().includes(password), false);
    t.input.destroy(); t.stdout.destroy();
});

test('regression: email CRLF handoff and two confirmed passwords using real decoder', async () => {
    const t = realTerminal();
    try {
        const plan = t.cli.readAccounts();
        t.input.write('admin@example.test\r'); await nextTurn();
        t.input.write('\n'); await nextTurn();
        t.input.write('staff@example.test\r'); await plan;
        for (const role of ['ADMIN', 'STAFF']) {
            const password = secret();
            const pending = t.cli.confirmedPassword(role);
            t.input.write('\n'); await nextTurn(); // LF from previous prompt
            t.input.write(password + '\r'); await nextTurn();
            t.input.write('\n'); await nextTurn(); // LF must not confirm empty
            t.input.write(password + '\r');
            assert.equal((await pending) === password, true, 'Confirmed input must match fixture');
            assert.equal(t.output().includes(password), false);
        }
        assert.equal(t.input.isRaw, false); assert.equal(t.input.isPaused(), true);
        assert.equal(t.input.listenerCount('keypress'), 0);
    } finally { t.input.destroy(); t.stdout.destroy(); }
});

test('single CR, LF and combined CRLF Enter work with Unicode/backspace', async () => {
    for (const ending of ['\r', '\n', '\r\n']) {
        const t = realTerminal();
        try {
            const pending = t.cli.hiddenInput('Password: ');
            const value = secret();
            t.input.write(value + 'é'); t.input.write('\x7f'); t.input.write(ending);
            assert.equal((await pending) === value, true, 'Backspace must remove one Unicode character');
            assert.equal(t.input.isRaw, false);
            assert.equal(t.output().includes(value), false);
        } finally { t.input.destroy(); t.stdout.destroy(); }
    }
});

test('confirmation mismatch has safe actionable code, no secret text', async () => {
    const t = realTerminal(); const value = secret();
    try {
        const pending = t.cli.confirmedPassword('ADMIN');
        const rejected = assert.rejects(pending, error => {
            error.message = value; // Even modified error.message must not leak.
            const report = t.cli.classifyError(error);
            assert.equal(report.code, 'PASSWORD_MISMATCH');
            assert.equal(JSON.stringify(report).includes(value), false);
            return true;
        });
        t.input.write(value + '\r'); await nextTurn();
        t.input.write(secret() + '\r'); await rejected;
    } finally { t.input.destroy(); t.stdout.destroy(); }
});

test('UTF-8 exact bcrypt bound and password policy codes without contents', async () => {
    validatePassword('é'.repeat(36)); // 72 bytes, valid
    assert.throws(() => validatePassword('é'.repeat(37)), error => error.code === 'PASSWORD_POLICY');
    const t = realTerminal();
    try {
        const pending = t.cli.confirmedPassword('ADMIN');
        const rejected = assert.rejects(pending, error => t.cli.classifyError(error).code === 'PASSWORD_POLICY');
        t.input.write('é'.repeat(37) + '\r'); await nextTurn();
        t.input.write('é'.repeat(37) + '\r'); await rejected;
    } finally { t.input.destroy(); t.stdout.destroy(); }
});

test('stdin end/close and already destroyed stream reject safely; raw mode restored', async () => {
    for (const action of ['end', 'destroy']) {
        const t = realTerminal();
        const pending = t.cli.hiddenInput('Password: ');
        const rejected = assert.rejects(pending, error => t.cli.classifyError(error).code === 'INPUT_INTERRUPTED');
        if (action === 'end') t.input.end(); else t.input.destroy();
        await rejected;
        assert.equal(t.input.isRaw, false); assert.equal(t.input.listenerCount('keypress'), 0);
        t.input.destroy();
        assert.throws(() => t.cli.hiddenInput('Password: '), error => error.code === 'INPUT_INTERRUPTED');
        t.stdout.destroy();
    }
});

test('safe classifier whitelists runtime/Prisma codes; discards arbitrary error details', () => {
    const t = realTerminal(); const sensitive = secret();
    try {
        for (const [error, expected] of [
            [{ code: 'ENOMEM', message: sensitive }, 'ENVIRONMENT_ENOMEM'],
            [{ code: 'ERR_SYSTEM_ERROR', info: { message: 'not enough memory' }, message: sensitive }, 'ENVIRONMENT_ENOMEM'],
            [{ code: 'P1000', message: sensitive, meta: { token: sensitive } }, 'DATABASE_AUTH_FAILED'],
            [{ code: 'P2034', message: sensitive }, 'TRANSACTION_RETRY_REQUIRED'],
            [{ code: sensitive, message: sensitive }, 'UNEXPECTED_FAILURE'],
            [new Error(sensitive), 'UNEXPECTED_FAILURE'], [null, 'UNEXPECTED_FAILURE'],
        ]) {
            const report = t.cli.classifyError(error);
            assert.equal(report.code, expected);
            assert.equal(JSON.stringify(report).includes(sensitive), false);
        }
    } finally { t.input.destroy(); t.stdout.destroy(); }
});

test('default CLI dry-run with real readline and mock Prisma leaves account data unchanged', async () => {
    const f = fixture({ rows: [existing('ADMIN')] });
    let disconnected = false;
    f.client.$disconnect = async () => { disconnected = true; };
    const before = JSON.stringify(f.state.rows);
    const t = realTerminal(f.client);
    try {
        const pending = t.cli.main();
        t.input.write('admin@example.test\r'); await nextTurn();
        t.input.write('staff@example.test\r'); await pending;
        assert.deepEqual(JSON.parse(t.logs[0]), { mode: 'dry-run', created: 0, existing: 1, planned: 1 });
        assert.equal(JSON.stringify(f.state.rows), before);
        assert.equal(f.state.writes, 0); assert.equal(f.state.readonly, 1);
        assert.equal(disconnected, true);
        assert.equal(t.output().includes('password'), false);
    } finally { t.input.destroy(); t.stdout.destroy(); }
});

test('CLI rejects missing environment and cafedb before constructing Prisma or reading accounts', async () => {
    for (const [url, expected] of [[undefined, 'DATABASE_URL_REQUIRED'], ['postgresql://localhost/cafedb', 'DATABASE_TARGET_REJECTED']]) {
        const t = realTerminal();
        try {
            t.fakeProcess.env.DATABASE_URL = url;
            await assert.rejects(t.cli.main(), error => t.cli.classifyError(error).code === expected);
            assert.equal(t.output(), '');
            assert.equal(t.input.listenerCount('keypress'), 0);
        } finally { t.input.destroy(); t.stdout.destroy(); }
    }
});

test('email interruption rejects instead of leaving pending question', async () => {
    const t = realTerminal();
    try {
        const pending = t.cli.readAccounts();
        const rejected = assert.rejects(pending, error => t.cli.classifyError(error).code === 'INPUT_INTERRUPTED');
        t.input.write('\x03'); await rejected;
        assert.equal(t.input.isRaw, false);
        assert.equal(t.input.listenerCount('keypress'), 0);
    } finally { t.input.destroy(); t.stdout.destroy(); }
});
