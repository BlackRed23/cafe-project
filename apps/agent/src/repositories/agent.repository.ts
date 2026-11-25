import { submitPurchaseProposal } from '../services/purchase-proposal.client';
import { createHash } from 'node:crypto';
import { requireAgentUser } from '../internal-auth';
import { prisma, PurchaseRequestStatus, OrderStatus, InventoryTransactionType, Prisma } from '@cafe-project/database';
import { fixAgentLogDisplayOutputJson, fixVietnameseMojibakeText } from '../utils/textEncoding';

export const ACTIVE_PURCHASE_REQUEST_MESSAGE = 'Sản phẩm này đã có yêu cầu nhập hàng đang xử lý.';
export const ACTIVE_PURCHASE_REQUEST_STATUSES = [
    PurchaseRequestStatus.PENDING,
    PurchaseRequestStatus.APPROVED,
    PurchaseRequestStatus.SENT
] as const;

const inventoryInclude = {
    product: {
        include: {
            category: true,
            supplierProducts: {
                include: { supplier: true },
                orderBy: [{ isPreferred: 'desc' }, { price: 'asc' }, { leadTimeDays: 'asc' }]
            }
        }
    },
    batches: true
} satisfies Prisma.InventoryInclude;

const ingredientScanInclude = {
    category: true,
    batches: {
        orderBy: [{ expirationDate: 'asc' }, { receivedAt: 'asc' }]
    },
    supplierLinks: {
        include: { supplier: true },
        orderBy: [{ isPreferred: 'desc' }, { pricePerBaseUnit: 'asc' }, { leadTimeDays: 'asc' }]
    },
    recipeItems: {
        where: { recipe: { isActive: true } },
        include: {
            recipe: {
                include: {
                    product: { select: { id: true, name: true, sku: true, isActive: true } }
                }
            }
        }
    }
} satisfies Prisma.IngredientInclude;

const logInclude = {
    creator: {
        select: {
            id: true,
            name: true,
            email: true
        }
    }
} satisfies Prisma.AgentLogInclude;

export type AgentInventoryRecord = Prisma.InventoryGetPayload<{ include: typeof inventoryInclude }>;
export type AgentIngredientRecord = Prisma.IngredientGetPayload<{ include: typeof ingredientScanInclude }>;

const convertRecommendedQuantity = (
    inventory: AgentInventoryRecord,
    supplierProduct: AgentInventoryRecord['product']['supplierProducts'][number],
    quantity: number
) => {
    const purchaseUnit = supplierProduct.purchaseUnit;
    const conversionQuantity = supplierProduct.conversionQuantity;
    const conversionTargetUnit = supplierProduct.conversionTargetUnit;

    if (!purchaseUnit || !conversionQuantity || !conversionTargetUnit || conversionTargetUnit !== inventory.unit) {
        return {
            quantity,
            note: `Sản phẩm ${inventory.product.name} hiện còn ${inventory.quantity} ${inventory.unit}, thấp hơn hoặc bằng ngưỡng tồn kho cần bổ sung.

Hệ thống đề xuất nhập thêm ${quantity} ${inventory.unit} để đưa tồn kho về mức an toàn.

Sản phẩm này chưa có quy cách nhập hàng theo nhà cung cấp, nên số lượng đề xuất đang được hiển thị theo đơn vị tồn kho.`
        };
    }

    const purchaseQuantity = Math.ceil(quantity / conversionQuantity);
    const convertedQuantity = Math.ceil(purchaseQuantity * conversionQuantity);

    return {
        quantity: convertedQuantity,
        note: `Nhu cầu bổ sung tối thiểu là ${quantity} ${inventory.unit}. Theo quy cách nhập hàng của nhà cung cấp: 1 ${purchaseUnit} = ${conversionQuantity} ${conversionTargetUnit}.

Vì vậy hệ thống làm tròn theo quy cách nhập hàng và đề xuất nhập ${purchaseQuantity} ${purchaseUnit} = ${convertedQuantity} ${inventory.unit} để đảm bảo đủ hàng và đúng quy cách nhập.`
    };
};

const safeJsonParse = (value: unknown): Record<string, unknown> | null => {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
        const parsed: unknown = JSON.parse(value);
        return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
    } catch {
        return null;
    }
};

export const serializeAgentLogField = (value: unknown): string | null => {
    if (value === undefined || value === null) return null;
    if (typeof value === "string") return value;

    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
};

const asString = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim() ? value.trim() : undefined;

/**
 * Two cron workers may fire the same scheduled minute. Use PostgreSQL time,
 * never a worker's local clock, for a stable, durable AgentLog identity.
 * This deduplicates the read-only SCAN_INVENTORY audit effect only; it is NOT
 * a production graph checkpoint or permission to create purchases.
 */
const scheduledScanLogId = async (data: Prisma.AgentLogCreateInput): Promise<string | null> => {
    if (data.action !== 'SCAN_INVENTORY' || data.result !== 'SUCCESS') return null;
    const input = safeJsonParse(data.input);
    if (input?.triggerType !== 'SCHEDULED' || input?.mode !== 'LOG_ONLY' || input?.principal !== 'system') return null;

    const [slot] = await prisma.$queryRaw<Array<{ tick: Date }>>
        `SELECT date_trunc('minute', clock_timestamp()) AS "tick"`;
    if (!(slot?.tick instanceof Date) || !Number.isFinite(slot.tick.getTime())) {
        throw new Error('SCHEDULE_SCAN_CLOCK_UNVERIFIED');
    }
    const bytes = createHash('sha256').update('cafe:scheduled-inventory-scan:v1:' + slot.tick.toISOString()).digest();
    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
    bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
    const hex = bytes.subarray(0, 16).toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
};

const findDuplicateSimulationLog = async (data: Prisma.AgentLogCreateInput) => {
    const input = safeJsonParse(data.input);
    const output = safeJsonParse(data.output);
    const triggerType = asString(input?.triggerType);
    const sourceType = asString(input?.sourceType);
    const sourceId = asString(input?.sourceId);
    const productId = asString(input?.productId) || asString(output?.productId);
    const reason = asString(output?.reason);
    const result = asString(data.result);
    const action = asString(data.action);

    if (!sourceId || !productId || !action || !result) return null;
    if (triggerType !== 'SIMULATE_SALE' && sourceType !== 'SIMULATE_SALE') return null;

    const and: Prisma.AgentLogWhereInput[] = [
        { action },
        { result },
        { input: { contains: sourceId } },
        { input: { contains: productId } }
    ];

    if (reason) {
        and.push({ output: { contains: reason } });
    }

    return prisma.agentLog.findFirst({
        where: { AND: and },
        include: logInclude,
        orderBy: { triggered_at: 'asc' }
    });
};

export const agentRepository = {
    async findInventories(productIds?: string[]): Promise<AgentInventoryRecord[]> {
        return prisma.inventory.findMany({
            where: {
                ...(productIds?.length ? { productId: { in: productIds } } : {}),
                product: { isActive: true }
            },
            include: inventoryInclude
        });
    },

    async hasOpenPurchaseRequest(productId: string, inventoryId: string): Promise<boolean> {
        const item = await prisma.purchaseRequestItem.findFirst({
            where: {
                productId,
                inventoryId,
                request: { status: { in: [...ACTIVE_PURCHASE_REQUEST_STATUSES] } }
            },
            select: { id: true }
        });
        return Boolean(item);
    },

    async findOpenPurchaseRequest(productId: string, inventoryId: string): Promise<{ id: string, status: string, supplier: { id: string, name: string, status: string, deletedAt: Date | null } | null } | null> {
        const item = await prisma.purchaseRequestItem.findFirst({
            where: {
                productId,
                inventoryId,
                request: { status: { in: [...ACTIVE_PURCHASE_REQUEST_STATUSES] } }
            },
            select: {
                request: {
                    select: { 
                        id: true,
                        status: true,
                        supplier: {
                            select: {
                                id: true,
                                name: true,
                                status: true,
                                deletedAt: true
                            }
                        }
                    }
                }
            }
        });
        return item?.request ?? null;
    },

    async getSalesData(productId: string) {
        const now = new Date();
        const date7d = new Date();
        date7d.setDate(now.getDate() - 7);
        const date30d = new Date();
        date30d.setDate(now.getDate() - 30);

        const items7d = await prisma.orderItem.findMany({
            where: {
                productId,
                order: {
                    status: { not: OrderStatus.CANCELLED },
                    createdAt: { gte: date7d }
                }
            },
            select: { quantity: true }
        });

        const items30d = await prisma.orderItem.findMany({
            where: {
                productId,
                order: {
                    status: { not: OrderStatus.CANCELLED },
                    createdAt: { gte: date30d }
                }
            },
            select: { quantity: true }
        });

        const totalSold7d = items7d.reduce((sum: number, item: { quantity: number }) => sum + item.quantity, 0);
        const totalSold30d = items30d.reduce((sum: number, item: { quantity: number }) => sum + item.quantity, 0);

        return {
            totalSold7d,
            totalSold30d,
            salesVelocity7d: totalSold7d / 7,
            salesVelocity30d: totalSold30d / 30
        };
    },

    async getSettingValue(key: string): Promise<string | null> {
        const setting = await prisma.systemSetting.findUnique({
            where: { key },
            select: { value: true }
        });
        return setting?.value ?? null;
    },

    async proposeInventoryPurchase(
        inventory: AgentInventoryRecord,
        supplierProduct: AgentInventoryRecord['product']['supplierProducts'][number],
        quantity: number, reasoning: string, userId?: string, emailDraft?: string
    ) {
        await requireAgentUser(userId);
        const converted = convertRecommendedQuantity(inventory, supplierProduct, quantity);
        return submitPurchaseProposal({ supplierId: supplierProduct.supplierId, inventoryId: inventory.id,
            quantity: converted.quantity, unit: inventory.unit, baseUnit: inventory.unit, unitsPerPack: '1',
            unitPrice: new Prisma.Decimal(supplierProduct.price).toFixed(2),
            notes: reasoning.trim() + '\n\n' + converted.note, emailContent: emailDraft ?? null });
    },

    async proposeFromRecommendation(data: {
        logId: string; productId?: string; ingredientId?: string; supplierId: string;
        recommendedQuantity: number; reasoning?: string | null; emailDraft?: string | null; userId: string;
    }) {
        await requireAgentUser(data.userId);
        if (data.ingredientId) {
            const ingredient = await prisma.ingredient.findUnique({ where: { id: data.ingredientId } });
            const link = await prisma.supplierIngredient.findUnique({ where: { supplierId_ingredientId: { supplierId: data.supplierId, ingredientId: data.ingredientId } } });
            if (!ingredient || !link) throw new Error('Ingredient supplier mapping required.');
            const conversion = new Prisma.Decimal(link.conversionQuantity);
            const packs = Math.max(link.minOrderQuantity, new Prisma.Decimal(data.recommendedQuantity).div(conversion).ceil().toNumber());
            return submitPurchaseProposal({ supplierId: data.supplierId, ingredientId: ingredient.id, quantity: packs,
                unit: link.purchaseUnit, baseUnit: ingredient.baseUnit, unitsPerPack: conversion.toString(),
                unitPrice: new Prisma.Decimal(link.pricePerBaseUnit).mul(conversion).toFixed(2),
                notes: data.reasoning ?? '', emailContent: data.emailDraft ?? null }, 'recommendation-' + data.logId);
        }
        if (!data.productId) throw new Error('Product ID required.');
        const inventory = await prisma.inventory.findUnique({ where: { productId: data.productId }, include: inventoryInclude });
        const link = await prisma.supplierProduct.findUnique({ where: { supplierId_productId: { supplierId: data.supplierId, productId: data.productId } } });
        if (!inventory || !link) throw new Error('Inventory supplier mapping required.');
        const supplierLink = inventory.product.supplierProducts.find(row => row.supplierId === data.supplierId);
        if (!supplierLink) throw new Error('Inventory supplier mapping required.');
        const converted = convertRecommendedQuantity(inventory, supplierLink, data.recommendedQuantity);
        return submitPurchaseProposal({ supplierId: data.supplierId, inventoryId: inventory.id, quantity: converted.quantity,
            unit: inventory.unit, baseUnit: inventory.unit, unitsPerPack: '1', unitPrice: new Prisma.Decimal(link.price).toFixed(2),
            notes: data.reasoning ?? '', emailContent: data.emailDraft ?? null }, 'recommendation-' + data.logId);
    },

    async createLog(data: Prisma.AgentLogCreateInput) {
        const sanitizedData: Prisma.AgentLogCreateInput = {
            ...data,
            input: serializeAgentLogField(data.input),
            output: typeof data.output === 'string' ? fixAgentLogDisplayOutputJson(data.output) : serializeAgentLogField(data.output),
            reasoning: typeof data.reasoning === 'string' ? fixVietnameseMojibakeText(data.reasoning) : data.reasoning,
            error_message: typeof data.error_message === 'string' ? fixVietnameseMojibakeText(data.error_message) : data.error_message
        };
        const duplicate = await findDuplicateSimulationLog(sanitizedData);
        if (duplicate) return duplicate;
        const scheduledId = await scheduledScanLogId(sanitizedData);
        try {
            return await prisma.agentLog.create({
                data: scheduledId ? { ...sanitizedData, id: scheduledId } : sanitizedData,
                include: logInclude
            });
        } catch (error) {
            if (!scheduledId || (error as { code?: string })?.code !== 'P2002') throw error;
            // Primary key is the authoritative unique receipt. Concurrent
            // losers read the committed winner; never create a second log.
            const existing = await prisma.agentLog.findUnique({ where: { id: scheduledId }, include: logInclude });
            if (!existing || existing.action !== sanitizedData.action || existing.input !== sanitizedData.input) {
                throw error;
            }
            return existing;
        }
    },

    async findLogs(where: Prisma.AgentLogWhereInput = {}) {
        return prisma.agentLog.findMany({
            where,
            include: logInclude,
            orderBy: { triggered_at: 'desc' },
            take: 1000
        });
    },

    async updateLog(id: string, data: Prisma.AgentLogUpdateInput) {
        const sanitizedData: Prisma.AgentLogUpdateInput = { ...data };
        if (data.input !== undefined) sanitizedData.input = serializeAgentLogField(data.input);
        if (data.output !== undefined) sanitizedData.output = typeof data.output === 'string' ? fixAgentLogDisplayOutputJson(data.output) : serializeAgentLogField(data.output);

        return prisma.agentLog.update({
            where: { id },
            data: sanitizedData,
            include: logInclude
        });
    },

    async findRecommendationLog(logId: string) {
        return prisma.agentLog.findUnique({
            where: { id: logId }
        });
    },

    async findActiveProductIds() {
        const products = await prisma.product.findMany({
            where: {
                isActive: true,
                inventory: { isNot: null }
            },
            select: { id: true }
        });
        return products.map((product: { id: string }) => product.id);
    },

    // --- Ingredient BOM/FEFO Adapters (TV2 Contract consumed by TV1 Orchestrator) ---
    async findIngredientsForScan(ingredientIds?: string[]): Promise<AgentIngredientRecord[]> {
        if (!prisma.ingredient?.findMany) return [];
        return prisma.ingredient.findMany({
            where: {
                ...(ingredientIds?.length ? { id: { in: ingredientIds } } : {}),
                isActive: true,
                deletedAt: null
            },
            include: ingredientScanInclude
        });
    },

    async findActiveIngredientIds(): Promise<string[]> {
        if (!prisma.ingredient?.findMany) return [];
        const rows = await prisma.ingredient.findMany({
            where: { isActive: true, deletedAt: null },
            select: { id: true }
        });
        return rows.map((r: { id: string }) => r.id);
    },

    async resolveIngredientIdsFromProducts(productIds: string[]): Promise<string[]> {
        if (!productIds?.length || !prisma.recipe?.findMany) return [];
        const recipes = await prisma.recipe.findMany({
            where: {
                productId: { in: productIds },
                isActive: true
            },
            include: {
                ingredients: {
                    select: { ingredientId: true }
                }
            }
        });
        const ids = new Set<string>();
        for (const r of recipes) {
            for (const ri of r.ingredients ?? []) {
                if (ri.ingredientId) ids.add(ri.ingredientId);
            }
        }
        return Array.from(ids);
    },

    /** Fresh read at the recommendation boundary. Inbound POs remain conditional until Supplier proof. */
    async readIngredientSupplyState(ingredientId: string) {
        const ingredient = await prisma.ingredient.findUnique({
            where: { id: ingredientId },
            include: { batches: true }
        });
        if (!ingredient || !ingredient.isActive || ingredient.deletedAt) return null;
        const now = new Date();
        const usableBatches = ingredient.batches.filter(batch =>
            (batch.qualityStatus === 'AVAILABLE') &&
            (!batch.expirationDate || batch.expirationDate.getTime() > now.getTime()) &&
            Number(batch.quantityRemaining) > 0
        );
        const usable = usableBatches.reduce((sum, batch) => sum + Number(batch.quantityRemaining), 0);
        const physical = Number(ingredient.quantity);
        const reserved = Number(ingredient.reserved);
        const available = Math.max(0, Math.min(physical, ingredient.batches.length ? usable : physical) - reserved);
        const rows = await prisma.purchaseOrderItem.findMany({
            where: {
                ingredientId,
                purchaseOrder: { status: { in: ['CONFIRMED', 'PARTIALLY_RECEIVED'] } }
            },
            select: { quantityOrdered: true, quantityReceived: true, conversionToBase: true,
                purchaseOrder: { select: { id: true, status: true, confirmationSource: true } } }
        });
        const inbound = rows.map(row => ({
            purchaseOrderId: row.purchaseOrder.id,
            status: row.purchaseOrder.status,
            confirmationSource: row.purchaseOrder.confirmationSource,
            remainingBase: Math.max(0, row.quantityOrdered - row.quantityReceived) * Number(row.conversionToBase)
        })).filter(row => row.remainingBase > 0);
        const batchesFingerprint = ingredient.batches
            .map(batch => `${batch.id}:${batch.quantityRemaining.toString()}:${batch.qualityStatus}:${batch.updatedAt.toISOString()}`)
            .sort().join('|');
        return { ingredientId, rowVersion: ingredient.rowVersion,
            movementCursor: ingredient.movementCursor.toString(), batchesFingerprint,
            physical, reserved, available, inbound,
            inboundOutstanding: inbound.reduce((sum, row) => sum + row.remainingBase, 0),
            observedAt: now.toISOString() };
    },

    async getIngredientConsumption(ingredientId: string, days = 30) {
        if (!prisma.inventoryTransaction?.findMany) {
            return {
                totalConsumed7d: 0,
                totalConsumed30d: 0,
                dailyConsumption7d: 0,
                dailyConsumption30d: 0
            };
        }
        const now = new Date();
        const date7d = new Date();
        date7d.setDate(now.getDate() - 7);
        const dateNd = new Date();
        dateNd.setDate(now.getDate() - days);

        const consumeTypes = [
            InventoryTransactionType?.CONSUME ?? 'CONSUME',
            InventoryTransactionType?.WASTE ?? 'WASTE',
            InventoryTransactionType?.ORDER ?? 'ORDER'
        ] as InventoryTransactionType[];

        const txns = await prisma.inventoryTransaction.findMany({
            where: {
                ingredientId,
                type: { in: consumeTypes },
                createdAt: { gte: dateNd }
            },
            select: { quantity: true, createdAt: true }
        });

        let totalConsumed7d = 0;
        let totalConsumed30d = 0;
        for (const t of txns) {
            const absQty = Math.abs(Number(t.quantity || 0));
            totalConsumed30d += absQty;
            if (new Date(t.createdAt) >= date7d) {
                totalConsumed7d += absQty;
            }
        }

        return {
            totalConsumed7d,
            totalConsumed30d,
            dailyConsumption7d: totalConsumed7d / 7,
            dailyConsumption30d: totalConsumed30d / Math.max(1, days)
        };
    },

    async hasOpenIngredientPurchaseRequest(ingredientId: string): Promise<boolean> {
        if (!prisma.purchaseRequestItem?.findFirst) return false;
        const item = await prisma.purchaseRequestItem.findFirst({
            where: {
                ingredientId,
                request: { status: { in: [...ACTIVE_PURCHASE_REQUEST_STATUSES] } }
            },
            select: { id: true }
        });
        return Boolean(item);
    },

    async findOpenIngredientPurchaseRequest(ingredientId: string): Promise<{ id: string; status: string; supplier: { id: string; name: string; status: string; deletedAt: Date | null } | null } | null> {
        if (!prisma.purchaseRequestItem?.findFirst) return null;
        const item = await prisma.purchaseRequestItem.findFirst({
            where: {
                ingredientId,
                request: { status: { in: [...ACTIVE_PURCHASE_REQUEST_STATUSES] } }
            },
            select: {
                request: {
                    select: {
                        id: true,
                        status: true,
                        supplier: {
                            select: {
                                id: true,
                                name: true,
                                status: true,
                                deletedAt: true
                            }
                        }
                    }
                }
            }
        });
        return item?.request ?? null;
    },

    async proposeIngredientPurchase(
        ingredient: AgentIngredientRecord,
        supplierIngredient: AgentIngredientRecord['supplierLinks'][number],
        recommendedBaseQty: number, reasoning: string, userId?: string, emailDraft?: string
    ) {
        await requireAgentUser(userId);
        const conversion = new Prisma.Decimal(supplierIngredient.conversionQuantity);
        const packs = Math.max(supplierIngredient.minOrderQuantity, new Prisma.Decimal(recommendedBaseQty).div(conversion).ceil().toNumber());
        return submitPurchaseProposal({ supplierId: supplierIngredient.supplierId, ingredientId: ingredient.id,
            quantity: packs, unit: supplierIngredient.purchaseUnit, baseUnit: ingredient.baseUnit,
            unitsPerPack: conversion.toString(), unitPrice: new Prisma.Decimal(supplierIngredient.pricePerBaseUnit).mul(conversion).toFixed(2),
            notes: reasoning, emailContent: emailDraft ?? null });
    }
};
