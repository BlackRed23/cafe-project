import { agentRepository, type AgentInventoryRecord } from './agent.repository';
import type { ScanInventoryInput, RecommendReorderInput } from './agent.validator';
import { prisma } from '../../common/prisma';
import { recommendationService } from './recommendation.service';
import { HttpError } from '../../common/http-error';
import { ACTIVE_PURCHASE_REQUEST_MESSAGE } from '../purchase/purchase.repository';
import { getOptionalSettingValue } from '../system-setting/system-setting.service';

const maskDatabaseUrl = (raw?: string): string => {
    if (!raw) return 'MISSING';
    try {
        const url = new URL(raw);
        if (url.password) url.password = '***';
        return url.toString();
    } catch {
        return raw.replace(/(:\/\/[^:]+:)([^@]+)(@)/, '$1***$3');
    }
};

const isSupplierActive = (supplier: { status?: string | null; deletedAt?: Date | null }): boolean =>
    supplier.status !== 'INACTIVE' && !supplier.deletedAt;
const reasoningText = (inventory: AgentInventoryRecord, minThreshold: number, recommendedQty: number, supplierName?: string): string =>
    `Sáº£n pháº©m ${inventory.product.name} cÃ²n ${inventory.quantity}, tháº¥p hÆ¡n hoáº·c báº±ng ngÆ°á»¡ng tá»‘i thiá»ƒu ${minThreshold}. Há»‡ thá»‘ng Ä‘á» xuáº¥t nháº­p thÃªm ${recommendedQty} sáº£n pháº©m Ä‘á»ƒ Ä‘áº¡t má»©c an toÃ n. NhÃ  cung cáº¥p ${supplierName ?? 'khÃ´ng xÃ¡c Ä‘á»‹nh'} Ä‘Æ°á»£c chá»n vÃ¬ cÃ³ giÃ¡ nháº­p phÃ¹ há»£p nháº¥t trong dá»¯ liá»‡u hiá»‡n cÃ³.`;

const parseBooleanSetting = (value: string | null, defaultValue: boolean): boolean => {
    if (value === null) return defaultValue;
    return value.trim().toLowerCase() !== 'false';
};

const parsePositiveIntSetting = (value: string | null): number | null => {
    if (value === null) return null;
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const withOptionalText = (base: string, optionalParts: Array<string | null>): string => {
    const prefix = optionalParts.map((part) => part?.trim()).filter(Boolean);
    return [...prefix, base].join('\n');
};

const getAgentSettings = async () => {
    const [enabled, slogan, promptPrefix, defaultMinThreshold] = await Promise.all([
        getOptionalSettingValue('ai.enabled'),
        getOptionalSettingValue('ai.slogan'),
        getOptionalSettingValue('ai.promptPrefix'),
        getOptionalSettingValue('inventory.defaultMinThreshold')
    ]);

    return {
        enabled: parseBooleanSetting(enabled, true),
        slogan,
        promptPrefix,
        defaultMinThreshold: parsePositiveIntSetting(defaultMinThreshold)
    };
};

const toLogDto = (log: any) => ({
    id: log.id,
    action: log.action,
    input: log.input ? JSON.parse(log.input) : null,
    output: log.output ? JSON.parse(log.output) : null,
    reasoning: log.reasoning,
    fallback_used: log.fallback_used,
    error_message: log.error_message,
    reference_type: log.reference_type,
    reference_id: log.reference_id,
    result: log.result,
    createdBy: log.creator?.name || log.createdBy || null,
    createdAt: log.triggered_at
});

export const agentService = {
    async scanInventory(input: ScanInventoryInput, userId: string) {
        console.info('[AI_DEBUG] DATABASE_URL source check:', maskDatabaseUrl(process.env.DATABASE_URL));
        const settings = await getAgentSettings();
        if (!settings.enabled) {
            const log = await agentRepository.createLog({
                action: 'SCAN_INVENTORY_DISABLED',
                input: JSON.stringify({ triggerType: input.triggerType, productIds: input.productIds }),
                output: JSON.stringify({ skipped: true, reason: 'AI_DISABLED' }),
                reasoning: 'AI Agent is disabled by system setting.',
                result: 'SKIPPED_DISABLED',
                fallback_used: false,
                reference_type: 'SystemSetting',
                reference_id: 'ai.enabled',
                creator: userId ? { connect: { id: userId } } : undefined
            });
            return { results: [toLogDto(log)], createdPurchaseRequests: [] };
        }

        const inventories = await agentRepository.findInventories(input.productIds);
        const results = [];
        const createdPurchaseRequests = [];

        for (const inventory of inventories) {
            const product = inventory.product;
            const minThreshold = settings.defaultMinThreshold ?? inventory.minThreshold;
            console.info('[AI_DEBUG] Scanning product:', { productId: product.id, productName: product.name, sku: product.sku });
            console.info('[AI_DEBUG] Inventory:', { quantity: inventory.quantity, minThreshold });
            console.info('[AI_DEBUG] SupplierProducts count:', product.supplierProducts.length);
            for (const sp of product.supplierProducts) {
                console.info('[AI_DEBUG] SupplierProduct:', {
                    supplierId: sp.supplierId,
                    supplierName: sp.supplier.name,
                    supplierStatus: sp.supplier.status,
                    supplierDeletedAt: sp.supplier.deletedAt,
                    supplyPrice: Number(sp.price),
                    MOQ: sp.minOrderQuantity,
                    leadTimeDays: sp.leadTimeDays,
                    isPreferred: sp.isPreferred
                });
            }

            if (inventory.quantity > minThreshold) {
                console.info('[AI_DEBUG] Product skipped:', { productId: product.id, productName: product.name, reason: `Stock ${inventory.quantity} is above minThreshold ${minThreshold}.` });
                continue;
            }

            const recommendedQty = Math.max(minThreshold * 3 - inventory.quantity, 1);
            const hasOpenRequest = await agentRepository.hasOpenPurchaseRequest(inventory.productId, inventory.id);
            const baseInput = { triggerType: input.triggerType, inventoryId: inventory.id, productId: inventory.productId, currentQty: inventory.quantity, minThreshold, recommendedQty };

            if (hasOpenRequest) {
                const reasoning = 'Sản phẩm đã có yêu cầu nhập hàng đang xử lý.';
                console.info('[AI_DEBUG] Product skipped:', { productId: product.id, productName: product.name, reason: reasoning });
                const log = await agentRepository.createLog({ action: 'SCAN_INVENTORY_SKIP_DUPLICATE', input: JSON.stringify(baseInput), output: JSON.stringify({ skipped: true, reason: 'ACTIVE_PR_EXISTS' }), reasoning, result: 'SKIPPED_DUPLICATE', fallback_used: true, reference_type: 'Inventory', reference_id: inventory.id, creator: userId ? { connect: { id: userId } } : undefined });
                results.push(toLogDto(log));
                continue;
            }

            if (product.supplierProducts.length === 0) {
                const reasoning = 'Sản phẩm chưa được liên kết với nhà cung cấp.';
                console.info('[AI_DEBUG] Product skipped:', { productId: product.id, productName: product.name, reason: reasoning });
                const log = await agentRepository.createLog({ action: 'SCAN_INVENTORY_NO_SUPPLIER', input: JSON.stringify(baseInput), output: JSON.stringify({ skipped: true, reason: 'NO_SUPPLIERS_MAPPED' }), reasoning, result: 'NO_SUPPLIER', fallback_used: true, reference_type: 'Inventory', reference_id: inventory.id, creator: { connect: { id: userId } } });
                results.push(toLogDto(log));
                continue;
            }

            const supplierProduct = product.supplierProducts.find((sp) => isSupplierActive(sp.supplier));
            if (!supplierProduct) {
                const reasoning = 'Nhà cung cấp của sản phẩm đang bị vô hiệu hóa.';
                console.info('[AI_DEBUG] Product skipped:', { productId: product.id, productName: product.name, reason: reasoning });
                const log = await agentRepository.createLog({ action: 'SCAN_INVENTORY_INACTIVE_SUPPLIER', input: JSON.stringify(baseInput), output: JSON.stringify({ skipped: true, reason: 'SUPPLIERS_INACTIVE' }), reasoning, result: 'NO_SUPPLIER', fallback_used: true, reference_type: 'Inventory', reference_id: inventory.id, creator: { connect: { id: userId } } });
                results.push(toLogDto(log));
                continue;
            }

            const reasoning = withOptionalText(reasoningText(inventory, minThreshold, recommendedQty, supplierProduct.supplier.name), [settings.promptPrefix, settings.slogan]);
            const request = await agentRepository.createAiPurchaseRequest(inventory, supplierProduct, recommendedQty, reasoning, userId);
            createdPurchaseRequests.push({ id: request.id, requestNumber: request.requestNumber, supplierName: request.supplier.name, status: request.status });
            const output = { purchaseRequestId: request.id, recommendedSupplierId: supplierProduct.supplierId, recommendedQty, confidence: 0.82 };
            const log = await agentRepository.createLog({ action: 'SCAN_INVENTORY_CREATE_PURCHASE_REQUEST', input: JSON.stringify(baseInput), output: JSON.stringify(output), reasoning, result: 'CREATED_PURCHASE_REQUEST', fallback_used: true, reference_type: 'PurchaseRequest', reference_id: request.id, creator: { connect: { id: userId } } });
            results.push(toLogDto(log));
        }

        return { results, createdPurchaseRequests };
    },
    async logs() { 
        const logs = await prisma.agentLog.findMany({
            include: {
                creator: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                }
            },
            orderBy: {
                triggered_at: 'desc'
            },
            take: 100
        });
        return logs.map(toLogDto);
    },

    async recommendReorder(input: RecommendReorderInput, userId: string) {
        console.info('[AI_DEBUG] DATABASE_URL source check:', maskDatabaseUrl(process.env.DATABASE_URL));
        const productIds = input.productIds || (await prisma.product.findMany({
            where: { isActive: true },
            select: { id: true }
        })).map((p) => p.id);

        const recommendations = [];
        const skippedProducts = [];

        for (const id of productIds) {
            try {
                const res = await recommendationService.generateForProduct(id, input.force, userId);
                if (res.skipped) {
                    console.info('[AI_DEBUG] Product skipped:', { productId: id, reason: res.reason });
                    if (res.skippedProduct) {
                        skippedProducts.push(res.skippedProduct);
                    }
                }
                if (!res.skipped && res.recommendation) {
                    recommendations.push({
                        logId: res.logId,
                        ...res.recommendation
                    });
                }
            } catch (err: any) {
                console.error(`Recommendation failed for product ${id}:`, err);
            }
        }

        return {
            scannedCount: productIds.length,
            newRecommendationsCount: recommendations.length,
            skippedCount: skippedProducts.length,
            recommendations,
            skippedProducts
        };
    },

    async getRecommendations() {
        const logs = await prisma.agentLog.findMany({
            where: {
                action: 'RECOMMEND_REORDER'
            },
            include: {
                creator: {
                    select: {
                        name: true
                    }
                }
            },
            orderBy: {
                triggered_at: 'desc'
            }
        });

        return logs.map((log) => {
            const output = log.output ? JSON.parse(log.output) : null;
            return {
                logId: log.id,
                productId: output?.productId || '',
                productName: output?.productName || '',
                sku: output?.sku || '',
                currentQuantity: output?.currentQuantity ?? 0,
                minThreshold: output?.minThreshold ?? 0,
                salesVelocity7d: output?.salesVelocity7d ?? 0,
                salesVelocity30d: output?.salesVelocity30d ?? 0,
                recommendedQuantity: output?.recommendedQuantity ?? 0,
                recommendedSupplierId: output?.recommendedSupplierId || '',
                recommendedSupplierName: output?.recommendedSupplierName || '',
                confidence: output?.confidence ?? 0,
                reasoning: log.reasoning,
                emailDraft: output?.emailDraft || '',
                fallbackUsed: log.fallback_used,
                errorMessage: log.error_message,
                createdAt: log.triggered_at,
                createdBy: log.creator?.name || null,
                result: log.result,
                referenceType: log.reference_type,
                referenceId: log.reference_id
            };
        });
    },

    async createPurchaseRequestFromRecommendation(logId: string, userId: string) {
        const log = await prisma.agentLog.findUnique({
            where: { id: logId }
        });

        if (!log) {
            throw new HttpError(404, 'Recommendation log not found.');
        }

        if (log.action !== 'RECOMMEND_REORDER') {
            throw new HttpError(400, 'Invalid log action type.');
        }

        if (log.result === 'CONVERTED_TO_PR') {
            throw new HttpError(400, 'Recommendation has already been converted to a purchase request.');
        }

        const recommendation = log.output ? JSON.parse(log.output) : null;
        if (!recommendation) {
            throw new HttpError(400, 'Recommendation data is missing.');
        }

        const productId = recommendation.productId;
        const inventory = await prisma.inventory.findUnique({
            where: { productId }
        });

        if (!inventory) {
            throw new HttpError(404, 'Inventory record for product not found.');
        }

        // Prevent duplicate active request
        const hasActive = await agentRepository.hasOpenPurchaseRequest(productId, inventory.id);
        if (hasActive) {
            throw new HttpError(400, ACTIVE_PURCHASE_REQUEST_MESSAGE);
        }

        // Retrieve supplier product pricing
        const supplierProduct = await prisma.supplierProduct.findUnique({
            where: {
                supplierId_productId: {
                    supplierId: recommendation.recommendedSupplierId,
                    productId: productId
                }
            }
        });

        const price = supplierProduct ? Number(supplierProduct.price) : 0;
        const totalAmount = price * recommendation.recommendedQuantity;

        // Create transaction transaction
        const request = await prisma.$transaction(async (tx) => {
            const pr = await tx.purchaseRequest.create({
                data: {
                    requestNumber: `AI-REC-${Date.now()}`,
                    supplierId: recommendation.recommendedSupplierId,
                    requestedBy: userId,
                    aiGenerated: true,
                    notes: recommendation.reasoning,
                    emailContent: recommendation.emailDraft,
                    totalAmount: totalAmount,
                    items: {
                        create: {
                            inventoryId: inventory.id,
                            productId: productId,
                            quantity: recommendation.recommendedQuantity,
                            unitPrice: price,
                            notes: recommendation.reasoning
                        }
                    }
                }
            });

            // Update log reference
            await tx.agentLog.update({
                where: { id: logId },
                data: {
                    reference_type: 'PurchaseRequest',
                    reference_id: pr.id,
                    result: 'CONVERTED_TO_PR'
                }
            });

            return pr;
        });

        return request;
    }
};



