const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const http = require('node:http');
const ts = require('typescript');
const root = path.resolve(__dirname, '../../..');
const secret = require('node:crypto').randomBytes(32).toString('base64url');
const jwtSecret = require('node:crypto').randomBytes(32).toString('base64url');
process.env.AGENT_INTERNAL_TOKEN = secret;
const users = { admin: { id: 'admin', role: 'ADMIN', isActive: true }, staff: { id: 'staff', role: 'STAFF', isActive: true }, customer: { id: 'customer', role: 'CUSTOMER', isActive: true }, disabled: { id: 'disabled', role: 'ADMIN', isActive: false } };
const calls = [];
const fallback = [];
const service = Object.fromEntries(['scanInventory','logs','recommendReorder','getRecommendations','createPurchaseRequestFromRecommendation','createLog'].map(name => [name, async (...args) => { calls.push({ name, args }); return { ok: true }; }]));
const originalLoad = Module._load;
Module._extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file);
Module._load = function(request, parent, main) {
    if (parent?.filename.includes(`${path.sep}api${path.sep}src${path.sep}`) && request.endsWith('/env')) return { env: { jwtSecret, jwtExpiresIn: '1h', nodeEnv: 'test' } };
    if(request === '@cafe-project/database') return { prisma: { user: { findUnique: async ({where}) => users[where.id] || null } } };
    if(request === 'dotenv') return { config() {} };
    if(parent?.filename.endsWith('server.ts') && request === './services/agent.service') return { agentService: service };
    if(request === './agent-failure-log.service') return { agentFailureLogService: { createServiceUnavailableLog: async (...args) => { fallback.push(args); return {}; }, listLogs: async () => [] } };
    return originalLoad.call(this,request,parent,main);
};
const auth = require('../src/internal-auth.ts');
const {handleRequest} = require('../src/server.ts');
const { EventEmitter } = require('node:events');
let client;
async function dispatch(method,url,headers,body) {
    const req=new EventEmitter();Object.assign(req,{method,url,headers});
    let result;
    const res={writeHead(status){this.status=status},end(text){result={status:this.status,text}}};
    const pending=handleRequest(req,res);
    setImmediate(()=>{if(body)req.emit('data',Buffer.from(body));req.emit('end')});
    await pending; return result;
}
const originalRequest=http.request;
before(()=>{
    process.env.AGENT_BASE_URL='http://127.0.0.1:5055';
    http.request=(url,options,callback)=>{
        const req=new EventEmitter();let body='';req.write=chunk=>{body+=chunk};req.destroy=err=>req.emit('error',err);
        req.end=()=>{dispatch(options.method,url.pathname+url.search,options.headers,body).then(result=>{
            const res=new EventEmitter();res.statusCode=result.status;callback(res);
            res.emit('data',Buffer.from(result.text));res.emit('end');
        }).catch(error=>req.emit('error',error))};return req;
    };
    client=require('../../api/src/modules/agent/agent.client.ts');
});
after(()=>{http.request=originalRequest;Module._load=originalLoad});
const endpoints = [ ['POST','/scan-inventory'], ['GET','/logs'], ['POST','/recommend-reorder'], ['GET','/recommendations'], ['POST','/recommendations/rec/create-purchase-request'], ['POST','/logs'] ];
async function request(method,route,headers={},body) {
    return dispatch(method,'/internal/agent'+route,headers,method==='POST'?JSON.stringify(body||{}):undefined);
}
test('missing/weak/malformed internal secret fails closed on both sides', async () => {
    for(const value of [undefined,'','dev-agent-secret','a'.repeat(50),' invalid '.repeat(10)]) {
        if(value === undefined) delete process.env.AGENT_INTERNAL_TOKEN; else process.env.AGENT_INTERNAL_TOKEN=value;
        assert.throws(auth.requireInternalSecret, /configuration/);
        delete require.cache[require.resolve('../src/server.ts')];
        assert.throws(() => require('../src/server.ts'), /configuration/);
        await assert.rejects(client.scanInventoryViaAgentService({},'admin'), /configuration/);
    }
    process.env.AGENT_INTERNAL_TOKEN=secret;
    assert.equal(fallback.length,0);
});
test('all internal endpoints reject missing and incorrect token with zero operations',async()=>{
    calls.length=0;
    for(const [method,route] of endpoints) for(const token of [undefined,'wrong']) {
        const result=await request(method,route,token?{'x-agent-internal-token':token}:{});
        assert.equal(result.status,401); assert.equal(result.text.includes(secret),false);
    }
    assert.equal(calls.length,0);
});
test('body identity/role cannot authorize; inactive/customer/missing principals create zero records',async()=>{
    calls.length=0;
    for(const [method,route] of endpoints) for(const id of [undefined,'customer','disabled','removed']) {
        const result=await request(method,route,{'x-agent-internal-token':secret,...(id?{'x-agent-user-id':id}:{})},{userId:'admin',role:'ADMIN',input:{userId:'admin',role:'ADMIN'}});
        assert.equal(result.status,403); assert.equal(result.text.includes('admin'),false);
    }
    assert.equal(calls.length,0);
});
test('operation-specific staff and system permissions',async()=>{
    calls.length=0;
    for(const [method,route] of endpoints) {
        const result=await request(method,route,{'x-agent-internal-token':secret,'x-agent-user-id':'staff'});
        assert.equal(result.status,method==='GET'&&route==='/logs'?200:403);
    }
    for(const [method,route] of endpoints) {
        const result=await request(method,route,{'x-agent-internal-token':secret,'x-agent-principal':'system'});
        assert.equal(result.status,method==='POST'&&route==='/logs'?201:403);
    }
});
test('authorized API-to-Agent flows retain verified identity, including reads',async()=>{
    calls.length=0;
    await client.scanInventoryViaAgentService({note:'valid'},'admin');
    await client.recommendReorderViaAgentService({},'admin');
    await client.getRecommendationsViaAgentService('admin');
    await client.getAgentLogsViaAgentService({},'staff');
    await client.createPurchaseRequestFromRecommendationViaAgentService('rec','admin');
    await client.createAgentLogViaAgentService({action:'TEST',creator:{connect:{id:'admin'}},createdBy:'admin'});
    assert.equal(calls.length,6);
    assert.equal(calls[0].args[1],'admin'); assert.equal(calls[1].args[1],'admin');
    assert.equal(calls[4].args[1],'admin'); assert.equal(calls[5].args[0].creator,undefined);
});
test('API denies invalid principals before transport or fallback writes',async()=>{
    calls.length=0;fallback.length=0;
    await assert.rejects(client.scanInventoryViaAgentService({},'customer'),/Forbidden/);
    await assert.rejects(client.scanInventoryViaAgentService({}),/Forbidden/);
    await assert.rejects(client.getAgentLogsViaAgentService({},'disabled'),/Forbidden/);
    assert.equal(calls.length,0);assert.equal(fallback.length,0);
});
test('unexpected service errors do not disclose tokens or identity',async()=>{
    const prev=service.recommendReorder;
    service.recommendReorder=async()=>{throw new Error(`${secret} private@example.test`)};
    const result=await request('POST','/recommend-reorder',{'x-agent-internal-token':secret,'x-agent-user-id':'admin'});
    service.recommendReorder=prev;
    assert.equal(result.status,500);assert.equal(result.text.includes(secret),false);assert.equal(result.text.includes('private@'),false);
});

test('Agent server defaults to loopback and ignores generic HOST', () => {
    const source = fs.readFileSync(path.join(root, 'apps/agent/src/server.ts'), 'utf8');
    assert.match(source, /process\.env\.AGENT_HOST \|\| '127\.0\.0\.1'/);
    assert.doesNotMatch(source, /process\.env\.HOST\b/);
});

test('MOCK_E2E: purchase timeout remains uncertain and is never retried automatically', async () => {
    const previousRequest = http.request;
    let attempts = 0;
    let remoteWrites = 0;
    http.request = () => {
        attempts++;
        const req = new EventEmitter();
        req.write = () => {};
        req.destroy = error => req.emit('error', error);
        req.end = () => {
            // The remote side committed, but its response never reached the caller.
            remoteWrites++;
            setImmediate(() => req.emit('timeout'));
        };
        return req;
    };
    calls.length = 0;
    fallback.length = 0;
    try {
        await assert.rejects(
            client.createPurchaseRequestFromRecommendationViaAgentService('rec', 'admin'),
            error => /timeout/.test(error.message) && error.statusCode === undefined
        );
        assert.equal(attempts, 1);
        assert.equal(remoteWrites, 1);
        assert.equal(calls.length, 0);
        assert.equal(fallback.length, 0);
    } finally { http.request = previousRequest; }
});

test('API-to-Agent E2E: JWT/validation/controller/client and Agent gate verify mock audit; denied requests do zero work', async () => {
    const express = require('express');
    const jwt = require('jsonwebtoken');
    const app = express(); app.use(express.json());
    const audit = [];
    const previous = service.recommendReorder;
    service.recommendReorder = async (input, actor) => {
        calls.push({ name: 'recommendReorder', args: [input, actor] });
        audit.push({ action: 'RECOMMEND_REORDER', actor, input });
        return { newRecommendationsCount: 1 };
    };
    const token = (id, role = 'ADMIN') => jwt.sign({ id, role, email: 'mock@example.test' }, jwtSecret, { expiresIn: '1h' });
    const realHttp = process.env.TEST_REAL_HTTP === '1';
    const servers = [];
    const previousRequest = http.request;
    const previousBase = process.env.AGENT_BASE_URL;
    let origin;
    const listen = async handler => {
        const server = http.createServer(handler);
        servers.push(server);
        await new Promise((resolve, reject) => {
            server.once('error', reject);
            server.listen(0, '127.0.0.1', resolve);
        });
        return `http://127.0.0.1:${server.address().port}`;
    };
    const request = async (bearer, body = {}) => {
        const options = {
        method: 'POST', headers: { 'content-type': 'application/json', ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) }, body: JSON.stringify(body)
        };
        return realHttp ? fetch(origin + '/api/agent/recommend-reorder', options)
            : require('../../api/tests/in-process-http.cjs').request(app, '/api/agent/recommend-reorder', options);
    };
    try {
        if (realHttp) {
            http.request = originalRequest;
            process.env.AGENT_BASE_URL = await listen((req, res) => {
                handleRequest(req, res).catch(() => { res.statusCode = 500; res.end(); });
            });
            origin = await listen(app);
        }
        // The client captures AGENT_BASE_URL at import time, as it does at startup.
        if (realHttp) {
            for (const name of ['agent.client', 'agent.controller', 'agent.route']) {
                delete require.cache[require.resolve(`../../api/src/modules/agent/${name}.ts`)];
            }
        }
        app.use('/api/agent', require('../../api/src/modules/agent/agent.route.ts').default);
        calls.length = 0; fallback.length = 0;
        const valid = await request(token('admin'), { productIds: ['p'], force: false, userId: 'customer', role: 'CUSTOMER' });
        assert.equal(valid.status, 200);
        assert.equal((await valid.json()).data.newRecommendationsCount, 1);
        assert.deepEqual(audit, [{ action: 'RECOMMEND_REORDER', actor: 'admin', input: { productIds: ['p'], force: false } }]);
        calls.length = 0; audit.length = 0;
        for (const [bearer, expected] of [[undefined, 401], ['invalid', 401], [token('customer', 'CUSTOMER'), 403], [token('customer'), 403], [token('disabled'), 403], [token('removed'), 403]]) {
            assert.equal((await request(bearer, { userId: 'admin', role: 'ADMIN' })).status, expected);
        }
        assert.equal((await request(token('admin'), { productIds: [null] })).status, 400);
        assert.equal(calls.length, 0); assert.equal(audit.length, 0); assert.equal(fallback.length, 0);
    } finally {
        service.recommendReorder = previous;
        http.request = previousRequest;
        process.env.AGENT_BASE_URL = previousBase;
        await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
    }
});
