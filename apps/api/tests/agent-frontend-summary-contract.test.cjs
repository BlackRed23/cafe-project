'use strict';
const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const express = require('express');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: 'apps/api/.env', quiet: true });
require('ts-node').register({ project: 'apps/api/tsconfig.json', transpileOnly: true });
const { createAuthMiddleware } = require('../src/modules/auth/auth.middleware');
const { HttpError } = require('../src/common/http-error');
const { errorHandler } = require('../src/common/error-handler');
const { createAgentFrontendSummaryRouter, toAgentFrontendExecutionSummary } =
    require('../src/modules/agent/agent-frontend-summary.route');

// Signed tokens + real Express HTTP, isolated owned in-memory records. No shared DB writes.
// This contract test does not claim real cafedb/production-JWT integration.
const secret = 'isolated-agent-frontend-http-test-key';
const accounts = new Map([
    ['admin', { id: 'admin', email: 'admin@example.invalid', role: 'ADMIN' }],
    ['staff', { id: 'staff', email: 'staff@example.invalid', role: 'STAFF' }],
    ['demoted', { id: 'demoted', email: 'demoted@example.invalid', role: 'STAFF' }]
]);
const sign = (id, role) => jwt.sign({ id, email: id + '@example.invalid', role }, secret, { expiresIn: '2m' });
const forbidden = 'DO_NOT_EXPOSE_RAW_SECRET_ARGUMENT_TOKEN_PROMPT';
const records = new Map([
    ['execution-a', {
        id: 'execution-a', triggeredBy: 'admin', status: 'WAITING_APPROVAL',
        startedAt: new Date('2026-11-19T10:00:00.000Z'),
        endedAt: null, fallbackUsed: true, goal: forbidden,
        errorMessage: forbidden, prompt: forbidden,
        toolCalls: [
            { stepNo: 1, toolName: 'getIngredientAvailability', status: 'SUCCEEDED',
                arguments: { internalToken: forbidden }, result: { raw: forbidden } },
            { stepNo: 2, toolName: 'privileged.purchase.invoke ' + forbidden, status: 'FAILED',
                arguments: { command: forbidden } }
        ]
    }],
    ['execution-b', {
        id: 'execution-b', triggeredBy: 'admin', status: 'FAILED',
        startedAt: new Date('2026-11-19T11:00:00.000Z'),
        endedAt: new Date('2026-11-19T11:01:00.000Z'),
        fallbackUsed: false, toolCalls: []
    }],
    ['execution-foreign', {
        id: 'execution-foreign', triggeredBy: 'another-admin', status: 'SUCCEEDED',
        startedAt: new Date('2026-11-19T11:00:00.000Z'), endedAt: new Date('2026-11-19T11:02:00.000Z'),
        fallbackUsed: false, toolCalls: []
    }],
    ['execution-system', {
        id: 'execution-system', triggeredBy: null, status: 'RUNNING',
        startedAt: new Date('2026-11-19T11:00:00.000Z'), endedAt: null,
        fallbackUsed: false, toolCalls: []
    }]
]);
const source = {
    verifyAuthToken: token => jwt.verify(token, secret),
    getCurrentUser: async id => {
        const user = accounts.get(id);
        if (!user) throw new HttpError(403, 'ACCOUNT_INACTIVE');
        return user;
    }
};
const auth = createAuthMiddleware(source);
let server;
let base;
before(async () => {
    const app = express();
    app.use('/api/agent', createAgentFrontendSummaryRouter(async id => records.get(id) ?? null, auth));
    app.use(errorHandler);
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    base = 'http://127.0.0.1:' + server.address().port + '/api/agent';
});
after(async () => {
    if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});
const request = async (id, token) => {
    const response = await fetch(base + '/executions/' + encodeURIComponent(id) + '/summary', {
        headers: token ? { Authorization: 'Bearer ' + token } : {},
        signal: AbortSignal.timeout(4000)
    });
    return { status: response.status, body: await response.json() };
};
test('PUBLIC_FRONTEND_API: signed ADMIN HTTP obtains typed run projection with no raw inputs/results/prompts', async () => {
    const { status, body } = await request('execution-a', sign('admin', 'ADMIN'));
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.runId, 'execution-a');
    assert.equal(body.data.source, 'AGENT_EXECUTION');
    assert.equal(body.data.status, 'WAITING_APPROVAL');
    assert.equal(body.data.approval.state, 'PENDING_HUMAN');
    assert.equal(body.data.approval.canApproveFromThisEndpoint, false);
    assert.equal(body.data.blocked, true);
    assert.deepEqual(body.data.permittedActions, []);
    assert.equal(body.data.dataQualityStatus, 'NOT_RECORDED');
    assert.deepEqual(body.data.planningSteps, []);
    assert.deepEqual(body.data.selectedTools, [
        { stepNo: 1, name: 'getIngredientAvailability', status: 'SUCCEEDED', selectionReason: null }
    ]);
    assert.ok(body.data.messageVi.includes('chờ'));
    assert.ok(!JSON.stringify(body).includes(forbidden));
    for (const sensitive of ['arguments', 'raw', 'prompt', 'goal', 'errorMessage', 'internalToken']) {
        assert.equal(Object.prototype.hasOwnProperty.call(body.data, sensitive), false);
    }
});
test('RBAC: STAFF denied 403 even with valid signed JWT', async () => {
    const result = await request('execution-a', sign('staff', 'STAFF'));
    assert.equal(result.status, 403);
    assert.equal(result.body.success, false);
});
test('RBAC: current account role overrides stale ADMIN claim', async () => {
    const result = await request('execution-a', sign('demoted', 'ADMIN'));
    assert.equal(result.status, 403);
});
test('OWNERSHIP: even ADMIN cannot fetch foreign or system-owned run', async () => {
    for (const id of ['execution-foreign', 'execution-system']) {
        const result = await request(id, sign('admin', 'ADMIN'));
        assert.equal(result.status, 404);
        assert.equal(result.body.code, 'AGENT_EXECUTION_NOT_FOUND');
        assert.ok(!JSON.stringify(result.body).includes('another-admin'));
    }
});
test('AUTH: anonymous 401; forged token fails closed (existing middleware returns 503)', async () => {
    assert.equal((await request('execution-a')).status, 401);
    assert.equal((await request('execution-a', jwt.sign({ id: 'admin', role: 'ADMIN' }, 'wrong-key'))).status, 503);
    // An invalid signed token fails closed. The existing auth middleware maps an
    // unexpected verification exception to 503 rather than falsely claiming 401.
});
test('INPUT: invalid runId 400; nonexistent authorized run 404', async () => {
    const invalid = await request('@bad', sign('admin', 'ADMIN'));
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.code, 'INVALID_AGENT_RUN_ID');
    const missing = await request('missing-run', sign('admin', 'ADMIN'));
    assert.equal(missing.status, 404);
    assert.equal(missing.body.code, 'AGENT_EXECUTION_NOT_FOUND');
});
test('FAIL projection: deterministic sanitized code/message, never raw execution error', () => {
    const result = toAgentFrontendExecutionSummary(records.get('execution-b'));
    assert.equal(result.errorCode, 'AGENT_EXECUTION_FAILED');
    assert.equal(result.completedAt, '2026-11-19T11:01:00.000Z');
    assert.equal(result.permittedActions.length, 0);
    assert.equal(result.selectionReasonsStatus, 'NOT_PERSISTED');
});
test('ALL persisted frontend statuses map deterministically without raw failure details', () => {
    const original = records.get('execution-a');
    for (const status of ['RUNNING', 'WAITING_APPROVAL', 'SUCCEEDED', 'FAILED', 'TIMEOUT', 'CANCELLED']) {
        const view = toAgentFrontendExecutionSummary({ ...original, status });
        assert.equal(view.status, status);
        assert.ok(view.messageVi.length > 0);
        assert.ok(!JSON.stringify(view).includes(forbidden));
        assert.equal(view.permittedActions.length, 0);
    }
});
