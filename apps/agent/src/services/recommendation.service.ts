import { agentRepository, type AgentInventoryRecord } from '../repositories/agent.repository';
import { geminiService } from './gemini.service';
import { env } from '../config/env';
import { logger } from '../utils/logger';

const isSupplierActive = (supplier: { status?: string | null; deletedAt?: Date | null }): boolean =>
    supplier.status !== 'INACTIVE' && !supplier.deletedAt;

export const recommendationService = {
    async recommendForProduct(inventory: AgentInventoryRecord, triggerType: 'SCHEDULED' | 'MANUAL') {
        const product = inventory.product;

        // 1. Fetch supplier list from product.supplierProducts
        const supplierProducts = product.supplierProducts;
        if (supplierProducts.length === 0) {
            return {
                status: 'FAILED' as const,
                reason: 'Sản phẩm chưa được liên kết với nhà cung cấp.'
            };
        }

        const activeSupplierProducts = supplierProducts.filter((sp) => isSupplierActive(sp.supplier));
        if (activeSupplierProducts.length === 0) {
            return {
                status: 'FAILED' as const,
                reason: 'Nhà cung cấp của sản phẩm đang bị vô hiệu hóa.'
            };
        }

        // 2. Load sales history (7 days and 30 days)
        const salesData = await agentRepository.getSalesData(product.id);

        // 3. Map suppliers for selection
        const suppliers = activeSupplierProducts.map((sp) => {
            const spRaw = sp as any;
            const leadTime = Number(spRaw.leadTimeDays) || Number(spRaw.leadTime) || 3;
            return {
                supplierId: sp.supplierId,
                supplierName: sp.supplier.name,
                price: Number(sp.price),
                supplyPrice: Number(sp.price),
                leadTimeDays: leadTime,
                minOrderQuantity: Number(spRaw.minOrderQuantity) || 1,
                isPreferred: Boolean(spRaw.isPreferred),
                supplierProduct: sp
            };
        });

        // Sort suppliers:
        // 1. isPreferred desc (true before false)
        // 2. price asc
        // 3. leadTimeDays asc
        const sortedSuppliers = [...suppliers].sort((a, b) => {
            const prefA = a.isPreferred ? 1 : 0;
            const prefB = b.isPreferred ? 1 : 0;
            if (prefB !== prefA) return prefB - prefA;

            if (a.price !== b.price) return a.price - b.price;

            return a.leadTimeDays - b.leadTimeDays;
        });

        const bestSupplier = sortedSuppliers[0];

        // 4. Calculate rule-based quantity
        const dailySales = Math.max(salesData.salesVelocity7d, salesData.salesVelocity30d, 1);
        const safetyStock = inventory.minThreshold;
        const leadTime = bestSupplier.leadTimeDays;

        let recommendedQty = Math.ceil((dailySales * leadTime) + safetyStock - inventory.quantity);
        if (recommendedQty <= 0) {
            recommendedQty = inventory.minThreshold * 2;
        }

        recommendedQty = Math.max(recommendedQty, bestSupplier.minOrderQuantity || 1);

        const ruleBasedReasoning = `Sản phẩm có mức tồn hiện tại là ${inventory.quantity} so với ngưỡng an toàn là ${safetyStock}. Dựa trên tốc độ bán hàng hàng ngày ước lượng là ${dailySales.toFixed(2)} đơn vị/ngày và thời gian giao hàng của nhà cung cấp là ${leadTime} ngày, hệ thống đề xuất nhập thêm ${recommendedQty} đơn vị từ nhà cung cấp ${bestSupplier.supplierName}.`;

        const ruleBasedEmailDraft = `Kính gửi đối tác ${bestSupplier.supplierName},

        Chúng tôi cần đặt hàng bổ sung sản phẩm ${product.name} (${product.sku}):
        Số lượng: ${recommendedQty} ${inventory.unit}.
        
        Trân trọng,
        Cafe AI System`;

        // 5. Try Gemini if Key exists
        let geminiRecommendation = null;
        let fallbackUsed = false;
        let errorMessage: string | null = null;
        let geminiPrompt: string | null = null;
        let geminiResponse: string | null = null;

        const apiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY1 || process.env.GEMINI_API_KEY2 || process.env.GEMINI_API_KEY3;

        if (apiKey) {
            try {
                geminiPrompt = `You are an AI inventory reorder assistant for a cafe product inventory system.
                
                Analyze this product:
                - product name: ${product.name}
                - sku: ${product.sku}
                - current quantity: ${inventory.quantity}
                - minimum threshold: ${inventory.minThreshold}
                - sold last 7 days: ${salesData.totalSold7d}
                - sold last 30 days: ${salesData.totalSold30d}
                - sales velocity 7d (average per day): ${salesData.salesVelocity7d.toFixed(2)}
                - sales velocity 30d (average per day): ${salesData.salesVelocity30d.toFixed(2)}
                - suppliers list with id, name, price, min order quantity, lead time, isPreferred:
                ${suppliers.map((s) => `- id: ${s.supplierId}, name: ${s.supplierName}, price: ${s.price}, min order quantity: ${s.minOrderQuantity}, lead time: ${s.leadTimeDays} days, isPreferred: ${s.isPreferred}`).join('\n')}
                
                Return ONLY valid JSON:
                {
                  "recommendedQuantity": number,
                  "recommendedSupplierId": string,
                  "confidence": number,
                  "reasoning": string,
                  "emailDraft": string
                }
                
                Rules:
                - No markdown
                - No explanation outside JSON`;

                const result = await geminiService.getRecommendation(geminiPrompt);
                geminiResponse = JSON.stringify(result);

                // Validate Gemini response bounds
                const supplierExists = suppliers.some((s) => s.supplierId === result.recommendedSupplierId);
                const quantityValid = result.recommendedQuantity > 0 && result.recommendedQuantity < 10000;
                const confidenceValid = result.confidence >= 0 && result.confidence <= 1;
                const reasoningValid = typeof result.reasoning === 'string' && result.reasoning.trim().length > 0;

                if (supplierExists && quantityValid && confidenceValid && reasoningValid) {
                    geminiRecommendation = result;
                } else {
                    let failReason = '';
                    if (!supplierExists) failReason += `Supplier ID ${result.recommendedSupplierId} does not exist. `;
                    if (!quantityValid) failReason += `Quantity ${result.recommendedQuantity} is invalid. `;
                    if (!confidenceValid) failReason += `Confidence ${result.confidence} out of bounds. `;
                    if (!reasoningValid) failReason += 'Reasoning is empty. ';
                    throw new Error(`Gemini response validation failed: ${failReason}`);
                }
            } catch (err: any) {
                fallbackUsed = true;
                errorMessage = err.message || String(err);
                logger.warn(`Gemini recommendation failed for product ${product.name}. Fallback to rule-based logic: ${errorMessage}`);
            }
        } else {
            fallbackUsed = true;
            errorMessage = 'GEMINI_API_KEY is missing.';
        }

        const selectedRecommendation = geminiRecommendation || {
            recommendedQuantity: recommendedQty,
            recommendedSupplierId: bestSupplier.supplierId,
            confidence: 0.5,
            reasoning: `[Rule-Based Fallback] ${ruleBasedReasoning}`,
            emailDraft: ruleBasedEmailDraft
        };

        const chosenSupplier = suppliers.find((s) => s.supplierId === selectedRecommendation.recommendedSupplierId)!;

        return {
            status: 'SUCCESS' as const,
            recommendedQty: selectedRecommendation.recommendedQuantity,
            supplierProduct: chosenSupplier.supplierProduct,
            reasoning: selectedRecommendation.reasoning,
            emailDraft: selectedRecommendation.emailDraft,
            confidence: selectedRecommendation.confidence,
            fallbackUsed,
            errorMessage,
            geminiPrompt,
            geminiResponse,
            dailySales,
            salesVelocity7d: salesData.salesVelocity7d,
            salesVelocity30d: salesData.salesVelocity30d
        };
    }
};
    