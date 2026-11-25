import { agentRepository, type AgentInventoryRecord, type AgentIngredientRecord } from '../repositories/agent.repository';
import { geminiService } from './gemini.service';
import { calculateReorderPoint, DELAY_BUFFER_DAYS, SAFETY_BUFFER_DAYS } from '../utils/inventory.utils';
import { SYSTEM_PROMPT_TEMPLATE, INGREDIENT_SYSTEM_PROMPT_TEMPLATE } from '../config/system-prompt';
import { replenishmentPlan } from '../workflows/replenishment';

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

type SupplierProduct = NonNullable<AgentInventoryRecord['product']>['supplierProducts'][number];
type ProductSales = Parameters<typeof SYSTEM_PROMPT_TEMPLATE>[3];
type ReorderSupplier = Parameters<typeof SYSTEM_PROMPT_TEMPLATE>[4][number] & {
    price: number;
    supplierProduct: SupplierProduct;
};

const formatRecommendationQuantity = (
    quantity: number,
    inventory: Pick<AgentInventoryRecord, 'unit'>,
    supplierProduct: SupplierProduct | null | undefined
) => {
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
            const spRaw: SupplierProduct & { leadTime?: number } = sp;
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
            } catch (err) {
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

    calculateRuleBased(
        inventory: Pick<AgentInventoryRecord, 'unit' | 'quantity' | 'minThreshold'>,
        sales: Pick<ProductSales, 'salesVelocity7d' | 'salesVelocity30d'>,
        suppliers: readonly ReorderSupplier[],
        planningSettings: { reorderPlanningPeriod: ReorderPlanningPeriod; reorderPlanningDays: number }
    ) {
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
    },

    async generateForIngredient(ingredientId: string, force = false, userId: string) {
        const ingredients = agentRepository.findIngredientsForScan
            ? await agentRepository.findIngredientsForScan([ingredientId])
            : [];
        const ingredient = ingredients[0];

        if (!ingredient) {
            return { skipped: true, reason: 'Ingredient not found.' };
        }

        const consumption = agentRepository.getIngredientConsumption
            ? await agentRepository.getIngredientConsumption(ingredientId, 30)
            : { totalConsumed7d: 0, totalConsumed30d: 0, dailyConsumption7d: 0, dailyConsumption30d: 0 };

        const firstActiveSupplier = (ingredient.supplierLinks ?? []).find((sl) => isSupplierActive(sl.supplier));
        const primaryLeadTimeDays = firstActiveSupplier ? (Number(firstActiveSupplier.leadTimeDays) || 0) : 0;
        const minThreshold = Number(ingredient.minThreshold || 0);
        const { reorderPoint } = calculateReorderPoint(
            consumption.dailyConsumption30d,
            primaryLeadTimeDays,
            DELAY_BUFFER_DAYS,
            SAFETY_BUFFER_DAYS,
            Math.max(1, minThreshold)
        );
        const currentQty = Number(ingredient.quantity || 0);
        const reservedQty = Number(ingredient.reserved || 0);
        const availableStock = Math.max(0, currentQty - reservedQty);

        if (!force && availableStock > reorderPoint) {
            const reasoning = `Nguyên liệu "${ingredient.name}" chưa dưới ngưỡng tái đặt hàng động (khả dụng: ${availableStock} ${ingredient.baseUnit}, điểm đặt hàng: ${reorderPoint} ${ingredient.baseUnit}, ngưỡng tối thiểu: ${minThreshold} ${ingredient.baseUnit}).`;
            const log = await agentRepository.createLog({
                action: 'RECOMMEND_REORDER_INGREDIENT_SKIP_THRESHOLD',
                input: JSON.stringify({ itemType: 'INGREDIENT', ingredientId, ingredientName: ingredient.name, force }),
                output: JSON.stringify({ itemType: 'INGREDIENT', ingredientId, ingredientName: ingredient.name, skipped: true, reason: 'ABOVE_THRESHOLD', availableStock, reorderPoint, minThreshold }),
                reasoning,
                result: 'SKIPPED',
                fallback_used: false,
                reference_type: 'Ingredient',
                reference_id: ingredientId,
                creator: userId ? { connect: { id: userId } } : undefined
            });
            return {
                logId: log.id,
                skipped: true,
                reason: 'ABOVE_THRESHOLD',
                skippedProduct: {
                    productId: ingredientId,
                    ingredientId,
                    productName: ingredient.name,
                    sku: ingredient.sku,
                    currentQuantity: currentQty,
                    minThreshold,
                    reasonCode: 'ABOVE_THRESHOLD',
                    reason: reasoning
                }
            };
        }

        const hasActive = agentRepository.hasOpenIngredientPurchaseRequest
            ? await agentRepository.hasOpenIngredientPurchaseRequest(ingredientId)
            : false;
        if (hasActive) {
            const reasoning = `Nguyên liệu "${ingredient.name}" đã có yêu cầu nhập hàng đang xử lý.`;
            const log = await agentRepository.createLog({
                action: 'RECOMMEND_REORDER_INGREDIENT_SKIP',
                input: JSON.stringify({ itemType: 'INGREDIENT', ingredientId, ingredientName: ingredient.name, force }),
                output: JSON.stringify({ itemType: 'INGREDIENT', ingredientId, ingredientName: ingredient.name, skipped: true, reason: 'ACTIVE_PR_EXISTS' }),
                reasoning,
                result: 'SKIPPED_DUPLICATE',
                fallback_used: false,
                reference_type: 'Ingredient',
                reference_id: ingredientId,
                creator: userId ? { connect: { id: userId } } : undefined
            });
            return {
                logId: log.id,
                skipped: true,
                reason: 'ACTIVE_PR_EXISTS',
                skippedProduct: {
                    productId: ingredientId,
                    ingredientId,
                    productName: ingredient.name,
                    sku: ingredient.sku,
                    currentQuantity: currentQty,
                    minThreshold,
                    reasonCode: 'ACTIVE_PR_EXISTS',
                    reason: reasoning
                }
            };
        }

        const activeLinks = (ingredient.supplierLinks ?? []).filter((sl) => isSupplierActive(sl.supplier));
        if ((ingredient.supplierLinks ?? []).length === 0 || activeLinks.length === 0) {
            const reasonCode = (ingredient.supplierLinks ?? []).length === 0 ? 'NO_SUPPLIERS_MAPPED' : 'SUPPLIERS_INACTIVE';
            const reasoning = reasonCode === 'NO_SUPPLIERS_MAPPED'
                ? `Nguyên liệu "${ingredient.name}" chưa được liên kết với nhà cung cấp.`
                : `Nhà cung cấp của nguyên liệu "${ingredient.name}" đang bị vô hiệu hóa.`;
            const log = await agentRepository.createLog({
                action: 'RECOMMEND_REORDER_INGREDIENT_NO_SUPPLIER',
                input: JSON.stringify({ itemType: 'INGREDIENT', ingredientId, ingredientName: ingredient.name, force }),
                output: JSON.stringify({ itemType: 'INGREDIENT', ingredientId, ingredientName: ingredient.name, skipped: true, reason: reasonCode }),
                reasoning,
                result: 'NO_SUPPLIER',
                fallback_used: false,
                reference_type: 'Ingredient',
                reference_id: ingredientId,
                creator: userId ? { connect: { id: userId } } : undefined
            });
            return {
                logId: log.id,
                skipped: true,
                reason: reasonCode,
                skippedProduct: {
                    productId: ingredientId,
                    ingredientId,
                    productName: ingredient.name,
                    sku: ingredient.sku,
                    currentQuantity: currentQty,
                    minThreshold,
                    reasonCode,
                    reason: reasoning
                }
            };
        }

        const usedByProducts = Array.from(
            new Set(
                (ingredient.recipeItems ?? [])
                    .map((ri) => ri.recipe?.product?.name)
                    .filter((n): n is string => Boolean(n))
            )
        );

        const suppliers = activeLinks.map((sl) => ({
            supplierId: sl.supplierId,
            supplierName: sl.supplier.name,
            pricePerBaseUnit: Number(sl.pricePerBaseUnit),
            purchaseUnit: sl.purchaseUnit || ingredient.baseUnit,
            conversionQuantity: Math.max(1, Number(sl.conversionQuantity || 1)),
            minOrderQuantity: Math.max(1, Number(sl.minOrderQuantity || 1)),
            leadTimeDays: Number(sl.leadTimeDays) || 3,
            isPreferred: Boolean(sl.isPreferred),
            supplierLink: sl
        }));

        const planningSettings = await this.getPlanningSettings();
        const storeName = (await agentRepository.getSettingValue('store.name')) || 'Cafe Admin';

        let aiRecommendation: {
            recommendedQuantity: number;
            recommendedSupplierId: string;
            confidence: number;
            reasoning: string;
            emailDraft: string;
        } | null = null;
        let fallbackUsed = false;
        let errorMessage: string | null = null;

        if (process.env.AGENT_RECOMMENDATION_MODE === 'gemini' && process.env.GEMINI_API_KEY) {
            try {
                const prompt = INGREDIENT_SYSTEM_PROMPT_TEMPLATE(
                    storeName,
                    {
                        name: ingredient.name,
                        sku: ingredient.sku,
                        baseUnit: ingredient.baseUnit,
                        quantity: currentQty,
                        reserved: reservedQty,
                        availableQuantity: availableStock,
                        minThreshold,
                        usedByProducts
                    },
                    consumption,
                    suppliers
                );
                const geminiResult = await geminiService.getRecommendation(prompt);
                const matchedSupplier = suppliers.find((s) => s.supplierId === geminiResult.recommendedSupplierId);
                const minBaseRequired = matchedSupplier
                    ? matchedSupplier.minOrderQuantity * matchedSupplier.conversionQuantity
                    : 1;
                const quantityValid =
                    geminiResult.recommendedQuantity > 0 &&
                    geminiResult.recommendedQuantity <= 1_000_000 &&
                    geminiResult.recommendedQuantity >= minBaseRequired * 0.1;
                const confidenceValid = geminiResult.confidence >= 0 && geminiResult.confidence <= 1;
                const reasoningValid = geminiResult.reasoning.trim().length > 0;

                if (matchedSupplier && quantityValid && confidenceValid && reasoningValid) {
                    aiRecommendation = geminiResult;
                } else {
                    throw new Error('Gemini ingredient recommendation failed validation.');
                }
            } catch (err) {
                fallbackUsed = true;
                errorMessage = err instanceof Error ? err.message : 'Unknown Gemini error';
            }
        } else {
            fallbackUsed = true;
            errorMessage = 'Rule-based recommendation mode is active. Gemini was not called.';
        }

        const ruleBased = this.calculateIngredientRuleBased(
            ingredient,
            availableStock,
            minThreshold,
            usedByProducts,
            consumption,
            suppliers,
            planningSettings
        );

        if (fallbackUsed || !aiRecommendation) {
            aiRecommendation = {
                recommendedQuantity: ruleBased.recommendedBaseQuantity,
                recommendedSupplierId: ruleBased.supplier.supplierId,
                confidence: 0.82,
                reasoning: `[Rule-Based Fallback] ${ruleBased.reasoning}`,
                emailDraft: `Kính gửi đối tác ${ruleBased.supplier.supplierName},\n\n${storeName} có nhu cầu đặt nhập nguyên liệu pha chế:\n- ${ingredient.name} (${ingredient.sku}): ${ruleBased.packs} ${ruleBased.supplier.purchaseUnit} (= ${ruleBased.recommendedBaseQuantity} ${ingredient.baseUnit})\n\nTrân trọng,\n${storeName}`
            };
        }

        const selectedSupplier = suppliers.find((s) => s.supplierId === aiRecommendation!.recommendedSupplierId) ?? ruleBased.supplier;
        const plan = replenishmentPlan({
            supplierId: selectedSupplier.supplierId,
            unitCosts: { [ingredient.id]: Number(selectedSupplier.pricePerBaseUnit).toFixed(4).replace(/\.?0+$/, '') || '0' }
        });

        const outputPayload = {
            itemType: 'INGREDIENT' as const,
            productId: ingredientId,
            ingredientId,
            productName: ingredient.name,
            ingredientName: ingredient.name,
            sku: ingredient.sku,
            baseUnit: ingredient.baseUnit,
            currentQuantity: currentQty,
            availableQuantity: availableStock,
            minThreshold,
            salesVelocity7d: consumption.dailyConsumption7d,
            salesVelocity30d: consumption.dailyConsumption30d,
            recommendedQuantity: aiRecommendation.recommendedQuantity,
            recommendedPacks: ruleBased.packs,
            purchaseUnit: selectedSupplier.purchaseUnit,
            conversionQuantity: selectedSupplier.conversionQuantity,
            reorderPlanningPeriod: planningSettings.reorderPlanningPeriod,
            reorderPlanningDays: planningSettings.reorderPlanningDays,
            recommendedSupplierId: selectedSupplier.supplierId,
            recommendedSupplierName: selectedSupplier.supplierName,
            confidence: aiRecommendation.confidence,
            reasoning: aiRecommendation.reasoning,
            emailDraft: aiRecommendation.emailDraft,
            replenishmentPlanSteps: plan.map((s) => s.id),
            fallbackUsed
        };

        const log = await agentRepository.createLog({
            action: 'RECOMMEND_REORDER_INGREDIENT',
            input: JSON.stringify({ itemType: 'INGREDIENT', ingredientId, ingredientName: ingredient.name, force }),
            output: JSON.stringify(outputPayload),
            reasoning: aiRecommendation.reasoning,
            result: 'RECOMMENDED',
            fallback_used: fallbackUsed,
            error_message: errorMessage,
            reference_type: 'Ingredient',
            reference_id: ingredientId,
            creator: userId ? { connect: { id: userId } } : undefined
        });

        return {
            logId: log.id,
            skipped: false,
            recommendation: outputPayload
        };
    },

    calculateIngredientRuleBased(
        ingredient: Pick<AgentIngredientRecord, 'name' | 'baseUnit'>,
        availableStock: number,
        minThreshold: number,
        usedByProducts: string[],
        consumption: { dailyConsumption7d: number; dailyConsumption30d: number },
        suppliers: Array<{
            supplierId: string;
            supplierName: string;
            pricePerBaseUnit: number;
            purchaseUnit: string;
            conversionQuantity: number;
            minOrderQuantity: number;
            leadTimeDays: number;
            isPreferred: boolean;
        }>,
        planningSettings: { reorderPlanningPeriod: ReorderPlanningPeriod; reorderPlanningDays: number }
    ) {
        const dailyUse = Math.max(consumption.dailyConsumption7d, consumption.dailyConsumption30d, 0);
        const sorted = [...suppliers].sort((a, b) => {
            const prefA = a.isPreferred ? 1 : 0;
            const prefB = b.isPreferred ? 1 : 0;
            if (prefB !== prefA) return prefB - prefA;
            if (a.pricePerBaseUnit !== b.pricePerBaseUnit) return a.pricePerBaseUnit - b.pricePerBaseUnit;
            return (a.leadTimeDays || 3) - (b.leadTimeDays || 3);
        });
        const selectedSupplier = sorted[0]!;
        const leadTime = selectedSupplier.leadTimeDays || 3;
        const bufferDays = SAFETY_BUFFER_DAYS;
        const targetStock = dailyUse > 0
            ? Math.ceil(dailyUse * (planningSettings.reorderPlanningDays + leadTime + bufferDays))
            : Math.max(minThreshold * 2, minThreshold + selectedSupplier.conversionQuantity);
        const rawDeficit = Math.max(targetStock - availableStock, minThreshold - availableStock, 1);
        const packs = Math.max(selectedSupplier.minOrderQuantity, Math.ceil(rawDeficit / selectedSupplier.conversionQuantity));
        const recommendedBaseQuantity = Math.ceil(packs * selectedSupplier.conversionQuantity);
        const recipeText = usedByProducts.length > 0 ? ` Đang dùng trong công thức: ${usedByProducts.join(', ')}.` : '';
        const reasoning = `Nguyên liệu "${ingredient.name}" hiện khả dụng ${availableStock} ${ingredient.baseUnit} (ngưỡng tối thiểu ${minThreshold} ${ingredient.baseUnit}).${recipeText} Tốc độ tiêu hao trung bình: ${dailyUse.toFixed(2)} ${ingredient.baseUnit}/ngày. Đề xuất đặt ${packs} ${selectedSupplier.purchaseUnit} (= ${recommendedBaseQuantity} ${ingredient.baseUnit}) từ nhà cung cấp ${selectedSupplier.supplierName}.`;

        return {
            packs,
            recommendedBaseQuantity,
            supplier: selectedSupplier,
            reasoning
        };
    }
};
