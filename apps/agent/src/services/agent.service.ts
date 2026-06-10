import { ACTIVE_PURCHASE_REQUEST_MESSAGE, agentRepository } from '../repositories/agent.repository';
import { recommendationService } from './recommendation.service';
import { logger } from '../utils/logger';

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
export const agentService = {
    async runScan(triggerType: 'SCHEDULED' | 'MANUAL' = 'SCHEDULED') {
        logger.info(`Starting inventory scan. Trigger: ${triggerType}`);
        logger.info(`[AI_DEBUG] DATABASE_URL source check: ${maskDatabaseUrl(process.env.DATABASE_URL)}`);

        // 1. Find the first ADMIN user to be designated as PR creator
        const admin = await agentRepository.findFirstAdmin();
        if (!admin) {
            logger.error('âŒ No active ADMIN user found in database. Scan aborted.');
            await agentRepository.createLog({
                action: 'SCAN_INVENTORY',
                result: 'FAILED',
                input: JSON.stringify({ triggerType }),
                reasoning: 'No active ADMIN user found in database to authorize the PurchaseRequest.',
                error_message: 'No active ADMIN user found.',
                fallback_used: false
            });
            return;
        }

        // 2. Load all active inventories
        const inventories = await agentRepository.findInventories();
        logger.info(`Loaded ${inventories.length} inventories.`);

        for (const inventory of inventories) {
            const product = inventory.product;
            const currentQuantity = inventory.quantity;
            const minThreshold = inventory.minThreshold;
            logger.info(`[AI_DEBUG] Scanning product: ${JSON.stringify({ productId: product.id, productName: product.name, sku: product.sku })}`);
            logger.info(`[AI_DEBUG] Inventory: ${JSON.stringify({ quantity: currentQuantity, minThreshold })}`);
            logger.info(`[AI_DEBUG] SupplierProducts count: ${product.supplierProducts.length}`);
            for (const sp of product.supplierProducts) {
                logger.info(`[AI_DEBUG] SupplierProduct: ${JSON.stringify({
                    supplierId: sp.supplierId,
                    supplierName: sp.supplier.name,
                    supplierStatus: sp.supplier.status,
                    supplierDeletedAt: sp.supplier.deletedAt,
                    supplyPrice: Number(sp.price),
                    MOQ: sp.minOrderQuantity,
                    leadTimeDays: sp.leadTimeDays,
                    isPreferred: sp.isPreferred
                })}`);
            }

            // 3. Low stock condition: quantity <= minThreshold
            const isLowStock = currentQuantity <= minThreshold;
            if (!isLowStock) {
                const reasoning = 'Sản phẩm chưa dưới ngưỡng tồn kho.';
                logger.info(`[AI_DEBUG] Product skipped: ${JSON.stringify({ productId: product.id, productName: product.name, reason: reasoning })}`);
                logger.debug(`Skipped product ${product.name} (${product.sku}): current quantity ${currentQuantity} > minThreshold ${minThreshold}.`);
                if (process.env.DEBUG_MODE === 'true') {
                    await agentRepository.createLog({
                        action: 'SCAN_INVENTORY',
                        result: 'SKIPPED',
                        input: JSON.stringify({ triggerType, inventoryId: inventory.id, currentQty: currentQuantity, minThreshold }),
                        reasoning,
                        fallback_used: false,
                        reference_type: 'Inventory',
                        reference_id: inventory.id
                    });
                }
                continue;
            }

            // 4. Check duplicate active purchase request
            const hasDuplicate = await agentRepository.hasOpenPurchaseRequest(product.id, inventory.id);
            if (hasDuplicate) {
                const reasoning = `Sản phẩm ${product.name} đã có yêu cầu nhập hàng đang xử lý.`;
                logger.info(`[AI_DEBUG] Product skipped: ${JSON.stringify({ productId: product.id, productName: product.name, reason: reasoning })}`);
                logger.info(`Skipped product ${product.name} (${product.sku}): Active purchase request already exists (PENDING/APPROVED/SENT).`);
                await agentRepository.createLog({
                    action: 'SCAN_INVENTORY',
                    result: 'SKIPPED',
                    input: JSON.stringify({ triggerType, inventoryId: inventory.id, currentQty: currentQuantity, minThreshold }),
                    reasoning,
                    fallback_used: false,
                    reference_type: 'Inventory',
                    reference_id: inventory.id
                });
                continue;
            }

            // 5. Select best supplier and calculate recommendations
            try {
                const recommendationResult = await recommendationService.recommendForProduct(inventory, triggerType);

                if (recommendationResult.status === 'FAILED') {
                    logger.warn(`Failed recommendation for product ${product.name}: ${recommendationResult.reason}`);
                    await agentRepository.createLog({
                        action: 'SCAN_INVENTORY',
                        result: 'FAILED',
                        input: JSON.stringify({ triggerType, inventoryId: inventory.id, currentQty: currentQuantity, minThreshold }),
                        reasoning: recommendationResult.reason,
                        error_message: recommendationResult.reason,
                        fallback_used: false,
                        reference_type: 'Inventory',
                        reference_id: inventory.id
                    });
                    continue;
                }

                const {
                    recommendedQty,
                    supplierProduct,
                    reasoning,
                    emailDraft,
                    confidence,
                    fallbackUsed,
                    errorMessage,
                    geminiPrompt,
                    geminiResponse,
                    dailySales
                } = recommendationResult;

                // 6. Create Purchase Request
                const pr = await agentRepository.createPurchaseRequest({
                    productId: product.id,
                    inventoryId: inventory.id,
                    supplierId: supplierProduct.supplierId,
                    quantity: recommendedQty,
                    unitPrice: Number(supplierProduct.price),
                    reasoning,
                    emailDraft,
                    requestedBy: admin.id,
                    triggerType,
                    fallbackUsed,
                    errorMessage,
                    confidence,
                    geminiPrompt,
                    geminiResponse,
                    currentQty: currentQuantity,
                    minThreshold,
                    salesVelocity: dailySales
                });

                logger.info(`Successfully created PENDING purchase request ${pr.requestNumber} for product ${product.name} (${recommendedQty} units).`);
            } catch (err: any) {
                if (err?.message === ACTIVE_PURCHASE_REQUEST_MESSAGE) {
                    logger.info(`Skipped product ${product.name} (${product.sku}): Active purchase request already exists.`);
                    await agentRepository.createLog({
                        action: 'SCAN_INVENTORY',
                        result: 'SKIPPED_DUPLICATE',
                        input: JSON.stringify({ triggerType, inventoryId: inventory.id, currentQty: currentQuantity, minThreshold }),
                        output: JSON.stringify({ skipped: true, reason: 'ACTIVE_PR_EXISTS' }),
                        reasoning: ACTIVE_PURCHASE_REQUEST_MESSAGE,
                        fallback_used: false,
                        reference_type: 'Inventory',
                        reference_id: inventory.id
                    });
                    continue;
                }
                logger.error(`Error processing inventory ${inventory.id} for product ${product.name}:`, err);
                await agentRepository.createLog({
                    action: 'SCAN_INVENTORY',
                    result: 'FAILED',
                    input: JSON.stringify({ triggerType, inventoryId: inventory.id, currentQty: currentQuantity, minThreshold }),
                    reasoning: `Transaction or recommendation failed: ${err.message || err}`,
                    error_message: err.message || String(err),
                    fallback_used: false,
                    reference_type: 'Inventory',
                    reference_id: inventory.id
                });
            }
        }

        logger.info('Inventory scan completed.');
    }
};


