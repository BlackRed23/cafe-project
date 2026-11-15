import express, { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { AgentWorkflow, MockAgentRepository, MockLLMProvider, LLMProvider } from '@cafe-project/agent/workflows';
import { createAuthMiddleware, AuthenticatedRequest, roleMiddleware } from '../modules/auth/auth.middleware';
import { verifySignedToken } from '../modules/auth/auth.tokens';
import { HttpError } from '../common/http-error';
import { sendError, sendSuccess } from '../common/response';
import { BusinessWorkflows, Command } from './business-service';
import { BusinessError, OperationResult, TransactionFailure } from './contracts';
import { MockRepository } from './mock-repository';
import { createLocalDevelopmentRepositories } from './local-state';
import { TARGET_ENUMS, TARGET_TABLES } from './provider';

const id = z.string().min(1).max(120).regex(/^[A-Za-z0-9][A-Za-z0-9:_-]*$/);
const decimalText = (value: string) => value.includes('.') ? value.replace(/0+$/, '').replace(/\.$/, '') : value;
const quantity = z.string().regex(/^(0|[1-9]\d{0,10})(\.\d{1,3})?$/).transform(decimalText);
const money = z.string().regex(/^(0|[1-9]\d{0,11})(\.\d{1,2})?$/).transform(decimalText);
const unitCost = z.string().regex(/^(0|[1-9]\d{0,13})(\.\d{1,4})?$/).transform(decimalText);
const versions = z.record(id, z.string().regex(/^(0|[1-9]\d*)$/)).default({});
const timestamp = z.iso.datetime({ offset: true }).transform(value => new Date(value).toISOString());
const effect = z.object({ type: z.literal('ADD'), ingredientId: id, baseUnit: z.enum(['g', 'ml', 'piece']), quantity, unit: z.enum(['g', 'kg', 'ml', 'l', 'piece']), active: z.boolean() }).strict();
const line = z.object({ productId: id, servings: z.string().regex(/^[1-9]\d{0,9}$/), omitted: z.array(id).max(100).default([]), effects: z.array(effect).max(100).default([]) }).strict();
const purchase = z.object({ supplierId: id, lines: z.array(z.object({ ingredientId: id, quantity, unitCost }).strict()).min(1).max(100) }).strict();
const receipt = z.object({ purchaseId: id, lines: z.array(z.object({ ingredientId: id, quantity, expirationDate: timestamp }).strict()).min(1).max(100) }).strict();
const countLines = z.array(z.object({ batchId: id, actual: quantity }).strict()).min(1).max(100);
const plan = z.array(z.discriminatedUnion('tool', [
    z.object({ tool: z.literal('purchase.create'), input: purchase }).strict(),
    z.object({ tool: z.enum(['inventory.read', 'inventory.recommend']), input: z.null() }).strict(),
])).min(1).max(20);
const keySchema = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/);
const replenishment = z.object({ supplierId: id, unitCosts: z.record(id, unitCost) }).strict();

export type MockHttpOptions = { env: Record<string, string | undefined>; repository?: MockRepository; agentRepository?: MockAgentRepository; llm?: LLMProvider; clock?: () => Date; maxAttempts?: number };

/** Separate executable compatibility boundary. Never mounted by legacy index.ts or workers. */
export function createMockHttpApp(options: MockHttpOptions) {
    const { env } = options;
    if (env.DATA_PROVIDER !== 'mock' || env.NODE_ENV === 'production') throw new Error('MOCK_HTTP_DISABLED');
    if (!env.JWT_SECRET || env.JWT_SECRET.trim().length < 32) throw new Error('Mock HTTP requires a JWT_SECRET of at least 32 characters');
    if (env.MOCK_STATE_PERSISTENCE === 'true' && (options.repository || options.agentRepository)) throw new Error('MOCK_STATE_CUSTOM_REPOSITORY_CONFLICT');
    const local = createLocalDevelopmentRepositories(env);
    const repository = options.repository ?? local?.repository ?? new MockRepository();
    const business = new BusinessWorkflows(repository, options.clock, options.maxAttempts);
    const agentRepository = options.agentRepository ?? local?.agentRepository ?? new MockAgentRepository();
    const agent = new AgentWorkflow(agentRepository, business, options.llm ?? new MockLLMProvider(), undefined, options.clock);
    const app = express(); app.disable('x-powered-by'); app.use(express.json({ limit: '256kb' }));
    app.get('/health', (_req, res) => sendSuccess(res, 200, 'MOCK_VERIFIED', { provider: 'mock', postgres: 'POSTGRES_NOT_VERIFIED' }));
    app.use('/api/mock', (_req, res, next) => {
        if (env.DATA_PROVIDER !== 'mock' || env.NODE_ENV === 'production') { sendError(res, 404, 'NOT_FOUND'); return; }
        next();
    });
    app.use('/api/mock', createAuthMiddleware({
        verifyAuthToken: token => verifySignedToken(token, env.JWT_SECRET!),
        getCurrentUser: async actorId => repository.read(tx => {
            const principal = tx.principal(actorId);
            if (!principal?.active || !['ADMIN', 'STAFF', 'CUSTOMER'].includes(principal.role)) throw new HttpError(403, 'FORBIDDEN');
            return { id: principal.id, email: `${principal.id}@mock.invalid`, role: principal.role as 'ADMIN' | 'STAFF' | 'CUSTOMER' };
        }),
    }));
    const actor = (req: Request) => (req as AuthenticatedRequest).user!.id;
    const output = (res: Response, response: OperationResult) => response.status >= 400
        ? sendError(res, response.status, (response.body as { code: string }).code)
        : sendSuccess(res, response.status, 'MOCK_VERIFIED', response.body);
    const wrap = (handler: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => { void handler(req, res).catch(next); };
    const write = <T>(path: string, schema: z.ZodType<T>, handler: (c: Command, input: T) => Promise<OperationResult>) => {
        app.post('/api/mock' + path, wrap(async (req, res) => {
            const key = keySchema.parse(req.get('Idempotency-Key'));
            const body = z.object({ input: schema, versions }).strict().parse(req.body);
            output(res, await handler({ actorId: actor(req), key, scope: 'http.mock', versions: body.versions }, body.input));
        }));
    };
    app.get('/api/mock/session', (req, res) => sendSuccess(res, 200, 'MOCK_VERIFIED', (req as AuthenticatedRequest).user));
    app.get('/api/mock/menu', wrap(async (req, res) => { sendSuccess(res, 200, 'MOCK_VERIFIED', await business.catalog(actor(req))); }));
    for (const area of ['inventory', 'orders', 'purchases', 'counts', 'payments'] as const) {
        app.get('/api/mock/views/' + area, wrap(async (req, res) => { sendSuccess(res, 200, 'MOCK_VERIFIED', await business.applicationData(actor(req), area)); }));
    }
    write('/menu/draft', z.object({ productId: id, name: z.string().trim().min(1).max(200), price: money, yieldQuantity: z.string().regex(/^(0|[1-9]\d{0,7})(\.\d{1,2})?$/), ingredients: z.array(z.object({ ingredientId: id, quantity, unit: z.enum(['g', 'kg', 'ml', 'l', 'piece']), optional: z.boolean() }).strict()).min(1).max(100) }).strict(), (c, p) => business.saveMenuDraft(c, p));
    write('/menu/archive', z.object({ productId: id }).strict(), (c, p) => business.archiveMenu(c, p));
    write('/menu/publish', z.object({ productId: id }).strict(), (c, p) => business.publishMenu(c, p));
    app.get('/api/mock/manifest', wrap(async (req, res) => { await business.authorize(actor(req), 'inventory.read'); sendSuccess(res, 200, 'MOCK_VERIFIED', { tables: TARGET_TABLES, enums: TARGET_ENUMS }); }));
    app.get('/api/mock/inventory', wrap(async (req, res) => { sendSuccess(res, 200, 'MOCK_VERIFIED', await business.inventory(actor(req))); }));
    app.get('/api/mock/inventory/recommendations', wrap(async (req, res) => { sendSuccess(res, 200, 'MOCK_VERIFIED', await business.recommendInventory(actor(req))); }));
    app.get('/api/mock/recipes/:productId', wrap(async (req, res) => { sendSuccess(res, 200, 'MOCK_VERIFIED', await business.recipes(actor(req), id.parse(req.params.productId))); }));
    app.get('/api/mock/purchases/suppliers/:id/quotes', wrap(async (req, res) => { sendSuccess(res, 200, 'MOCK_VERIFIED', await business.purchaseQuotes(actor(req), id.parse(req.params.id))); }));
    app.post('/api/mock/recipes/requirements', wrap(async (req, res) => { sendSuccess(res, 200, 'MOCK_VERIFIED', await business.recipe(actor(req), line.parse(req.body))); }));
    app.get('/api/mock/orders/:id', wrap(async (req, res) => { sendSuccess(res, 200, 'MOCK_VERIFIED', await business.getOrder(actor(req), id.parse(req.params.id))); }));
    app.get('/api/mock/purchases/:id', wrap(async (req, res) => { sendSuccess(res, 200, 'MOCK_VERIFIED', await business.getPurchase(actor(req), id.parse(req.params.id))); }));
    app.get('/api/mock/payments/:id', wrap(async (req, res) => { sendSuccess(res, 200, 'MOCK_VERIFIED', await business.getPayment(actor(req), id.parse(req.params.id))); }));
    write('/ingredients/edit', z.object({ ingredientId: id, name: z.string().trim().min(1).max(200) }).strict(), (c, p) => business.editIngredient(c, p));
    write('/orders', z.object({ items: z.array(line).min(1).max(100), amount: money }).strict(), (c, p) => business.createOrder(c, p));
    write('/orders/transition', z.object({ orderId: id, action: z.enum(['prepare', 'complete', 'cancel']), itemIds: z.array(id).min(1).max(100).optional(), reason: z.string().trim().min(1).max(1000).optional() }).strict(), (c, p) => business.transitionOrder(c, p));
    write('/orders/remake', z.object({ orderId: id, reason: z.string().trim().min(1).max(1000), itemIds: z.array(id).min(1).max(100).optional() }).strict(), (c, p) => business.remakeOrder(c, p));
    write('/purchases/credit', z.object({ purchaseId: id, amount: money, reason: z.string().trim().min(1).max(1000), targetPurchaseId: id.optional() }).strict(), (c, p) => business.resolveSupplierCredit(c, p));
    write('/purchases/settle', z.object({ purchaseId: id, amount: money, reason: z.string().trim().min(1).max(1000) }).strict(), (c, p) => business.settlePurchase(c, p));
    write('/purchases', purchase, (c, p) => business.createPurchase(c, p));
    write('/receipts/receive', receipt, (c, p) => business.receive(c, p));
    write('/receipts/draft', receipt, (c, p) => business.createReceiptDraft(c, p));
    write('/receipts/edit', receipt.extend({ receiptId: id }), (c, p) => business.editReceiptDraft(c, p));
    write('/receipts/confirm', z.object({ receiptId: id }).strict(), (c, p) => business.confirmReceipt(c, p));
    write('/receipts/correct', z.object({ receiptId: id, lineId: id, quantity, reason: z.string().trim().min(1).max(1000), disposition: z.enum(['RETURN_AVAILABLE', 'RETURN_AND_CREDIT_CONSUMED']).default('RETURN_AVAILABLE') }).strict(), (c, p) => business.correctReceipt(c, p));
    write('/counts', z.object({ lines: countLines }).strict(), (c, p) => business.createCount(c, p));
    write('/counts/edit', z.object({ countId: id, lines: countLines }).strict(), (c, p) => business.editCount(c, p));
    write('/counts/submit', z.object({ countId: id }).strict(), (c, p) => business.submitCount(c, p));
    write('/counts/approve', z.object({ countId: id, selfApprovalReason: z.string().max(1000) }).strict(), (c, p) => business.approveCount(c, p));
    write('/payments/attempt', z.object({ orderId: id, account: id }).strict(), (c, p) => business.paymentAttempt(c, p));
    write('/payments/settle', z.object({ paymentId: id, account: id, eventId: id, amount: money, outcome: z.enum(['SETTLED', 'FAILED']) }).strict(), (c, p) => business.settle(c, p));
    write('/payments/refund', z.object({ paymentId: id, amount: money }).strict(), (c, p) => business.refund(c, p));
    write('/refunds/request', z.object({ paymentId: id, amount: money }).strict(), (c, p) => business.requestRefund(c, p));
    write('/refunds/resolve', z.object({ paymentId: id, refundId: id, account: id, eventId: id, outcome: z.enum(['UNKNOWN', 'SUCCEEDED', 'FAILED']) }).strict(), (c, p) => business.resolveRefund(c, p));
    write('/payments/reconcile', z.object({ account: id, date: z.iso.date(), expectedGross: money, expectedRefunds: money }).strict(), (c, p) => business.reconcilePayments(c, p));

    const agentWrite = <T>(path: string, kind: Parameters<AgentWorkflow['command']>[2], schema: z.ZodType<T>, work: (scoped: AgentWorkflow, actorId: string, input: T) => Promise<unknown>) => {
        app.post('/api/mock/agent' + path, wrap(async (req, res) => {
            const key = keySchema.parse(req.get('Idempotency-Key')); const { input } = z.object({ input: schema }).strict().parse(req.body);
            const actorId = actor(req);
            output(res, await agent.command(actorId, key, kind, input, (scoped, frozen) => work(scoped, actorId, frozen)));
        }));
    };
    app.use('/api/mock/agent/approve', roleMiddleware('ADMIN'));
    app.use('/api/mock/agent/revoke', roleMiddleware('ADMIN'));
    agentWrite('/plan', 'plan', z.object({
        prompt: z.string().max(10000).default('read inventory'), budget: z.number().int().min(0).max(40),
        proposal: purchase.optional(), replenishment: replenishment.optional(),
    }).strict().refine(p => !(p.proposal && p.replenishment)), (a, user, p) =>
        a.plan(user, p.proposal ? 'purchase:' + JSON.stringify(p.proposal) : p.prompt, p.budget, p.replenishment));
    agentWrite('/revise', 'revise', z.object({ executionId: id, plan, expectedRevision: z.string().regex(/^[1-9]\d*$/) }).strict(), (a, user, p) => a.revise(p.executionId, user, p.plan, p.expectedRevision));
    agentWrite('/approve', 'approve', z.object({ executionId: id, expiresAt: timestamp, expectedHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict(), (a, user, p) => a.approve(p.executionId, user, p.expiresAt, p.expectedHash));
    agentWrite('/revoke', 'revoke', z.object({ approvalId: id }).strict(), (a, user, p) => a.revoke(p.approvalId, user));
    agentWrite('/execute', 'execute', z.object({ executionId: id }).strict(), (a, user, p) => a.execute(p.executionId, user));
    agentWrite('/cancel', 'cancel', z.object({ executionId: id }).strict(), (a, user, p) => a.cancel(p.executionId, user));
    app.get('/api/mock/agent/executions', wrap(async (req, res) => { sendSuccess(res, 200, 'MOCK_VERIFIED', await agent.listExecutions(actor(req))); }));
    app.get('/api/mock/agent/executions/:id', wrap(async (req, res) => { sendSuccess(res, 200, 'MOCK_VERIFIED', await agent.inspect(actor(req), id.parse(req.params.id))); }));
    agentWrite('/memory/remember', 'remember', z.object({ text: z.string().trim().min(1).max(4000) }).strict(), (a, user, p) => a.remember(user, p.text));
    agentWrite('/memory/learn', 'learn', z.object({ memoryId: id }).strict(), (a, user, p) => a.learn(user, p.memoryId));
    agentWrite('/memory/consolidate', 'consolidate', z.object({}).strict(), (a, user) => a.consolidate(user));
    agentWrite('/memory/forget', 'forget', z.object({ memoryId: id }).strict(), (a, user, p) => a.forget(user, p.memoryId));
    app.get('/api/mock/agent/memory', wrap(async (req, res) => { await business.authorize(actor(req), 'memory'); sendSuccess(res, 200, 'MOCK_VERIFIED', await agent.retrieve(actor(req), z.string().max(4000).parse(req.query.q ?? ''))); }));
    app.use((_req, res) => sendError(res, 404, 'NOT_FOUND'));
    app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
        if ((error as { type?: string })?.type === 'entity.too.large') { sendError(res, 413, 'PAYLOAD_TOO_LARGE'); return; }
        if (error instanceof z.ZodError || (error as { type?: string })?.type === 'entity.parse.failed') { sendError(res, 400, 'INVALID_INPUT'); return; }
        if (error instanceof BusinessError) { sendError(res, error.status, error.code); return; }
        if (error instanceof HttpError) { sendError(res, error.statusCode, error.message); return; }
        if (error instanceof TransactionFailure || (error instanceof Error && error.message.startsWith('INJECTED_'))) { sendError(res, 503, 'OPERATION_UNCERTAIN'); return; }
        if (error instanceof Error && error.message === 'FORBIDDEN') { sendError(res, 403, 'FORBIDDEN'); return; }
        sendError(res, 500, 'INTERNAL_ERROR');
    });
    return { app, business, agent, repository, agentRepository };
}
