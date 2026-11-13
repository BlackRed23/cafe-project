
import { requireAgentUser } from '../internal-auth';
import {
  prisma,
  PurchaseRequestStatus,
  OrderStatus,
  ExecutionStatus,
  ToolCallStatus,
  Prisma,
} from '@cafe-project/database';

export const ACTIVE_PURCHASE_REQUEST_MESSAGE =
  'Nguyên liệu này đã có yêu cầu nhập hàng đang xử lý.';
export const ACTIVE_PURCHASE_REQUEST_STATUSES = [
  PurchaseRequestStatus.PENDING,
  PurchaseRequestStatus.APPROVED,
  PurchaseRequestStatus.SENT,
  PurchaseRequestStatus.RECEIVED,
] as const;

const ingredientInclude = {
  category: true,
  supplierLinks: {
    include: { supplier: true },
    orderBy: [
      { isPreferred: 'desc' },
      { pricePerBaseUnit: 'asc' },
      { leadTimeDays: 'asc' },
    ],
  },
  batches: true,
} satisfies Prisma.IngredientInclude;

const executionInclude = {
  triggeredByUser: {
    select: { id: true, name: true, email: true },
  },
  toolCalls: { orderBy: { stepNo: 'asc' } },
  purchaseRequests: { select: { id: true, status: true, requestNumber: true } },
} satisfies Prisma.AgentExecutionInclude;

export type AgentIngredientRecord = Prisma.IngredientGetPayload<{
  include: typeof ingredientInclude;
}>;
/** @deprecated Use AgentIngredientRecord. */
export type AgentInventoryRecord = AgentIngredientRecord;
export type AgentSupplierIngredient = AgentIngredientRecord['supplierLinks'][number];

const amount = (value: Prisma.Decimal | number): number => Number(value);

function assertPositiveNumber(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} phải là số dương hữu hạn.`);
  }
}

function assertPositiveSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 2147483647) {
    throw new Error(`${label} phải là số nguyên dương trong giới hạn Int của Prisma.`);
  }
}

function assertMatchingSupplier(
  ingredient: AgentIngredientRecord,
  link: AgentSupplierIngredient,
): void {
  if (link.ingredientId !== ingredient.id) {
    throw new Error('Nhà cung cấp không khớp nguyên liệu.');
  }
  if (link.supplier.status !== 'ACTIVE' || link.supplier.deletedAt !== null) {
    throw new Error('Nhà cung cấp không còn hoạt động.');
  }
}

/**
 * quantity is requested in ingredient.baseUnit; persisted purchase quantity is
 * whole base units because PurchaseRequestItem.quantity is Int in this schema.
 * A supplier conversion is used only when its target unit matches baseUnit.
 */
export function convertRecommendedQuantity(
  ingredient: AgentIngredientRecord,
  supplierIngredient: AgentSupplierIngredient,
  quantity: number,
): { quantity: number; unitPrice: Prisma.Decimal; totalAmount: Prisma.Decimal; note: string } {
  assertPositiveNumber(quantity, 'Số lượng đề xuất');
  assertMatchingSupplier(ingredient, supplierIngredient);

  const factor = amount(supplierIngredient.conversionQuantity);
  const matchesBaseUnit =
    supplierIngredient.conversionTargetUnit === ingredient.baseUnit &&
    Number.isFinite(factor) && factor > 0;
  const minimum = Math.max(1, supplierIngredient.minOrderQuantity);

  let adjusted: number;
  let conversionNote: string;
  if (matchesBaseUnit) {
    const packs = Math.max(minimum, Math.ceil(quantity / factor));
    assertPositiveSafeInteger(packs, 'Số đơn vị mua');
    adjusted = Math.ceil(packs * factor);
    conversionNote = `Quy cách: 1 ${supplierIngredient.purchaseUnit} = ${factor} ${ingredient.baseUnit}. Đặt tối thiểu ${packs} ${supplierIngredient.purchaseUnit}.`;
  } else {
    // Do not pretend to convert between unrelated units.
    // For non-matching units, only use whole base units, never a guessed ratio.
    adjusted = Math.ceil(quantity);
    conversionNote = 'Không có quy đổi đơn vị khớp với baseUnit; đề xuất theo đơn vị gốc nguyên.';
  }
  assertPositiveSafeInteger(adjusted, 'Số lượng nhập theo đơn vị gốc');
  const unitPrice = new Prisma.Decimal(supplierIngredient.pricePerBaseUnit);
  if (unitPrice.isNegative()) throw new Error('Đơn giá nguyên liệu không hợp lệ.');
  if (!unitPrice.equals(unitPrice.toDecimalPlaces(2))) {
    throw new Error('PurchaseRequestItem.unitPrice chỉ lưu 2 chữ số thập phân; không thể lưu chính xác pricePerBaseUnit của nhà cung cấp.');
  }
  const totalAmount = unitPrice.mul(adjusted).toDecimalPlaces(2);
  if (totalAmount.greaterThan('9999999999.99')) {
    throw new Error('Tổng tiền vượt giới hạn Decimal(12,2).');
  }
  return {
    quantity: adjusted,
    unitPrice: unitPrice.toDecimalPlaces(2),
    totalAmount,
    note: `Nguyên liệu ${ingredient.name}: tồn ${ingredient.quantity} ${ingredient.baseUnit}, đã giữ ${ingredient.reserved} ${ingredient.baseUnit}. Cần bổ sung ${quantity} ${ingredient.baseUnit}; đề xuất nhập ${adjusted} ${ingredient.baseUnit}. ${conversionNote}`,
  };
}

export const serializeAgentLogField = (value: unknown): string | null => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch { return String(value); }
};

function jsonValue(value: unknown): Prisma.InputJsonValue {
  if (value === undefined) return {};
  if (value === null) return {}; // Prisma JSON null is not a JSON input object.
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function makeRequestNumber(prefix: string): string {
  const nonce = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `${prefix}-${Date.now()}-${nonce}`;
}

export type CreateRecommendationPurchaseRequest = {
  executionId: string;
  ingredientId: string;
  supplierId: string;
  recommendedQuantity: number; // base units, not product count
  reasoning?: string | null;
  emailDraft?: string | null;
  userId: string;
};

export const agentRepository = {
  /** List active ingredients. The optional IDs are ingredient IDs. */
  async findIngredients(ingredientIds?: string[]): Promise<AgentIngredientRecord[]> {
    return prisma.ingredient.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        ...(ingredientIds?.length ? { id: { in: ingredientIds } } : {}),
      },
      include: ingredientInclude,
    });
  },

  /** Compatibility name only: this returns ingredients, NOT Product inventory. */
  async findInventories(ingredientIds?: string[]): Promise<AgentIngredientRecord[]> {
    return agentRepository.findIngredients(ingredientIds);
  },

  async hasOpenPurchaseRequest(ingredientId: string): Promise<boolean> {
    const item = await prisma.purchaseRequestItem.findFirst({
      where: {
        ingredientId,
        request: { status: { in: [...ACTIVE_PURCHASE_REQUEST_STATUSES] } },
      },
      select: { id: true },
    });
    return Boolean(item);
  },

  async findOpenPurchaseRequest(ingredientId: string) {
    const item = await prisma.purchaseRequestItem.findFirst({
      where: {
        ingredientId,
        request: { status: { in: [...ACTIVE_PURCHASE_REQUEST_STATUSES] } },
      },
      select: {
        request: {
          select: {
            id: true,
            status: true,
            supplier: {
              select: { id: true, name: true, status: true, deletedAt: true },
            },
          },
        },
      },
    });
    return item?.request ?? null;
  },

  /** Product sales metrics remain product-based, unlike purchasing. */
  async getSalesData(productId: string) {
    const now = Date.now();
    const from7d = new Date(now - 7 * 86400000);
    const from30d = new Date(now - 30 * 86400000);
    const [recent7d, recent30d] = await Promise.all([
      prisma.orderItem.aggregate({
        where: {
          productId,
          order: { status: { not: OrderStatus.CANCELLED }, createdAt: { gte: from7d } },
        },
        _sum: { quantity: true },
      }),
      prisma.orderItem.aggregate({
        where: {
          productId,
          order: { status: { not: OrderStatus.CANCELLED }, createdAt: { gte: from30d } },
        },
        _sum: { quantity: true },
      }),
    ]);
    const totalSold7d = recent7d._sum.quantity ?? 0;
    const totalSold30d = recent30d._sum.quantity ?? 0;
    return {
      totalSold7d,
      totalSold30d,
      salesVelocity7d: totalSold7d / 7,
      salesVelocity30d: totalSold30d / 30,
    };
  },

  /** Map a PRODUCT to per-serving ingredient requirements through its active recipe. */
  async getProductIngredientRequirements(productId: string) {
    const recipe = await prisma.recipe.findFirst({
      where: { productId, isActive: true },
      orderBy: { version: 'desc' },
      include: { ingredients: { include: { ingredient: true } } },
    });
    if (!recipe) throw new Error(`Không tìm thấy công thức đang hoạt động của sản phẩm ${productId}.`);
    if (amount(recipe.yieldQuantity) <= 0) throw new Error('Recipe.yieldQuantity phải lớn hơn 0.');
    return recipe.ingredients
      .filter((line) => !line.isOptional)
      .map((line) => ({
        ingredientId: line.ingredientId,
        ingredient: line.ingredient,
        quantityBasePerServing: line.quantityBase.div(recipe.yieldQuantity),
        recipeId: recipe.id,
        recipeVersion: recipe.version,
      }));
  },

  async getSettingValue(key: string): Promise<string | null> {
    const setting = await prisma.systemSetting.findUnique({
      where: { key }, select: { value: true },
    });
    return setting?.value ?? null;
  },

  /**
   * Create a pending purchase request for a single INGREDIENT.
   * Requires a real authenticated user and optionally a preexisting execution ID.
   * Does not receive stock or write inventory transactions.
   */
  async createAiPurchaseRequest(
    ingredient: AgentIngredientRecord,
    supplierIngredient: AgentSupplierIngredient,
    quantity: number,
    reasoning: string,
    userId?: string,
    emailDraft?: string,
    executionId?: string,
  ) {
    const requesterId = await requireAgentUser(userId);
    const converted = convertRecommendedQuantity(ingredient, supplierIngredient, quantity);
    const supplierId = supplierIngredient.supplierId;
    const ingredientId = ingredient.id;
    return prisma.$transaction(async (tx) => {
      const freshIngredient = await tx.ingredient.findUnique({
        where: { id: ingredientId }, select: { isActive: true, deletedAt: true },
      });
      if (!freshIngredient?.isActive || freshIngredient.deletedAt) {
        throw new Error('Nguyên liệu không còn hoạt động.');
      }
      const activeItem = await tx.purchaseRequestItem.findFirst({
        where: {
          ingredientId,
          request: { status: { in: [...ACTIVE_PURCHASE_REQUEST_STATUSES] } },
        },
        select: { id: true },
      });
      if (activeItem) throw new Error(ACTIVE_PURCHASE_REQUEST_MESSAGE);
      // Never create a request on behalf of an absent execution.
      if (executionId) {
        const execution = await tx.agentExecution.findUnique({
          where: { id: executionId }, select: { id: true },
        });
        if (!execution) throw new Error('AgentExecution không tồn tại.');
      }
      return tx.purchaseRequest.create({
        data: {
          requestNumber: makeRequestNumber('AI-PR'),
          status: PurchaseRequestStatus.PENDING,
          supplierId,
          requestedBy: requesterId,
          aiGenerated: true,
          ...(executionId ? { agentExecutionId: executionId } : {}),
          notes: `${reasoning.trim()}\n\n${converted.note}`.trim(),
          emailContent: emailDraft ?? null,
          totalAmount: converted.totalAmount,
          items: {
            create: {
              ingredientId,
              quantity: converted.quantity,
              unitPrice: converted.unitPrice,
              notes: converted.note,
            },
          },
        },
        include: {
          supplier: true,
          items: { include: { ingredient: true } },
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  },

  /** Convert an ingredient recommendation to PR; executionId replaces legacy logId. */
  async createPurchaseRequestFromRecommendation(data: CreateRecommendationPurchaseRequest) {
    const requesterId = await requireAgentUser(data.userId);
    const ingredient = await prisma.ingredient.findUnique({
      where: { id: data.ingredientId },
      include: ingredientInclude,
    });
    if (!ingredient || !ingredient.isActive || ingredient.deletedAt) {
      throw new Error('Không tìm thấy nguyên liệu đang hoạt động.');
    }
    const supplierIngredient = ingredient.supplierLinks.find(
      (item) => item.supplierId === data.supplierId,
    );
    if (!supplierIngredient) throw new Error('Nhà cung cấp không bán nguyên liệu này.');
    return agentRepository.createAiPurchaseRequest(
      ingredient,
      supplierIngredient,
      data.recommendedQuantity,
      data.reasoning ?? '',
      requesterId,
      data.emailDraft ?? undefined,
      data.executionId,
    );
  },

  /** AgentExecution replaces free-form AgentLog. */
  async createExecution(data: Prisma.AgentExecutionCreateInput) {
    return prisma.agentExecution.create({ data, include: executionInclude });
  },

  async findExecutions(where: Prisma.AgentExecutionWhereInput = {}) {
    return prisma.agentExecution.findMany({
      where, include: executionInclude,
      orderBy: { startedAt: 'desc' },
      take: 1000,
    });
  },

  async updateExecution(id: string, data: Prisma.AgentExecutionUpdateInput) {
    return prisma.agentExecution.update({
      where: { id }, data, include: executionInclude,
    });
  },

  async findRecommendationExecution(executionId: string) {
    return prisma.agentExecution.findUnique({
      where: { id: executionId }, include: executionInclude,
    });
  },

  async createToolCall(data: {
    executionId: string;
    stepNo: number;
    toolName: string;
    arguments: unknown;
    result?: unknown;
    status?: ToolCallStatus;
    errorMessage?: string | null;
    latencyMs?: number | null;
  }) {
    assertPositiveSafeInteger(data.stepNo, 'stepNo');
    return prisma.agentToolCall.create({
      data: {
        executionId: data.executionId,
        stepNo: data.stepNo,
        toolName: data.toolName,
        arguments: jsonValue(data.arguments),
        ...(data.result === undefined ? {} : { result: jsonValue(data.result) }),
        status: data.status ?? ToolCallStatus.PENDING,
        errorMessage: data.errorMessage ?? null,
        latencyMs: data.latencyMs ?? null,
      },
    });
  },

  async updateToolCall(id: string, data: Prisma.AgentToolCallUpdateInput) {
    return prisma.agentToolCall.update({ where: { id }, data });
  },

  async markExecutionSucceeded(executionId: string) {
    return agentRepository.updateExecution(executionId, {
      status: ExecutionStatus.SUCCEEDED,
      endedAt: new Date(),
    });
  },

  async markExecutionFailed(executionId: string, errorMessage: string) {
    return agentRepository.updateExecution(executionId, {
      status: ExecutionStatus.FAILED,
      endedAt: new Date(),
      errorMessage,
    });
  },

  async findActiveProductIds(): Promise<string[]> {
    const products = await prisma.product.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true },
    });
    return products.map((product) => product.id);
  },
};
