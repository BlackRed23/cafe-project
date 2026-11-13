import { agentRepository, type AgentIngredientRecord, type AgentSupplierIngredient } from '../repositories/agent.repository';
import { geminiService } from './model.service';
import { SYSTEM_PROMPT_TEMPLATE } from '../config/system-prompt';
import { requireAgentUser } from '../internal-auth';
import { ExecutionStatus, ToolCallStatus, prisma } from '@cafe-project/database';

type ReorderPlanningPeriod = 'WEEKLY' | 'MONTHLY' | 'CUSTOM';
type SupplierOption = AgentSupplierIngredient;
export type RecommendationPayload = {
  productId: string; productName: string; sku: string;
  ingredientId: string; ingredientName: string; baseUnit: string;
  currentQuantity: number; minThreshold: number;
  salesVelocity7d: number; salesVelocity30d: number;
  recommendedQuantity: number; recommendedSupplierId: string;
  recommendedSupplierName: string; confidence: number;
  reasoning: string; emailDraft: string; fallbackUsed: boolean;
};

const positiveDays = (value: string | null) => {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};
const supplierActive = (s: SupplierOption) => s.supplier.status === 'ACTIVE' && s.supplier.deletedAt === null;
const roundPurchaseQuantity = (qty: number, link: SupplierOption, baseUnit: string): number => {
  const factor = Number(link.conversionQuantity);
  if (!(factor > 0) || link.conversionTargetUnit !== baseUnit) {
    // A missing conversion is unsafe: refuse rather than guess a purchase pack size.
    throw new Error(`Không có quy đổi hợp lệ cho nguyên liệu ${link.ingredientId}.`);
  }
  return Math.ceil(Math.max(link.minOrderQuantity, Math.ceil(qty / factor)) * factor);
};

export const recommendationService = {
  async getSalesData(productId: string) { return agentRepository.getSalesData(productId); },

  async getPlanningSettings() {
    const [period, custom] = await Promise.all([
      agentRepository.getSettingValue('inventory.reorderPlanningPeriod'),
      agentRepository.getSettingValue('inventory.reorderPlanningCustomDays'),
    ]);
    const reorderPlanningPeriod: ReorderPlanningPeriod = period === 'MONTHLY' || period === 'CUSTOM' ? period : 'WEEKLY';
    return {
      reorderPlanningPeriod,
      reorderPlanningDays: reorderPlanningPeriod === 'MONTHLY' ? 30 : reorderPlanningPeriod === 'CUSTOM' ? (positiveDays(custom) ?? 14) : 7,
    };
  },

  /** Product sales are projected through an active recipe into each ingredient. */
  async generateForProduct(productId: string, force = false, userId: string) {
    const actor = await requireAgentUser(userId);
    const requirements = await agentRepository.getProductIngredientRequirements(productId);
    const [sales, settings, ingredients, product] = await Promise.all([
      this.getSalesData(productId), this.getPlanningSettings(),
      agentRepository.findIngredients(requirements.map(r => r.ingredientId)),
      prisma.product.findUnique({ where: { id: productId }, select: { name: true, sku: true } }),
    ]);
    const ingredientById = new Map(ingredients.map(ingredient => [ingredient.id, ingredient]));
    const execution = await agentRepository.createExecution({
      goal: `RECOMMEND_REORDER product=${productId}`,
      intent: 'RECOMMEND_REORDER', status: ExecutionStatus.RUNNING,
      triggeredByUser: { connect: { id: actor } },
    });
    const recommendations: RecommendationPayload[] = [];
    const skippedIngredients: Array<{ ingredientId: string; reason: string }> = [];
    let fallbackUsed = false;
    try {
      for (const requirement of requirements) {
        const ingredient = ingredientById.get(requirement.ingredientId);
        if (!ingredient) { skippedIngredients.push({ ingredientId: requirement.ingredientId, reason: 'INGREDIENT_INACTIVE' }); continue; }
        const available = Number(ingredient.quantity) - Number(ingredient.reserved);
        const perServing = Number(requirement.quantityBasePerServing);
        const velocity7 = sales.salesVelocity7d * perServing;
        const velocity30 = sales.salesVelocity30d * perServing;
        const velocity = Math.max(velocity7, velocity30, 0);
        const suppliers = ingredient.supplierLinks.filter(supplierActive);
        const preferred = suppliers.sort((a,b) => Number(b.isPreferred) - Number(a.isPreferred) || Number(a.pricePerBaseUnit) - Number(b.pricePerBaseUnit) || a.leadTimeDays - b.leadTimeDays);
        const leadTime = preferred[0]?.leadTimeDays ?? 3;
        const threshold = Math.max(Number(ingredient.minThreshold), velocity * (leadTime + 2));
        if (!force && available > threshold) { skippedIngredients.push({ ingredientId: ingredient.id, reason: 'ABOVE_THRESHOLD' }); continue; }
        if (await agentRepository.hasOpenPurchaseRequest(ingredient.id)) { skippedIngredients.push({ ingredientId: ingredient.id, reason: 'ACTIVE_PR_EXISTS' }); continue; }
        if (!preferred.length) { skippedIngredients.push({ ingredientId: ingredient.id, reason: 'NO_ACTIVE_SUPPLIER' }); continue; }
        const minimum = Math.max(1, Math.ceil(velocity * (settings.reorderPlanningDays + leadTime + 2) - available), Math.ceil(Number(ingredient.minThreshold) - available));
        let chosen = preferred[0];
        let confidence = 0.6;
        let reason = `Tồn khả dụng ${available} ${ingredient.baseUnit}; nhu cầu dự kiến ${velocity.toFixed(3)} ${ingredient.baseUnit}/ngày, kế hoạch ${settings.reorderPlanningDays} ngày.`;
        let emailDraft = '';
        try {
          const prompt = `${String(SYSTEM_PROMPT_TEMPLATE)}\nSản phẩm: ${productId}\nNguyên liệu: ${ingredient.name} (${ingredient.id})\nĐơn vị: ${ingredient.baseUnit}\nTồn khả dụng: ${available}\nNhu cầu một phần: ${perServing}\nTốc độ bán: ${sales.salesVelocity30d} phần/ngày\nSố lượng cần nhập tối thiểu: ${minimum}\nNhà cung cấp hợp lệ: ${preferred.map(s=>`${s.supplierId} giá ${s.pricePerBaseUnit}/${ingredient.baseUnit}`).join('; ')}\nChỉ trả về JSON theo hợp đồng của model service.`;
          const suggested = await geminiService.getRecommendation(prompt);
          const selected = preferred.find(s=>s.supplierId === suggested.recommendedSupplierId);
          if (!selected) throw new Error('Nhà cung cấp do model đề xuất không hợp lệ.');
          chosen = selected;
          confidence = suggested.confidence;
          reason = suggested.reasoning;
          emailDraft = suggested.emailDraft;
          // Never let the model understate the deterministic replenishment minimum.
          if (suggested.recommendedQuantity > minimum) reason += ` Model đề xuất ${suggested.recommendedQuantity} ${ingredient.baseUnit}.`;
        } catch {
          fallbackUsed = true;
          reason += ' Rule-based fallback: lựa chọn nhà cung cấp có giá hợp lệ và ưu tiên cao.';
        }
        let qty: number;
        try { qty = roundPurchaseQuantity(minimum, chosen, ingredient.baseUnit); }
        catch { skippedIngredients.push({ingredientId: ingredient.id, reason:'INVALID_UNIT_CONVERSION'}); continue; }
        recommendations.push({
          productId, productName: product?.name ?? productId, sku: product?.sku ?? '',
          ingredientId: ingredient.id, ingredientName: ingredient.name, baseUnit: ingredient.baseUnit,
          currentQuantity: available, minThreshold: Number(ingredient.minThreshold),
          salesVelocity7d: velocity7, salesVelocity30d: velocity30,
          recommendedQuantity: qty, recommendedSupplierId: chosen.supplierId,
          recommendedSupplierName: chosen.supplier.name, confidence, reasoning: reason,
          emailDraft, fallbackUsed,
        });
      }
      await agentRepository.createToolCall({
        executionId: execution.id, stepNo: 1, toolName: 'recommendIngredientsForProduct',
        arguments: { productId, force }, result: { recommendations, skippedIngredients },
        status: ToolCallStatus.SUCCEEDED,
      });
      await agentRepository.updateExecution(execution.id, { status: ExecutionStatus.SUCCEEDED, endedAt: new Date(), fallbackUsed });
      return {
        logId: execution.id, executionId: execution.id,
        skipped: recommendations.length === 0,
        reason: recommendations.length ? undefined : skippedIngredients[0]?.reason ?? 'NO_INGREDIENTS',
        skippedProduct: recommendations.length ? undefined : {productId, productName: product?.name ?? productId, sku:product?.sku ?? '', reasonCode: skippedIngredients[0]?.reason ?? 'NO_INGREDIENTS'},
        recommendation: recommendations[0], recommendations, skippedIngredients,
      };
    } catch (error) {
      await agentRepository.markExecutionFailed(execution.id, error instanceof Error ? error.message : 'Unknown recommendation error');
      throw error;
    }
  },

  /** Rule-based calculations must receive ingredients and velocity in BASE units. */
  calculateRuleBased(
    ingredient: AgentIngredientRecord,
    sales: { salesVelocity7d: number; salesVelocity30d: number },
    suppliers: SupplierOption[],
    planningSettings: { reorderPlanningPeriod: ReorderPlanningPeriod; reorderPlanningDays: number },
  ) {
    const selected = suppliers.filter(supplierActive).sort((a,b)=>Number(b.isPreferred)-Number(a.isPreferred)||Number(a.pricePerBaseUnit)-Number(b.pricePerBaseUnit))[0];
    if (!selected) throw new Error('Không có nhà cung cấp hợp lệ.');
    const daily = Math.max(sales.salesVelocity7d, sales.salesVelocity30d, 0);
    const available = Number(ingredient.quantity) - Number(ingredient.reserved);
    const target = Math.max(Number(ingredient.minThreshold), daily * (planningSettings.reorderPlanningDays + selected.leadTimeDays + 2));
    const minimum = Math.max(1, target - available);
    const qty = roundPurchaseQuantity(minimum, selected, ingredient.baseUnit);
    return { recommendedQuantity: qty, supplier: selected,
      reasoning: `Nguyên liệu ${ingredient.name}: tồn khả dụng ${available} ${ingredient.baseUnit}; mục tiêu ${target.toFixed(3)} ${ingredient.baseUnit}.`,
      quantityDisplay: { recommendedQtyDisplay: `${qty} ${ingredient.baseUnit}`, convertedQuantity: qty, inventoryUnit: ingredient.baseUnit },
    };
  },
};
