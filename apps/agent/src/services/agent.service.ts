/** Ingredient-first AI agent service for the approved 27-table schema.
 * AgentExecution and AgentToolCall replace AgentLog; all purchasing requires a real user.
 */
import { requireAgentUser, requireInternalSecret } from '../internal-auth';
import { prisma, ExecutionStatus, ToolCallStatus } from '@cafe-project/database';
import { agentRepository, ACTIVE_PURCHASE_REQUEST_MESSAGE, type AgentIngredientRecord } from '../repositories/agent.repository';
import { recommendationService } from './recommendation.service';
import { AgentHttpError } from '../errors/http-error';
import { logger } from '../utils/logger';

export type ScanInventoryInput = {
  productIds?: string[]; triggerType?: string; sourceType?: string; sourceId?: string; note?: string;
};
export type RecommendReorderInput = { productIds?: string[]; force?: boolean };
export type AgentLogStatus = 'SUCCESS' | 'SKIPPED' | 'FAILED' | 'RUNNING';
export type AgentLogQuery = {
  page?: unknown; limit?: unknown; status?: unknown; action?: unknown; triggerType?: unknown; productId?: unknown;
};
type LegacyLogInput = {
  action: string; input?: unknown; output?: unknown; reasoning?: string | null;
  result?: string; fallback_used?: boolean; error_message?: string | null;
  reference_type?: string | null; reference_id?: string | null;
  creator?: { connect: { id: string } };
};
const parseJson = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
};
const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
const str = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value : undefined;
const n = (value: unknown): number => { const x = Number(value); return Number.isFinite(x) ? x : 0; };
const positiveInt = (value: unknown, otherwise: number, max = 1000): number => {
  const num = Number(value); return Number.isSafeInteger(num) && num > 0 ? Math.min(num, max) : otherwise;
};
const stat = (status: ExecutionStatus): AgentLogStatus =>
  status === ExecutionStatus.FAILED || status === ExecutionStatus.TIMEOUT ? 'FAILED'
  : status === ExecutionStatus.RUNNING || status === ExecutionStatus.WAITING_APPROVAL ? 'RUNNING' : 'SUCCESS';
const available = (ingredient: AgentIngredientRecord): number => Number(ingredient.quantity) - Number(ingredient.reserved);

// Display adapter, NOT an emulation of Prisma.AgentLog or a second persistence table.
function executionDto(execution: Awaited<ReturnType<typeof agentRepository.findExecutions>>[number]) {
  const call = execution.toolCalls[0];
  const rawArgs = asRecord(parseJson(call?.arguments));
  const rawResult = asRecord(parseJson(call?.result));
  const payload = asRecord(rawResult.output ?? rawResult);
  const args = asRecord(rawArgs.input ?? rawArgs);
  const status = stat(execution.status);
  const action = str(rawArgs.action) ?? execution.intent ?? call?.toolName ?? 'AGENT_EXECUTION';
  const result = str(rawResult.result) ?? (status === 'FAILED' ? 'FAILED' : status === 'RUNNING' ? 'RUNNING' : 'SUCCESS');
  const refType = str(rawArgs.reference_type) ?? null;
  const refId = str(rawArgs.reference_id) ?? null;
  return {
    id: execution.id, action, status, result,
    reason: str(payload.reason) ?? result,
    message: str(payload.message) ?? execution.errorMessage ?? action,
    triggerType: str(args.triggerType), scanSessionId: str(args.scanSessionId),
    productId: str(payload.productId) ?? str(args.productId),
    ingredientId: str(payload.ingredientId) ?? str(args.ingredientId),
    productName: str(payload.productName) ?? str(args.productName),
    purchaseRequestId: str(payload.purchaseRequestId) ?? execution.purchaseRequests[0]?.id,
    referenceType: refType, referenceId: refId,
    sourceId: str(args.sourceId), sourceType: str(args.sourceType),
    input: args, output: payload, reasoning: str(rawArgs.reasoning) ?? '',
    errorMessage: execution.errorMessage, fallbackUsed: execution.fallbackUsed,
    createdBy: execution.triggeredByUser,
    createdAt: execution.startedAt,
    fallback_used: execution.fallbackUsed, error_message: execution.errorMessage,
    reference_type: refType, reference_id: refId,
  };
}

async function createLegacyCompatibleLog(data: LegacyLogInput) {
  const userId = data.creator?.connect.id;
  const input = parseJson(data.input);
  const output = parseJson(data.output);
  const state = (data.result === 'FAILED' || data.error_message) ? ExecutionStatus.FAILED
    : data.result === 'RUNNING' ? ExecutionStatus.RUNNING : ExecutionStatus.SUCCEEDED;
  const execution = await agentRepository.createExecution({
    goal: data.action, intent: data.action, status: state,
    fallbackUsed: data.fallback_used ?? false,
    ...(userId ? { triggeredByUser: { connect: { id: userId } } } : {}),
    ...(state !== ExecutionStatus.RUNNING ? { endedAt: new Date() } : {}),
    errorMessage: data.error_message ?? null,
  });
  await agentRepository.createToolCall({
    executionId: execution.id, stepNo: 1, toolName: data.action,
    arguments: { action: data.action, input, reasoning: data.reasoning ?? null,
      reference_type: data.reference_type ?? null, reference_id: data.reference_id ?? null },
    result: { result: data.result ?? 'SUCCESS', output },
    status: state === ExecutionStatus.FAILED ? ToolCallStatus.FAILED
      : state === ExecutionStatus.RUNNING ? ToolCallStatus.RUNNING : ToolCallStatus.SUCCEEDED,
  });
  return execution;
}

let activeScan = false;
export const agentService = {
  async scanInventory(input: ScanInventoryInput = { triggerType: 'MANUAL_SCAN' }, userId?: string) {
    const actor = await requireAgentUser(userId);
    if (activeScan) return {
      results: [], createdPurchaseRequests: [], agentWarning: 'Agent đang kiểm tra tồn kho.'
    };
    activeScan = true;
    let executionId: string | undefined;
    try {
      const enabled = await agentRepository.getSettingValue('ai.enabled');
      const execution = await agentRepository.createExecution({
        goal: 'SCAN_INGREDIENT_INVENTORY', intent: 'SCAN_INVENTORY',
        status: ExecutionStatus.RUNNING, triggeredByUser: {connect: {id: actor}},
      });
      executionId = execution.id;
      const ingredients = await agentRepository.findIngredients();
      // productIds are product IDs, not ingredient IDs: map through each active recipe.
      let scoped = ingredients;
      if (input.productIds?.length) {
        const required = await Promise.all(input.productIds.map(id => agentRepository.getProductIngredientRequirements(id)));
        const ids = new Set(required.flat().map(r=>r.ingredientId));
        scoped = ingredients.filter(i=>ids.has(i.id));
      }
      const low = scoped.filter(i=>available(i) <= Number(i.minThreshold));
      const createdPurchaseRequests: Array<{ id: string; ingredientId: string }> = [];
      const reasons: Array<{ ingredientId: string; reason: string }> = [];
      // Automatic writes must be explicitly enabled; scanning is safe/read-only by default.
      const autoWrite = enabled !== 'false' && (await agentRepository.getSettingValue('agent.autoCreatePurchaseRequest')) === 'true';
      if (autoWrite) {
        for (const ingredient of low) {
          const link = ingredient.supplierLinks.find(s => s.supplier.status === 'ACTIVE' && s.supplier.deletedAt === null && s.isPreferred)
            ?? ingredient.supplierLinks.find(s => s.supplier.status === 'ACTIVE' && s.supplier.deletedAt === null);
          if (!link) { reasons.push({ ingredientId: ingredient.id, reason: 'NO_ACTIVE_SUPPLIER' }); continue; }
          if (await agentRepository.hasOpenPurchaseRequest(ingredient.id)) { reasons.push({ ingredientId: ingredient.id, reason: 'ACTIVE_PR_EXISTS' }); continue; }
          const qty = Math.max(1, Math.ceil(Number(ingredient.minThreshold) - available(ingredient)));
          try {
            const pr = await agentRepository.createAiPurchaseRequest(
              ingredient, link, qty, `Quét tồn kho nguyên liệu ${ingredient.name}.`, actor, undefined, execution.id,
            );
            createdPurchaseRequests.push({id: pr.id, ingredientId: ingredient.id});
          } catch (error) {
            reasons.push({ ingredientId: ingredient.id, reason: error instanceof Error ? error.message : 'PURCHASE_REQUEST_FAILED' });
          }
        }
      }
      const output = {
        scanSessionId: execution.id, triggerType: input.triggerType ?? 'MANUAL_SCAN',
        totalChecked: scoped.length, lowStockIngredientIds: low.map(i=>i.id),
        createdPurchaseRequestCount: createdPurchaseRequests.length,
        purchaseWritesBlocked: !autoWrite, reasons,
      };
      await agentRepository.createToolCall({
        executionId: execution.id, stepNo: 1, toolName: 'scanIngredientStock',
        arguments: { input, actor }, result: output, status: ToolCallStatus.SUCCEEDED,
      });
      await agentRepository.markExecutionSucceeded(execution.id);
      const [record] = await agentRepository.findExecutions({id: execution.id});
      return {results: record ? [executionDto(record)] : [], createdPurchaseRequests,
        scanSessionId: execution.id, sessionStatus: 'SUCCESS', summary: output};
    } catch (error) {
      if (executionId) await agentRepository.markExecutionFailed(executionId, error instanceof Error ? error.message : 'Unknown scan error');
      throw error;
    } finally { activeScan = false; }
  },

  async logs(query: AgentLogQuery = {}) {
    const page = positiveInt(query.page, 1, 100000);
    const limit = positiveInt(query.limit, 20, 100);
    const records = await agentRepository.findExecutions();
    const normalized = records.map(executionDto);
    const result = normalized.filter(log =>
      (!str(query.action) || log.action === str(query.action)) &&
      (!str(query.status) || log.status === str(query.status)?.toUpperCase()) &&
      (!str(query.triggerType) || log.triggerType === str(query.triggerType)) &&
      (!str(query.productId) || log.productId === str(query.productId))
    );
    const totalPages = Math.max(1, Math.ceil(result.length / limit));
    const safePage = Math.min(page, totalPages);
    return { logs: result.slice((safePage - 1)*limit, safePage*limit),
      pagination: {page: safePage, limit, total: result.length, totalPages}};
  },

  async recommendReorder(input: RecommendReorderInput = {force:false}, userId: string) {
    const actor = await requireAgentUser(userId);
    const productIds = input.productIds ?? await agentRepository.findActiveProductIds();
    const recommendations: Array<{logId: string; ingredientId: string; [key: string]: unknown}> = [];
    const skippedProducts: Array<{productId: string; reasonCode?: string}> = [];
    for (const id of productIds) {
      try {
        const result = await recommendationService.generateForProduct(id, input.force ?? false, actor);
        if (result.skipped) skippedProducts.push({productId: id, reasonCode: result.reason});
        else for (const item of result.recommendations) recommendations.push({logId: result.logId, ...item});
      } catch (error) {
        logger.error(`Recommendation failed for product ${id}`, error);
        skippedProducts.push({productId: id, reasonCode: 'RECOMMENDATION_FAILED'});
      }
    }
    return {scannedCount: productIds.length, newRecommendationsCount: recommendations.length,
      skippedCount: skippedProducts.length, recommendations, skippedProducts};
  },

  async getRecommendations() {
    const executions = await agentRepository.findExecutions({intent:'RECOMMEND_REORDER'});
    return executions.flatMap(execution => {
      const output = asRecord(execution.toolCalls[0]?.result);
      const items = output.recommendations;
      if (!Array.isArray(items)) return [];
      return items.map(item => ({...asRecord(item), logId: execution.id,
        executionId: execution.id, createdAt: execution.startedAt,
        fallbackUsed: execution.fallbackUsed, errorMessage: execution.errorMessage,
        createdBy: execution.triggeredByUser?.name ?? null}));
    });
  },

  async createPurchaseRequestFromRecommendation(logId: string, userId: string, ingredientId?: string) {
    const actor = await requireAgentUser(userId);
    const execution = await agentRepository.findRecommendationExecution(logId);
    if (!execution) throw new AgentHttpError(404, 'Recommendation execution not found.');
    if (execution.intent !== 'RECOMMEND_REORDER') throw new AgentHttpError(400, 'Invalid execution intent.');
    const output = asRecord(execution.toolCalls[0]?.result);
    const candidates = Array.isArray(output.recommendations) ? output.recommendations.map(asRecord) : [];
    if (candidates.length > 1 && !ingredientId) {
      throw new AgentHttpError(400, 'Specify ingredientId when the recommendation contains multiple ingredients.');
    }
    const item = ingredientId ? candidates.find(c=>c.ingredientId === ingredientId) : candidates[0];
    if (!item) throw new AgentHttpError(400, 'Recommendation ingredient not found.');
    const selectedIngredient = str(item.ingredientId);
    const supplierId = str(item.recommendedSupplierId);
    if (!selectedIngredient || !supplierId) throw new AgentHttpError(400, 'Recommendation data is incomplete.');
    try {
      return await agentRepository.createPurchaseRequestFromRecommendation({
        executionId: logId, ingredientId: selectedIngredient, supplierId,
        recommendedQuantity: n(item.recommendedQuantity), reasoning: str(item.reasoning),
        emailDraft: str(item.emailDraft), userId: actor,
      });
    } catch (error) {
      if (error instanceof Error && error.message === ACTIVE_PURCHASE_REQUEST_MESSAGE)
        throw new AgentHttpError(400, error.message);
      throw error;
    }
  },

  async runScan(triggerType: 'SCHEDULED' | 'MANUAL' = 'SCHEDULED') {
    // Background/system actor is read-only: do not fabricate a User identity.
    requireInternalSecret();
    const ingredients = await agentRepository.findIngredients();
    const lowStockIngredientIds = ingredients.filter(i => available(i) <= Number(i.minThreshold)).map(i=>i.id);
    const summary = {principal:'system', triggerType, mode:'LOG_ONLY', totalChecked:ingredients.length,
      lowStockIngredientIds, purchaseWritesBlocked:true};
    await createLegacyCompatibleLog({action:'SCAN_INVENTORY', result:'SUCCESS', input:{triggerType}, output:summary});
    return summary;
  },

  async createLog(data: LegacyLogInput) {
    return createLegacyCompatibleLog(data);
  },
};
