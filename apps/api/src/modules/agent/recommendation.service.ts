import { prisma } from '../../common/prisma';
import { OrderStatus } from '@cafe-project/database';
import { geminiService } from './gemini.service';
import { agentRepository } from './agent.repository';
import { ACTIVE_PURCHASE_REQUEST_MESSAGE } from '../purchase/purchase.repository';

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

export const recommendationService = {
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

        const totalSold7d = items7d.reduce((sum, item) => sum + item.quantity, 0);
        const totalSold30d = items30d.reduce((sum, item) => sum + item.quantity, 0);

        return {
            totalSold7d,
            totalSold30d,
            salesVelocity7d: totalSold7d / 7,
            salesVelocity30d: totalSold30d / 30
        };
    },

    async generateForProduct(productId: string, force = false, userId: string) {
        console.info('[AI_DEBUG] DATABASE_URL source check:', maskDatabaseUrl(process.env.DATABASE_URL));

        const product = await prisma.product.findUnique({
            where: { id: productId, isActive: true },
            include: {
                inventory: true,
                category: true,
                supplierProducts: {
                    include: { supplier: true }
                }
            }
        });

        if (!product || !product.inventory) {
            console.info('[AI_DEBUG] Product skipped:', { productId, reason: 'Product or inventory not found.' });
            return { skipped: true, reason: 'Product or inventory not found.' };
        }

        const inventory = product.inventory;
        console.info('[AI_DEBUG] Scanning product:', { productId: product.id, productName: product.name, sku: product.sku, force });
        console.info('[AI_DEBUG] Inventory:', { quantity: inventory.quantity, minThreshold: inventory.minThreshold });
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

        if (inventory.quantity > inventory.minThreshold) {
            const reasoning = 'Sản phẩm chưa dưới ngưỡng tồn kho.';
            console.info('[AI_DEBUG] Product skipped:', { productId, productName: product.name, reason: reasoning });
            const log = await agentRepository.createLog({
                action: 'RECOMMEND_REORDER_SKIP_THRESHOLD',
                input: JSON.stringify({ productId, force }),
                output: JSON.stringify({ skipped: true, reason: 'ABOVE_THRESHOLD' }),
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
            const reasoning = ACTIVE_PURCHASE_REQUEST_MESSAGE;
            console.info('[AI_DEBUG] Product skipped:', { productId, productName: product.name, reason: reasoning });
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
            const reasoning = 'Sản phẩm chưa được liên kết với nhà cung cấp.';
            console.info('[AI_DEBUG] Product skipped:', { productId, productName: product.name, reason: reasoning });
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
            const reasoning = 'Nhà cung cấp của sản phẩm đang bị vô hiệu hóa.';
            console.info('[AI_DEBUG] Product skipped:', { productId, productName: product.name, reason: reasoning });
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
                isPreferred: Boolean(spRaw.isPreferred)
            };
        });

        const sales = await this.getSalesData(productId);

        let aiRecommendation = null;
        let fallbackUsed = false;
        let errorMessage = null;

        if (process.env.GEMINI_API_KEY) {
            try {
                const prompt = this.buildPrompt(product, inventory, sales, suppliers);
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
            errorMessage = 'GEMINI_API_KEY is missing. Falling back to rule-based logic.';
        }

        if (fallbackUsed || !aiRecommendation) {
            const ruleBased = this.calculateRuleBased(inventory, sales, suppliers);
            aiRecommendation = {
                recommendedQuantity: ruleBased.recommendedQuantity,
                recommendedSupplierId: ruleBased.supplier.supplierId,
                confidence: 0.5,
                reasoning: `[Rule-Based Fallback] ${ruleBased.reasoning}`,
                emailDraft: `Kính gửi đối tác ${ruleBased.supplier.supplierName},\n\nChúng tôi cần đặt hàng bổ sung sản phẩm ${product.name} (${product.sku}):\nSố lượng: ${ruleBased.recommendedQuantity} ${inventory.unit}.\n\nTrân trọng,\nCafe AI System`
            };
        }

        const selectedSupplier = suppliers.find((s) => s.supplierId === aiRecommendation.recommendedSupplierId)!;

        const outputPayload = {
            productId,
            productName: product.name,
            sku: product.sku,
            currentQuantity: inventory.quantity,
            minThreshold: inventory.minThreshold,
            salesVelocity7d: sales.salesVelocity7d,
            salesVelocity30d: sales.salesVelocity30d,
            recommendedQuantity: aiRecommendation.recommendedQuantity,
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

    calculateRuleBased(inventory: any, sales: any, suppliers: any[]) {
        const dailySales = Math.max(sales.salesVelocity7d, sales.salesVelocity30d, 1);
        const sorted = [...suppliers].sort((a, b) => {
            const prefA = a.isPreferred ? 1 : 0;
            const prefB = b.isPreferred ? 1 : 0;
            if (prefB !== prefA) return prefB - prefA;
            if (a.price !== b.price) return a.price - b.price;
            const leadA = a.leadTimeDays || 3;
            const leadB = b.leadTimeDays || 3;
            return leadA - leadB;
        });

        const selectedSupplier = sorted[0]!;
        const leadTime = selectedSupplier.leadTimeDays || 3;
        const safetyStock = inventory.minThreshold;
        const recommendedQuantity = Math.ceil((dailySales * leadTime) + safetyStock - inventory.quantity);
        const finalQuantity = Math.max(recommendedQuantity, selectedSupplier.minOrderQuantity || 1);
        const reasoning = `Sản phẩm có mức tồn hiện tại là ${inventory.quantity} so với ngưỡng an toàn là ${safetyStock}. Dựa trên tốc độ bán hàng hàng ngày ước lượng là ${dailySales.toFixed(2)} đơn vị/ngày và thời gian giao hàng của nhà cung cấp là ${leadTime} ngày, hệ thống đề xuất nhập thêm ${finalQuantity} đơn vị từ nhà cung cấp ${selectedSupplier.supplierName}.`;

        return {
            recommendedQuantity: finalQuantity,
            supplier: selectedSupplier,
            reasoning
        };
    },

    buildPrompt(product: any, inventory: any, sales: any, suppliers: any[]): string {
        return `You are an AI inventory reorder assistant for a cafe product inventory system.
        
        Analyze this product:
        
        Product:
        - name: ${product.name}
        - sku: ${product.sku}
        - category: ${product.category?.name || 'Uncategorized'}
        - current quantity: ${inventory.quantity}
        - min threshold: ${inventory.minThreshold}
        
        Sales:
        - sold in last 7 days: ${sales.totalSold7d}
        - sold in last 30 days: ${sales.totalSold30d}
        - sales velocity 7d (average per day): ${sales.salesVelocity7d.toFixed(2)}
        - sales velocity 30d (average per day): ${sales.salesVelocity30d.toFixed(2)}
        
        Suppliers:
        ${suppliers.map((s) => `- supplier id: ${s.supplierId}
          supplier name: ${s.supplierName}
          supply price: ${s.supplyPrice}
          min order quantity: ${s.minOrderQuantity}
          lead time: ${s.leadTimeDays} days
          is preferred: ${s.isPreferred}`).join('\n')}
        
        Return ONLY valid JSON:
        
        {
          "recommendedQuantity": number,
          "recommendedSupplierId": string,
          "confidence": number,
          "reasoning": string,
          "emailDraft": string
        }
        
        Do not include markdown.
        Do not include explanation outside JSON.`;
            }
        };
