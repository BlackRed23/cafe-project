import { agentRepository } from '../repositories/agent.repository';
import { geminiService } from './gemini.service';
import { calculateReorderPoint } from '../utils/inventory.utils';
import { SYSTEM_PROMPT_TEMPLATE } from '../config/system-prompt';

const isSupplierActive = (supplier: { status?: string | null; deletedAt?: Date | null }): boolean =>
    supplier.status !== 'INACTIVE' && !supplier.deletedAt;

type ReorderPlanningPeriod = 'WEEKLY' | 'MONTHLY' | 'CUSTOM';

const parsePositiveIntSetting = (value: string | null): number | null => {
    if (value === null) return null;
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const parseReorderPlanningPeriod = (value: string | null): ReorderPlanningPeriod => {
    if (value === 'MONTHLY' || value === 'CUSTOM') return value;
    return 'WEEKLY';
};

const planningDaysForPeriod = (period: ReorderPlanningPeriod, customDays: number | null): number => {
    if (period === 'MONTHLY') return 30;
    if (period === 'CUSTOM') return customDays && customDays > 0 ? customDays : 14;
    return 7;
};

const planningPeriodText = (period: ReorderPlanningPeriod): string => {
    if (period === 'MONTHLY') return 'chu ky nhap hang hang thang';
    if (period === 'CUSTOM') return 'chu ky nhap hang tuy chinh';
    return 'chu ky nhap hang hang tuan';
};

const formatRecommendationQuantity = (quantity: number, inventory: any, supplierProduct: any) => {
    const inventoryUnit = inventory.unit || 'don vi';
    const purchaseUnit = supplierProduct?.purchaseUnit;
    const conversionQuantity = Number(supplierProduct?.conversionQuantity || 0);
    const conversionTargetUnit = supplierProduct?.conversionTargetUnit;

    if (!purchaseUnit || !conversionQuantity || conversionTargetUnit !== inventoryUnit) {
        return {
            recommendedQtyDisplay: `${quantity} ${inventoryUnit}`,
            conversionMissing: true,
            purchaseQuantity: null,
            purchaseUnit: null,
            convertedQuantity: quantity,
            inventoryUnit
        };
    }

    const purchaseQuantity = Math.ceil(quantity / conversionQuantity);
    const convertedQuantity = Math.ceil(purchaseQuantity * conversionQuantity);
    return {
        recommendedQtyDisplay: `${purchaseQuantity} ${purchaseUnit} = ${convertedQuantity} ${inventoryUnit}`,
        conversionMissing: false,
        purchaseQuantity,
        purchaseUnit,
        conversionQuantity,
        conversionTargetUnit,
        convertedQuantity,
        inventoryUnit
    };
};

export const recommendationService = {
    async getSalesData(productId: string) {
        return agentRepository.getSalesData(productId);
    },

    async getPlanningSettings() {
        const [periodValue, customDaysValue] = await Promise.all([
            agentRepository.getSettingValue('inventory.reorderPlanningPeriod'),
            agentRepository.getSettingValue('inventory.reorderPlanningCustomDays')
        ]);
        const reorderPlanningPeriod = parseReorderPlanningPeriod(periodValue);
        return {
            reorderPlanningPeriod,
            reorderPlanningDays: planningDaysForPeriod(reorderPlanningPeriod, parsePositiveIntSetting(customDaysValue))
        };
    },

    async generateForProduct(productId: string, force = false, userId: string) {
        const inventories = await agentRepository.findInventories([productId]);
        const inventory = inventories[0];
        const product = inventory?.product;

        if (!inventory || !product) {
            return { skipped: true, reason: 'Product or inventory not found.' };
        }

        const sales = await this.getSalesData(productId);
        const firstActiveSupplier = product.supplierProducts.find(sp => isSupplierActive(sp.supplier));
        const primaryLeadTimeDays = firstActiveSupplier ? (Number(firstActiveSupplier.leadTimeDays) || 0) : 0;
        const { reorderPoint } = calculateReorderPoint(sales.salesVelocity30d, primaryLeadTimeDays);
        const availableStock = inventory.quantity - (inventory.reservedStock ?? 0);

        if (availableStock > reorderPoint) {
            const reasoning = `San pham chua duoi nguong tai dat hang dong (available: ${availableStock}, reorderPoint: ${reorderPoint}, minThreshold: ${inventory.minThreshold}).`;
            const log = await agentRepository.createLog({
                action: 'RECOMMEND_REORDER_SKIP_THRESHOLD',
                input: JSON.stringify({ productId, force }),
                output: JSON.stringify({ skipped: true, reason: 'ABOVE_THRESHOLD', availableStock, reorderPoint, minThreshold: inventory.minThreshold }),
                reasoning,
                result: 'SKIPPED',
                fallback_used: false,
                reference_type: 'Product',
                reference_id: productId,
                creator: userId ? { connect: { id: userId } } : undefined
            });
            return {
                logId: log.id,
                skipped: true,
                reason: 'ABOVE_THRESHOLD',
                skippedProduct: {
                    productId,
                    productName: product.name,
                    sku: product.sku,
                    currentQuantity: inventory.quantity,
                    minThreshold: inventory.minThreshold,
                    reasonCode: 'ABOVE_THRESHOLD',
                    reason: reasoning
                }
            };
        }

        const hasActive = await agentRepository.hasOpenPurchaseRequest(productId, inventory.id);
        if (hasActive) {
            const reasoning = 'San pham da co yeu cau nhap hang dang xu ly.';
            const log = await agentRepository.createLog({
                action: 'RECOMMEND_REORDER_SKIP',
                input: JSON.stringify({ productId, force }),
                output: JSON.stringify({ skipped: true, reason: 'ACTIVE_PR_EXISTS' }),
                reasoning,
                result: 'SKIPPED_DUPLICATE',
                fallback_used: false,
                reference_type: 'Product',
                reference_id: productId,
                creator: userId ? { connect: { id: userId } } : undefined
            });
            return {
                logId: log.id,
                skipped: true,
                reason: 'ACTIVE_PR_EXISTS',
                skippedProduct: {
                    productId,
                    productName: product.name,
                    sku: product.sku,
                    currentQuantity: inventory.quantity,
                    minThreshold: inventory.minThreshold,
                    reasonCode: 'ACTIVE_PR_EXISTS',
                    reason: reasoning
                }
            };
        }

        if (product.supplierProducts.length === 0) {
            const reasoning = 'San pham chua duoc lien ket voi nha cung cap.';
            const log = await agentRepository.createLog({
                action: 'RECOMMEND_REORDER_NO_SUPPLIER',
                input: JSON.stringify({ productId, force }),
                output: JSON.stringify({ skipped: true, reason: 'NO_SUPPLIERS_MAPPED' }),
                reasoning,
                result: 'NO_SUPPLIER',
                fallback_used: false,
                reference_type: 'Product',
                reference_id: productId,
                creator: userId ? { connect: { id: userId } } : undefined
            });
            return {
                logId: log.id,
                skipped: true,
                reason: 'NO_SUPPLIERS_MAPPED',
                skippedProduct: {
                    productId,
                    productName: product.name,
                    sku: product.sku,
                    currentQuantity: inventory.quantity,
                    minThreshold: inventory.minThreshold,
                    reasonCode: 'NO_SUPPLIERS_MAPPED',
                    reason: reasoning
                }
            };
        }

        const activeSupplierProducts = product.supplierProducts.filter((sp) => isSupplierActive(sp.supplier));
        if (activeSupplierProducts.length === 0) {
            const reasoning = 'Nha cung cap cua san pham dang bi vo hieu hoa.';
            const log = await agentRepository.createLog({
                action: 'RECOMMEND_REORDER_INACTIVE_SUPPLIER',
                input: JSON.stringify({ productId, force }),
                output: JSON.stringify({ skipped: true, reason: 'SUPPLIERS_INACTIVE' }),
                reasoning,
                result: 'NO_SUPPLIER',
                fallback_used: false,
                reference_type: 'Product',
                reference_id: productId,
                creator: userId ? { connect: { id: userId } } : undefined
            });
            return {
                logId: log.id,
                skipped: true,
                reason: 'SUPPLIERS_INACTIVE',
                skippedProduct: {
                    productId,
                    productName: product.name,
                    sku: product.sku,
                    currentQuantity: inventory.quantity,
                    minThreshold: inventory.minThreshold,
                    reasonCode: 'SUPPLIERS_INACTIVE',
                    reason: reasoning
                }
            };
        }

        const suppliers = activeSupplierProducts.map((sp) => {
            const spRaw = sp as any;
            return {
                supplierId: sp.supplierId,
                supplierName: sp.supplier.name,
                price: Number(sp.price),
                supplyPrice: Number(sp.price),
                leadTimeDays: Number(spRaw.leadTimeDays) || Number(spRaw.leadTime) || 3,
                minOrderQuantity: Number(spRaw.minOrderQuantity) || 1,
                isPreferred: Boolean(spRaw.isPreferred),
                supplierProduct: sp
            };
        });

        // sales đã được fetch từ đầu hàm để tính reorderPoint — không fetch lại
        let aiRecommendation: {
            recommendedQuantity: number;
            recommendedSupplierId: string;
            confidence: number;
            reasoning: string;
            emailDraft: string;
        } | null = null;
        let fallbackUsed = false;
        let errorMessage: string | null = null;

        const planningSettings = await this.getPlanningSettings();
        const storeNameSetting = await agentRepository.getSettingValue('store.name');
        const storeName = storeNameSetting || 'Cafe Admin';

        if (process.env.AGENT_RECOMMENDATION_MODE === 'gemini' && process.env.GEMINI_API_KEY) {
            try {
                const prompt = SYSTEM_PROMPT_TEMPLATE(storeName, product, inventory, sales, suppliers);
                const geminiResult = await geminiService.getRecommendation(prompt);

                const supplierExists = suppliers.some((s) => s.supplierId === geminiResult.recommendedSupplierId);
                const quantityValid = geminiResult.recommendedQuantity > 0 && geminiResult.recommendedQuantity < 1000;
                const confidenceValid = geminiResult.confidence >= 0 && geminiResult.confidence <= 1;
                const reasoningValid = geminiResult.reasoning.trim().length > 0;

                if (supplierExists && quantityValid && confidenceValid && reasoningValid) {
                    aiRecommendation = geminiResult;
                } else {
                    let failReason = '';
                    if (!supplierExists) failReason += `Supplier ID ${geminiResult.recommendedSupplierId} does not exist. `;
                    if (!quantityValid) failReason += `Quantity ${geminiResult.recommendedQuantity} is invalid. `;
                    if (!confidenceValid) failReason += `Confidence ${geminiResult.confidence} out of bounds. `;
                    if (!reasoningValid) failReason += 'Reasoning is empty. ';
                    throw new Error(`Gemini validation failed: ${failReason}`);
                }
            } catch (err: any) {
                fallbackUsed = true;
                errorMessage = err instanceof Error ? err.message : 'Unknown Gemini error';
            }
        } else {
            fallbackUsed = true;
            errorMessage = 'Rule-based recommendation mode is active. Gemini was not called.';
        }

        if (fallbackUsed || !aiRecommendation) {
            const ruleBased = this.calculateRuleBased(inventory, sales, suppliers, planningSettings);
            aiRecommendation = {
                recommendedQuantity: ruleBased.recommendedQuantity,
                recommendedSupplierId: ruleBased.supplier.supplierId,
                confidence: 0.5,
                reasoning: `[Rule-Based Fallback] ${ruleBased.reasoning}`,
                emailDraft: `Kinh gui doi tac ${ruleBased.supplier.supplierName},\n\n${storeName} dang co nhu cau dat hang/bao gia:\n- ${product.name}: ${ruleBased.quantityDisplay.recommendedQtyDisplay}${ruleBased.quantityDisplay.conversionMissing ? '' : `\n  Quy cach: 1 ${ruleBased.quantityDisplay.purchaseUnit} = ${ruleBased.quantityDisplay.conversionQuantity} ${ruleBased.quantityDisplay.conversionTargetUnit}`}\n\nTran trong,\n${storeName}`
            };
        }

        const selectedSupplier = suppliers.find((s) => s.supplierId === aiRecommendation!.recommendedSupplierId)!;
        const outputPayload = {
            productId,
            productName: product.name,
            sku: product.sku,
            currentQuantity: inventory.quantity,
            minThreshold: inventory.minThreshold,
            salesVelocity7d: sales.salesVelocity7d,
            salesVelocity30d: sales.salesVelocity30d,
            recommendedQuantity: aiRecommendation.recommendedQuantity,
            reorderPlanningPeriod: planningSettings.reorderPlanningPeriod,
            reorderPlanningDays: planningSettings.reorderPlanningDays,
            recommendedSupplierId: aiRecommendation.recommendedSupplierId,
            recommendedSupplierName: selectedSupplier.supplierName,
            confidence: aiRecommendation.confidence,
            reasoning: aiRecommendation.reasoning,
            emailDraft: aiRecommendation.emailDraft,
            fallbackUsed
        };

        const log = await agentRepository.createLog({
            action: 'RECOMMEND_REORDER',
            input: JSON.stringify({ productId, force }),
            output: JSON.stringify(outputPayload),
            reasoning: aiRecommendation.reasoning,
            result: 'RECOMMENDED',
            fallback_used: fallbackUsed,
            error_message: errorMessage,
            reference_type: 'Product',
            reference_id: productId,
            creator: userId ? { connect: { id: userId } } : undefined
        });

        return {
            logId: log.id,
            skipped: false,
            recommendation: outputPayload
        };
    },

    calculateRuleBased(inventory: any, sales: any, suppliers: any[], planningSettings: { reorderPlanningPeriod: ReorderPlanningPeriod; reorderPlanningDays: number }) {
        const rawDailySales = Math.max(sales.salesVelocity7d, sales.salesVelocity30d, 0);
        const dailySales = rawDailySales > 0 ? rawDailySales : 0;
        const sorted = [...suppliers].sort((a, b) => {
            const prefA = a.isPreferred ? 1 : 0;
            const prefB = b.isPreferred ? 1 : 0;
            if (prefB !== prefA) return prefB - prefA;
            if (a.price !== b.price) return a.price - b.price;
            return (a.leadTimeDays || 3) - (b.leadTimeDays || 3);
        });

        const selectedSupplier = sorted[0]!;
        const leadTime = selectedSupplier.leadTimeDays || 3;
        const bufferDays = 2;
        const safetyStock = inventory.minThreshold;
        const targetStock = dailySales > 0
            ? Math.ceil(dailySales * (planningSettings.reorderPlanningDays + leadTime + bufferDays))
            : safetyStock;
        const recommendedQuantity = Math.ceil(targetStock - inventory.quantity);
        const finalQuantity = Math.max(recommendedQuantity, selectedSupplier.minOrderQuantity || 1);
        const quantityDisplay = formatRecommendationQuantity(finalQuantity, inventory, selectedSupplier.supplierProduct);
        const conversionText = quantityDisplay.conversionMissing
            ? `San pham chua co quy cach nhap hang theo nha cung cap, hien thi ${quantityDisplay.recommendedQtyDisplay}.`
            : `Theo quy cach nha cung cap: 1 ${quantityDisplay.purchaseUnit} = ${quantityDisplay.conversionQuantity} ${quantityDisplay.conversionTargetUnit}. He thong lam tron so luong dat thanh ${quantityDisplay.recommendedQtyDisplay}.`;
        const reasoning = `He thong dang tinh de xuat theo ${planningPeriodText(planningSettings.reorderPlanningPeriod)}. San pham can bo sung de dap ung nhu cau ban trong ${planningSettings.reorderPlanningDays} ngay tiep theo, co tinh them thoi gian nhap hang ${leadTime} ngay va muc du phong an toan ${bufferDays} ngay. Toc do ban trung binh moi ngay dung lam du lieu nen la ${dailySales.toFixed(2)} ${inventory.unit}/ngay. So luong de xuat: ${quantityDisplay.recommendedQtyDisplay}. ${conversionText}`;

        return {
            recommendedQuantity: finalQuantity,
            supplier: selectedSupplier,
            reasoning,
            quantityDisplay
        };
    }
};
