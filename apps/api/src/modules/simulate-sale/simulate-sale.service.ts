import { HttpError } from '../../common/http-error';
import { simulateSaleRepository } from './simulate-sale.repository';
import type { SimulateSaleInput } from './simulate-sale.validator';
import { scanInventoryViaAgentService, createAgentLogViaAgentService, type AgentInventoryScan } from '../agent/agent.client';

const randomInt = (min: number, max: number): number => Math.floor(Math.random() * (max - min + 1)) + min;

type RecipeSale = Awaited<ReturnType<typeof simulateSaleRepository.applyRecipeSale>>[number];
type InventorySale = Awaited<ReturnType<typeof simulateSaleRepository.applySale>>[number];
type AffectedProduct = RecipeSale | (InventorySale & { ingredientIds?: never; minThreshold?: number });
type SingleAffectedProduct = Awaited<ReturnType<typeof simulateSaleRepository.applyRecipeProductSale>>
    | (Awaited<ReturnType<typeof simulateSaleRepository.applyProductSale>> & { ingredientIds?: never });

const runAgentScan = async (input: { productIds: string[]; ingredientIds?: string[]; userId: string; sourceId?: string }): Promise<Omit<AgentInventoryScan, 'agentWarning'> & { agentWarning: string | null }> => {
    try {
        const scan = await scanInventoryViaAgentService({
            productIds: input.productIds,
            ...(input.ingredientIds?.length ? { ingredientIds: input.ingredientIds } : {}),
            scope: 'ALL',
            triggerType: 'SIMULATE_SALE',
            sourceType: 'SIMULATE_SALE',
            sourceId: input.sourceId
        }, input.userId);
        return { ...scan, agentWarning: null };
    } catch (error) {
        console.error('[AI_AGENT] Failed to scan inventory after simulate sale', error);
        return {
            results: [],
            createdPurchaseRequests: [],
            agentWarning: 'Simulate sale completed, but AI Agent scan could not run.'
        };
    }
};

export const simulateSaleService = {
    async run(input: SimulateSaleInput, userId: string) {
        // Multi-product support
    if (input.items && input.items.length > 0) {
        const allInventories = await simulateSaleRepository.findInventories();
        const hasMissingInventory = input.items.some((it) => !allInventories.find((i) => i.productId === it.productId));

        let affectedProducts: AffectedProduct[];
        if (hasMissingInventory) {
            affectedProducts = await simulateSaleRepository.applyRecipeSale(
                input.items.map((it) => ({ productId: it.productId, decrease: it.quantity })),
                input.note ?? null,
                userId
            );
        } else {
            const plans = input.items.map((it) => {
                const inv = allInventories.find((i) => i.productId === it.productId);
                if (!inv) {
                    throw new HttpError(404, `Inventory not found for product ${it.productId}.`);
                }
                if (!inv.product.isActive) {
                    throw new HttpError(400, `Selected product ${it.productId} is inactive.`);
                }
                const available = (inv.quantity ?? 0) - (inv.reservedStock ?? 0);
                if (available < it.quantity) {
                    const unit = inv.product?.servingUnit || 'đơn vị';
                    throw new HttpError(400, `Không đủ tồn kho để mô phỏng bán hàng cho sản phẩm ${it.productId}. Tồn kho hiện tại: ${available} ${unit}, yêu cầu: ${it.quantity} ${unit}.`);
                }
                return { inventory: inv, decrease: it.quantity };
            });
            affectedProducts = await simulateSaleRepository.applySale(plans, input.note ?? null, userId);
        }

        const allProductIds = affectedProducts.map((a) => a.productId);
        const allIngredientIds = Array.from(new Set(affectedProducts.flatMap((a) => a.ingredientIds ?? [])));
        const scan = await runAgentScan({
            productIds: allProductIds,
            ingredientIds: allIngredientIds,
            sourceId: affectedProducts[0]?.transactionId,
            userId
        });

        for (const affected of affectedProducts) {
            createAgentLogViaAgentService({
                action: 'SIMULATE_SALE_COMPLETED',
                result: 'SUCCESS',
                reasoning: `Mô phỏng bán hoàn tất. Tồn kho sản phẩm ${affected.productName} đã trừ ${affected.decreasedQuantity}. AI Agent đã kiểm tra.`,
                input: {
                    productId: affected.productId,
                    productName: affected.productName,
                    quantityBefore: affected.stockBefore,
                    quantityAfter: affected.stockAfter,
                    quantityDecreased: affected.decreasedQuantity,
                    triggerType: 'SIMULATE_SALE'
                },
                output: {
                    description: `Mô phỏng bán hoàn tất. AI Agent đã kiểm tra tồn kho.`,
                    agentWarning: scan.agentWarning || null,
                    createdPurchaseRequestsCount: scan.createdPurchaseRequests?.length || 0,
                    scanSessionId: scan.scanSessionId || null
                },
                creator: userId ? { connect: { id: userId } } : undefined
            }).catch(console.error);
        }

        return {
            affectedProducts,
            createdPurchaseRequests: scan.createdPurchaseRequests ?? [],
            agentLogs: scan.results ?? [],
            agentResults: scan.results ?? [],
            agentWarning: scan.agentWarning,
            scanSessionId: scan.scanSessionId,
            newQuantity: affectedProducts[0]?.stockAfter ?? 0,
        };
    }
    if (input.productId) {
            const inventory = await simulateSaleRepository.findInventoryByProductId(input.productId);

            let quantity = input.quantity ?? 0;

            if (input.simulationMode || input.dailySimulatedQuantity) {
                let numberOfDays = 1;
                if (input.simulationMode === 'WEEK') numberOfDays = 7;
                else if (input.simulationMode === 'MONTH') numberOfDays = 30;
                else if (input.simulationMode === 'CUSTOM_RANGE') {
                    if (input.startDate && input.endDate) {
                        const start = new Date(input.startDate);
                        const end = new Date(input.endDate);
                        const diffTime = end.getTime() - start.getTime();
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        numberOfDays = diffDays >= 0 ? diffDays + 1 : 0;
                    } else {
                        numberOfDays = 0;
                    }
                }

                if (input.dailySimulatedQuantity) {
                    quantity = Math.round(input.dailySimulatedQuantity * numberOfDays);
                }
            }

            let affectedProduct: SingleAffectedProduct;
            if (!inventory) {
                affectedProduct = await simulateSaleRepository.applyRecipeProductSale(
                    input.productId,
                    quantity,
                    input.note ?? null,
                    userId
                );
            } else {
                if (!inventory.product.isActive) {
                    throw new HttpError(400, 'Selected product is inactive.');
                }

                if (inventory.quantity < quantity) {
                    let unit = inventory.product?.servingUnit || 'đơn vị';
                    if (unit.toLowerCase() === 'ly') unit = 'đơn vị';
                    throw new HttpError(400, `Không đủ tồn kho để mô phỏng bán hàng. Tồn kho hiện tại: ${inventory.quantity} ${unit}, yêu cầu: ${quantity} ${unit}.`);
                }

                affectedProduct = await simulateSaleRepository.applyProductSale(inventory, quantity, input.note ?? null, userId);
            }

            if (!affectedProduct) {
                throw new HttpError(404, 'Inventory not found for selected product.');
            }

            const scan = await runAgentScan({
                productIds: [affectedProduct.productId],
                ingredientIds: affectedProduct.ingredientIds,
                sourceId: affectedProduct.transactionId,
                userId
            });

            createAgentLogViaAgentService({
                action: 'SIMULATE_SALE_COMPLETED',
                result: 'SUCCESS',
                reasoning: `Mô phỏng bán hoàn tất. Tồn kho sản phẩm ${affectedProduct.productName} đã trừ ${affectedProduct.decreasedQuantity}. AI Agent đã kiểm tra.`,
                input: {
                    productId: affectedProduct.productId,
                    productName: affectedProduct.productName,
                    quantityBefore: affectedProduct.stockBefore,
                    quantityAfter: affectedProduct.stockAfter,
                    quantityDecreased: affectedProduct.decreasedQuantity,
                    triggerType: 'SIMULATE_SALE'
                },
                output: {
                    description: `Mô phỏng bán hoàn tất. AI Agent đã kiểm tra tồn kho.`,
                    agentWarning: scan.agentWarning || null,
                    createdPurchaseRequestsCount: scan.createdPurchaseRequests?.length || 0,
                    scanSessionId: scan.scanSessionId || null
                },
                creator: userId ? { connect: { id: userId } } : undefined
            }).catch(console.error);

            const taggedResults = (scan.results ?? []).map((r) => ({
                ...r,
                productId: r.productId ?? affectedProduct.productId,
                productName: r.productName ?? r.ingredientName ?? affectedProduct.productName
            }));
            const taggedPrs = (scan.createdPurchaseRequests ?? []).map((pr) => ({
                ...pr,
                productId: pr.productId ?? affectedProduct.productId
            }));

            return {
                affectedProduct,
                affectedProducts: [affectedProduct],
                inventoryId: affectedProduct.inventoryId,
                transactionId: affectedProduct.transactionId,
                productId: affectedProduct.productId,
                productName: affectedProduct.productName,
                stockBefore: affectedProduct.stockBefore,
                stockAfter: affectedProduct.stockAfter,
                newQuantity: affectedProduct.stockAfter,
                decreasedQuantity: affectedProduct.decreasedQuantity,
                createdPurchaseRequests: taggedPrs,
                agentLogs: taggedResults,
                agentResults: taggedResults,
                agentWarning: scan.agentWarning,
                scanSessionId: scan.scanSessionId
            };
        }

        const inventories = await simulateSaleRepository.findInventories();
        const productCount = input.productCount ?? 1;
        const minDecrease = input.minDecrease ?? 1;
        const maxDecrease = input.maxDecrease ?? minDecrease;

        let affectedProducts: AffectedProduct[];
        if (inventories.length === 0) {
            const recipeProducts = await simulateSaleRepository.findRecipeProducts();
            if (recipeProducts.length === 0) throw new HttpError(404, 'No active products found.');
            const shuffled = [...recipeProducts].sort(() => Math.random() - 0.5);
            const selected = shuffled.slice(0, Math.min(productCount, shuffled.length));
            const plans = selected.map((p) => ({ productId: p.id, decrease: randomInt(minDecrease, maxDecrease) }));
            affectedProducts = await simulateSaleRepository.applyRecipeSale(plans, input.note ?? null, userId);
        } else {
            const shuffled = [...inventories].sort(() => Math.random() - 0.5);
            const selected = shuffled.slice(0, Math.min(productCount, shuffled.length));
            const plans = selected.map((inventory) => ({ inventory, decrease: randomInt(minDecrease, maxDecrease) }));
            affectedProducts = await simulateSaleRepository.applySale(plans, input.note ?? null, userId);
        }
        const productIds = affectedProducts.map((item) => item.productId);
        const ingredientIds = Array.from(new Set(affectedProducts.flatMap((item) => item.ingredientIds ?? [])));
        const scan = await runAgentScan({
            productIds,
            ingredientIds,
            userId
        });

        for (const affected of affectedProducts) {
            createAgentLogViaAgentService({
                action: 'SIMULATE_SALE_COMPLETED',
                result: 'SUCCESS',
                reasoning: `Mô phỏng bán hoàn tất. Tồn kho sản phẩm ${affected.productName} đã trừ ${affected.decreasedQuantity}. AI Agent đã kiểm tra.`,
                input: {
                    productId: affected.productId,
                    productName: affected.productName,
                    quantityBefore: affected.stockBefore,
                    quantityAfter: affected.stockAfter,
                    quantityDecreased: affected.decreasedQuantity,
                    triggerType: 'SIMULATE_SALE'
                },
                output: {
                    description: `Mô phỏng bán hoàn tất. AI Agent đã kiểm tra tồn kho.`,
                    agentWarning: scan.agentWarning || null,
                    createdPurchaseRequestsCount: scan.createdPurchaseRequests?.length || 0,
                    scanSessionId: scan.scanSessionId || null
                },
                creator: userId ? { connect: { id: userId } } : undefined
            }).catch(console.error);
        }

        return { affectedProducts, createdPurchaseRequests: scan.createdPurchaseRequests, agentLogs: scan.results, agentResults: scan.results, agentWarning: scan.agentWarning, scanSessionId: scan.scanSessionId, newQuantity: affectedProducts[0]?.stockAfter ?? 0 };
    },

    async restore(transactionId: string, userId: string) {
        if (!transactionId?.trim()) {
            throw new HttpError(400, 'Simulation transaction id is required.');
        }

        const restored = await simulateSaleRepository.restoreSale(transactionId.trim(), userId);
        createAgentLogViaAgentService({
            action: 'SIMULATE_SALE_REVERTED',
            result: 'SUCCESS',
            reasoning: `Đã khôi phục mô phỏng bán sản phẩm ${restored.productName}. Tồn kho cộng lại ${restored.decreasedQuantity}.`,
            input: {
                productId: restored.productId,
                productName: restored.productName,
                quantityBefore: restored.stockBeforeRestore,
                quantityAfter: restored.restoredStock,
                quantityAdded: restored.decreasedQuantity,
                triggerType: 'SIMULATE_SALE_REVERTED'
            },
            output: {
                description: `Đã khôi phục mô phỏng bán sản phẩm ${restored.productName}. Tồn kho cộng lại ${restored.decreasedQuantity}.`,
                restoredQuantity: restored.decreasedQuantity,
                finalStock: restored.restoredStock
            },
            creator: userId ? { connect: { id: userId } } : undefined
        }).catch(console.error);
        
        return restored;
    },

    async pendingRestore(userId: string) {
        const pendingRestores = await simulateSaleRepository.findPendingRestore(userId);
        return { pendingRestores };
    }
};
