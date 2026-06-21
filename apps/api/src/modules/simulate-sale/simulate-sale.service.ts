import { HttpError } from '../../common/http-error';
import { simulateSaleRepository } from './simulate-sale.repository';
import type { SimulateSaleInput } from './simulate-sale.validator';
import { scanInventoryViaAgentService } from '../agent/agent.client';

const randomInt = (min: number, max: number): number => Math.floor(Math.random() * (max - min + 1)) + min;

const runAgentScan = async (input: { productIds: string[]; userId: string; sourceId?: string }) => {
    try {
        const scan = await scanInventoryViaAgentService({
            productIds: input.productIds,
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
        if (input.productId) {
            const inventory = await simulateSaleRepository.findInventoryByProductId(input.productId);

            if (!inventory) {
                throw new HttpError(404, 'Inventory not found for selected product.');
            }

            if (!inventory.product.isActive) {
                throw new HttpError(400, 'Selected product is inactive.');
            }

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

            if (inventory.quantity < quantity) {
                let unit = inventory.product?.unit || 'đơn vị';
                if (unit.toLowerCase() === 'ly') unit = 'đơn vị';
                throw new HttpError(400, `Không đủ tồn kho để mô phỏng bán hàng. Tồn kho hiện tại: ${inventory.quantity} ${unit}, yêu cầu: ${quantity} ${unit}.`);
            }

            const affectedProduct = await simulateSaleRepository.applyProductSale(inventory, quantity, input.note ?? null, userId);
            if (!affectedProduct) {
                throw new HttpError(404, 'Inventory not found for selected product.');
            }

            const scan = await runAgentScan({
                productIds: [affectedProduct.productId],
                sourceId: affectedProduct.transactionId,
                userId
            });

            return {
                affectedProduct,
                affectedProducts: [affectedProduct],
                inventoryId: affectedProduct.inventoryId,
                transactionId: affectedProduct.transactionId,
                productId: affectedProduct.productId,
                productName: affectedProduct.productName,
                stockBefore: affectedProduct.stockBefore,
                stockAfter: affectedProduct.stockAfter,
                decreasedQuantity: affectedProduct.decreasedQuantity,
                createdPurchaseRequests: scan.createdPurchaseRequests,
                agentLogs: scan.results,
                agentResults: scan.results,
                agentWarning: scan.agentWarning
            };
        }

        const inventories = await simulateSaleRepository.findInventories();
        if (inventories.length === 0) throw new HttpError(404, 'No inventory found.');
        const productCount = input.productCount ?? 1;
        const minDecrease = input.minDecrease ?? 1;
        const maxDecrease = input.maxDecrease ?? minDecrease;
        const shuffled = [...inventories].sort(() => Math.random() - 0.5);
        const selected = shuffled.slice(0, Math.min(productCount, shuffled.length));
        const plans = selected.map((inventory) => ({ inventory, decrease: randomInt(minDecrease, maxDecrease) }));
        const affectedProducts = await simulateSaleRepository.applySale(plans, input.note ?? null, userId);
        const productIds = affectedProducts.map((item) => item.productId);
        const scan = await runAgentScan({
            productIds,
            userId
        });
        return { affectedProducts, createdPurchaseRequests: scan.createdPurchaseRequests, agentLogs: scan.results, agentResults: scan.results, agentWarning: scan.agentWarning };
    },

    async restore(transactionId: string, userId: string) {
        if (!transactionId?.trim()) {
            throw new HttpError(400, 'Simulation transaction id is required.');
        }

        return simulateSaleRepository.restoreSale(transactionId.trim(), userId);
    },

    async pendingRestore(userId: string) {
        const pendingRestore = await simulateSaleRepository.findPendingRestore(userId);
        return { pendingRestore };
    }
};
