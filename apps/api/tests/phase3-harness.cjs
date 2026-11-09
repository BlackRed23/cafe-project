const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');
const jwt = require('jsonwebtoken');
const { request } = require('./in-process-http.cjs');
const previousTs = Module._extensions['.ts'], previousLoad = Module._load;
Module._extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file);
Module._load = function(name, parent, main) {
  if (['@cafe-project/database', '@google/generative-ai', 'nodemailer'].includes(name)) throw new Error('External provider import forbidden in mock tests');
  if (name === '@cafe-project/agent/workflows') return previousLoad.call(this, path.resolve(__dirname, '../../agent/src/workflows/agent-workflow.ts'), parent, main);
  return previousLoad.call(this, name, parent, main);
};
let createMockHttpApp, MockRepository, MockAgentRepository, MockClient, MockCommand, commands;
try {
  ({ createMockHttpApp } = require('../src/workflows/http.ts'));
  ({ MockRepository } = require('../src/workflows/mock-repository.ts'));
  ({ MockAgentRepository } = require('../../agent/src/workflows/agent-workflow.ts'));
  ({ MockClient, MockCommand } = require('../../web/src/api/mock-client.ts'));
  commands = require('../../web/src/mock/commands.ts');
} finally { Module._load = previousLoad; if (previousTs) Module._extensions['.ts'] = previousTs; else delete Module._extensions['.ts']; }
const secret = 'phase3-test-signing-secret-over-32-characters';
function fixture(seed, agentSeed, clock = () => new Date('2026-11-07T00:00:00Z')) {
  const runtime = createMockHttpApp({ env: { DATA_PROVIDER: 'mock', NODE_ENV: 'test', JWT_SECRET: secret }, repository: new MockRepository(seed), agentRepository: new MockAgentRepository(agentSeed), clock, maxAttempts: 1 });
  let sequence = 0;
  const token = (actor) => jwt.sign({ id: actor, email: actor + '@mock.invalid', role: actor === 'admin' ? 'ADMIN' : 'STAFF' }, secret, { expiresIn: '1h' });
  const client = (actor = 'admin') => new MockClient('mock', () => token(actor), async (url, init) => { const response = await request(runtime.app, url, { ...init, headers: Object.fromEntries(Object.entries(init.headers).map(([k,v]) => [k.toLowerCase(), v])) }); return { ...response, ok: response.status >= 200 && response.status < 300 }; });
  const api = client();
  return { ...runtime, api, client, token, write: (route, input, versions = {}, actor = 'admin', key) => client(actor).request(route, input, key ?? `phase3-${++sequence}`, versions) };
}
module.exports = { fixture, MockClient, MockCommand, commands };
