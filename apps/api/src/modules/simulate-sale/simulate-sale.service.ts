import { HttpError } from '../../common/http-error';
import { agentService } from '../agent/agent.service';
import { simulateSaleRepository } from './simulate-sale.repository';
import type { SimulateSaleInput } from './simulate-sale.validator';

const randomInt = (min: number, max: number): number => Math.floor(Math.random() * (max - min + 1)) + min;

export const simulateSaleService = {
    async run(input: SimulateSaleInput, userId: string) {
        const inventories = await simulateSaleRepository.findInventories();
        if (inventories.length === 0) throw new HttpError(404, 'No inventory found.');
        const shuffled = [...inventories].sort(() => Math.random() - 0.5);
        const selected = shuffled.slice(0, Math.min(input.productCount, shuffled.length));
        const plans = selected.map((inventory) => ({ inventory, decrease: randomInt(input.minDecrease, input.maxDecrease) }));
        const affectedProducts = await simulateSaleRepository.applySale(plans, input.note ?? null, userId);
        const productIds = affectedProducts.map((item) => item.productId);
        const scan = await agentService.scanInventory({ productIds, triggerType: 'SIMULATE_SALE' }, userId);
        return { affectedProducts, createdPurchaseRequests: scan.createdPurchaseRequests, agentResults: scan.results };
    }
};