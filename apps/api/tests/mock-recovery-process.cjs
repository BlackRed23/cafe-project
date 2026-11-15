// Load existing offline test module aliases, then compose explicit persistent runtime.
require('./phase3-harness.cjs');
const jwt = require('jsonwebtoken');
const { createMockHttpApp } = require('../src/workflows/http.ts');
const secret = 'phase5-local-test-signing-secret-over-32-characters';
const runtime = createMockHttpApp({ env: { DATA_PROVIDER: 'mock', NODE_ENV: 'test', JWT_SECRET: secret, MOCK_STATE_PERSISTENCE: 'true', MOCK_STATE_PATH: process.argv[2] }, clock: () => new Date('2026-11-07T00:00:00Z') });
const server = runtime.app.listen(0, '127.0.0.1', () => {
  process.send({ origin: 'http://127.0.0.1:' + server.address().port, token: jwt.sign({ id: 'admin', email: 'admin@mock.invalid', role: 'ADMIN' }, secret, { expiresIn: '1h' }) });
});
