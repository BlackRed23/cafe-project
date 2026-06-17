import { HttpError } from '../../common/http-error';
import { agentService } from '../agent/agent.service';
import { simulateSaleRepository } from './simulate-sale.repository';
import type { SimulateSaleInput } from './simulate-sale.validator';

const randomInt = (min: number, max: number): number => Math.floor(Math.random() * (max - min + 1)) + min;

export const simulateSaleService = {
    async run(input: SimulateSaleInput, userId: string) {
        if (input.productId) {
            const quantity = input.quantity ?? 0;
            const inventory = await simulateSaleRepository.findInventoryByProductId(input.productId);

            if (!inventory) {
                throw new HttpError(404, 'Inventory not found for selected product.');
            }

            if (!inventory.product.isActive) {
                throw new HttpError(400, 'Selected product is inactive.');
            }

            if (inventory.quantity < quantity) {
                throw new HttpError(400, `Not enough inventory for ${inventory.product.name}. Current stock: ${inventory.quantity}, requested: ${quantity}.`);
            }

            const affectedProduct = await simulateSaleRepository.applyProductSale(inventory, quantity, input.note ?? null, userId);
            if (!affectedProduct) {
                throw new HttpError(404, 'Inventory not found for selected product.');
            }

            const scan = await agentService.scanInventory({ productIds: [affectedProduct.productId], triggerType: 'SIMULATE_SALE' }, userId);

            return {
                affectedProduct,
                affectedProducts: [affectedProduct],
                productId: affectedProduct.productId,
                productName: affectedProduct.productName,
                stockBefore: affectedProduct.stockBefore,
                stockAfter: affectedProduct.stockAfter,
                decreasedQuantity: affectedProduct.decreasedQuantity,
                createdPurchaseRequests: scan.createdPurchaseRequests,
                agentLogs: scan.results,
                agentResults: scan.results
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
        const scan = await agentService.scanInventory({ productIds, triggerType: 'SIMULATE_SALE' }, userId);
        return { affectedProducts, createdPurchaseRequests: scan.createdPurchaseRequests, agentLogs: scan.results, agentResults: scan.results };
    }
};
