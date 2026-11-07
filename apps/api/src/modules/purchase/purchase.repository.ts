import {
    GoodsReceiptStatus,
    InventoryTransactionType,
    Prisma,
    PurchaseRequestStatus
} from '@cafe-project/database';
import { prisma } from '@cafe-project/database';
import {
    calculateMovingAverageCost,
    roundCost4,
    roundMoney2,
    roundQty3,
    toDecimal
} from '../../common/ingredient-cost.utils';
import { convertToBaseQuantity } from '../../common/unit-conversion';
import { recalculateCostsForIngredient } from '../recipe/recipe.service';
import type {
    CreatePurchaseRequestInput,
    PurchaseRequestFiltersInput,
    ReceivePurchaseRequestInput
} from './purchase.validator';

export const purchaseInclude = {
    supplier: { include: { products: true, ingredients: true } },
    requester: { select: { id: true, name: true, email: true } },
    approver: { select: { id: true, name: true, email: true } },
    items: {
        include: {
            inventory: { include: { product: { include: { category: true } } } },
            product: true,
            ingredient: { include: { category: true } }
        }
    },
    receipts: {
        orderBy: { receivedAt: 'desc' }
    }
} satisfies Prisma.PurchaseRequestInclude;

export type PurchaseRequestRecord = Prisma.PurchaseRequestGetPayload<{ include: typeof purchaseInclude }>;
export const ACTIVE_PURCHASE_REQUEST_STATUSES = [
    PurchaseRequestStatus.PENDING,
    PurchaseRequestStatus.APPROVED,
    PurchaseRequestStatus.SENT
] as const;
export const ACTIVE_PURCHASE_REQUEST_MESSAGE = 'Sản phẩm/Nguyên liệu này đã có yêu cầu nhập hàng đang xử lý.';

export const purchaseRepository = {
    async findMany(filters: PurchaseRequestFiltersInput = {}): Promise<PurchaseRequestRecord[]> {
        return prisma.purchaseRequest.findMany({
            where: {
                ...(filters.status ? { status: filters.status } : {}),
                ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
                ...(filters.aiGenerated !== undefined ? { aiGenerated: filters.aiGenerated } : {})
            },
            include: purchaseInclude,
            orderBy: { createdAt: 'desc' }
        });
    },

    async findById(id: string): Promise<PurchaseRequestRecord | null> {
        return prisma.purchaseRequest.findUnique({ where: { id }, include: purchaseInclude });
    },

    async supplierExists(supplierId: string): Promise<boolean> {
        return Boolean(
            await prisma.supplier.findFirst({
                where: { id: supplierId, status: { not: 'INACTIVE' }, deletedAt: null },
                select: { id: true }
            })
        );
    },

    async inventoriesByIds(ids: string[]) {
        return prisma.inventory.findMany({
            where: { id: { in: ids }, product: { isActive: true } },
            include: { product: true }
        });
    },

    async hasActiveRequestForInventory(inventoryId: string): Promise<boolean> {
        const item = await prisma.purchaseRequestItem.findFirst({
            where: { inventoryId, request: { status: { in: [...ACTIVE_PURCHASE_REQUEST_STATUSES] } } },
            select: { id: true }
        });
        return Boolean(item);
    },

    async hasActiveRequestForIngredient(ingredientId: string): Promise<boolean> {
        const item = await prisma.purchaseRequestItem.findFirst({
            where: { ingredientId, request: { status: { in: [...ACTIVE_PURCHASE_REQUEST_STATUSES] } } },
            select: { id: true }
        });
        return Boolean(item);
    },

    async create(input: CreatePurchaseRequestInput, userId: string, requestNumber: string): Promise<PurchaseRequestRecord> {
        return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const inventoryIds = input.items.map((i) => i.inventoryId).filter((id): id is string => Boolean(id));
            const ingredientIds = input.items.map((i) => i.ingredientId).filter((id): id is string => Boolean(id));

            const inventories = inventoryIds.length > 0
                ? await tx.inventory.findMany({
                      where: { id: { in: inventoryIds }, product: { isActive: true } },
                      include: { product: true }
                  })
                : [];
            const inventoryById = new Map(inventories.map((inv) => [inv.id, inv]));

            const ingredients = ingredientIds.length > 0
                ? await tx.ingredient.findMany({
                      where: { id: { in: ingredientIds }, isActive: true, deletedAt: null }
                  })
                : [];
            const ingredientById = new Map(ingredients.map((ing) => [ing.id, ing]));

            const supplierIngredients = ingredientIds.length > 0
                ? await tx.supplierIngredient.findMany({
                      where: { supplierId: input.supplierId, ingredientId: { in: ingredientIds } }
                  })
                : [];
            const supplierIngredientByIngId = new Map(supplierIngredients.map((si) => [si.ingredientId, si]));

            if (inventoryIds.length > 0) {
                const activeItem = await tx.purchaseRequestItem.findFirst({
                    where: {
                        inventoryId: { in: inventoryIds },
                        request: { status: { in: [...ACTIVE_PURCHASE_REQUEST_STATUSES] } }
                    },
                    select: { id: true }
                });
                if (activeItem) throw new Error(ACTIVE_PURCHASE_REQUEST_MESSAGE);
            }

            if (ingredientIds.length > 0) {
                const activeIngItem = await tx.purchaseRequestItem.findFirst({
                    where: {
                        ingredientId: { in: ingredientIds },
                        request: { status: { in: [...ACTIVE_PURCHASE_REQUEST_STATUSES] } }
                    },
                    select: { id: true }
                });
                if (activeIngItem) throw new Error(ACTIVE_PURCHASE_REQUEST_MESSAGE);
            }

            let totalAmount = new Prisma.Decimal(0);
            const createItemsData: Prisma.PurchaseRequestItemCreateWithoutRequestInput[] = [];

            for (const item of input.items) {
                if (item.ingredientId) {
                    const ing = ingredientById.get(item.ingredientId);
                    if (!ing) throw new Error(`Ingredient not found: ${item.ingredientId}`);
                    const supIng = supplierIngredientByIngId.get(ing.id);

                    let resolvedUnitPrice: Prisma.Decimal;
                    if (item.unitPrice !== undefined && item.unitPrice !== null) {
                        resolvedUnitPrice = roundMoney2(toDecimal(item.unitPrice));
                    } else if (supIng) {
                        resolvedUnitPrice = roundMoney2(toDecimal(supIng.pricePerBaseUnit).mul(toDecimal(supIng.conversionQuantity)));
                    } else {
                        resolvedUnitPrice = roundMoney2(toDecimal(ing.costPerBaseUnit));
                    }

                    totalAmount = totalAmount.add(resolvedUnitPrice.mul(item.quantity));
                    createItemsData.push({
                        ingredient: { connect: { id: ing.id } },
                        quantity: item.quantity,
                        unitPrice: resolvedUnitPrice,
                        notes: item.notes ?? null
                    });
                } else if (item.inventoryId) {
                    const inventory = inventoryById.get(item.inventoryId);
                    if (!inventory) throw new Error(`Inventory not found: ${item.inventoryId}`);
                    const unitPrice = roundMoney2(toDecimal(item.unitPrice ?? 0));
                    totalAmount = totalAmount.add(unitPrice.mul(item.quantity));
                    createItemsData.push({
                        inventory: { connect: { id: inventory.id } },
                        product: { connect: { id: inventory.productId } },
                        quantity: item.quantity,
                        unitPrice,
                        notes: item.notes ?? null
                    });
                }
            }

            return tx.purchaseRequest.create({
                data: {
                    requestNumber,
                    supplierId: input.supplierId,
                    notes: input.notes,
                    aiGenerated: input.aiGenerated,
                    totalAmount: roundMoney2(totalAmount),
                    requestedBy: userId,
                    status: PurchaseRequestStatus.PENDING,
                    items: {
                        create: createItemsData
                    }
                },
                include: purchaseInclude
            });
        });
    },

    async updateStatus(id: string, data: Prisma.PurchaseRequestUpdateInput): Promise<PurchaseRequestRecord> {
        return prisma.purchaseRequest.update({ where: { id }, data, include: purchaseInclude });
    },

    async receive(request: PurchaseRequestRecord, input: ReceivePurchaseRequestInput, userId: string): Promise<PurchaseRequestRecord> {
        if (input.idempotencyKey) {
            const existingReceipt = await prisma.goodsReceipt.findUnique({
                where: { idempotencyKey: input.idempotencyKey }
            });
            if (existingReceipt && existingReceipt.purchaseRequestId === request.id) {
                const existingPr = await prisma.purchaseRequest.findUnique({
                    where: { id: request.id },
                    include: purchaseInclude
                });
                if (existingPr) return existingPr;
            }
        }

        let retries = 0;
        let lastError: any = null;

        while (retries < 3) {
            try {
                return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
                    if (input.idempotencyKey) {
                        const existingReceipt = await tx.goodsReceipt.findUnique({
                            where: { idempotencyKey: input.idempotencyKey }
                        });
                        if (existingReceipt && existingReceipt.purchaseRequestId === request.id) {
                            const existingPr = await tx.purchaseRequest.findUnique({
                                where: { id: request.id },
                                include: purchaseInclude
                            });
                            if (existingPr) return existingPr;
                        }
                    }

                    const currentRequest = await tx.purchaseRequest.findUnique({
                        where: { id: request.id },
                        select: { status: true, emailSentAt: true }
                    });
                    if (
                        currentRequest?.status === PurchaseRequestStatus.RECEIVED ||
                        currentRequest?.status === PurchaseRequestStatus.COMPLETED
                    ) {
                        throw new Error('Yêu cầu nhập hàng này đã được nhận đủ trước đó, không thể cộng kho lần nữa.');
                    }
                    if (currentRequest?.status !== PurchaseRequestStatus.SENT && !currentRequest?.emailSentAt) {
                        throw new Error('Chỉ có thể nhận hàng sau khi đã gửi email đặt hàng cho nhà cung cấp.');
                    }

                    const receiptNumber = `GR-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
                    const goodsReceipt = await tx.goodsReceipt.create({
                        data: {
                            receiptNumber,
                            status: GoodsReceiptStatus.CONFIRMED,
                            purchaseRequestId: request.id,
                            receivedBy: userId,
                            supplierInvoiceNo: input.supplierInvoiceNo?.trim() || null,
                            note: input.note?.trim() || null,
                            idempotencyKey: input.idempotencyKey?.trim() || null
                        }
                    });

                    let totalReceivedAmountToIncrement = new Prisma.Decimal(0);
                    const batchCounters: Record<string, number> = {};
                    const affectedIngredientIds = new Set<string>();

                    for (const receiveItem of input.items) {
                        if (receiveItem.receivedQuantity <= 0) {
                            throw new Error('Số lượng thực nhận phải lớn hơn 0.');
                        }
                        const requestItem = request.items.find((item) => item.id === receiveItem.purchaseRequestItemId);
                        if (!requestItem) throw new Error('Purchase request item not found.');

                        const effectiveUnitPrice = receiveItem.unitPrice !== undefined
                            ? toDecimal(receiveItem.unitPrice)
                            : toDecimal(requestItem.unitPrice ?? 0);

                        totalReceivedAmountToIncrement = totalReceivedAmountToIncrement.add(
                            effectiveUnitPrice.mul(receiveItem.receivedQuantity)
                        );

                        const currentQuantityReceived = requestItem.quantityReceived || 0;
                        const remaining = requestItem.quantity - currentQuantityReceived;

                        if (receiveItem.receivedQuantity > remaining) {
                            throw new Error('Số lượng nhận không được vượt quá số lượng còn lại của yêu cầu.');
                        }

                        await tx.purchaseRequestItem.update({
                            where: { id: requestItem.id },
                            data: {
                                quantityReceived: { increment: receiveItem.receivedQuantity },
                                ...(receiveItem.unitPrice !== undefined ? { unitPrice: roundMoney2(effectiveUnitPrice) } : {})
                            }
                        });

                        // Luồng Nguyên liệu mới (Ingredient)
                        if (requestItem.ingredientId && requestItem.ingredient) {
                            const ingId = requestItem.ingredientId;
                            await tx.$queryRaw`SELECT "id" FROM "Ingredient" WHERE "id" = ${ingId} FOR UPDATE`;
                            const currentIng = await tx.ingredient.findUnique({ where: { id: ingId } });
                            if (!currentIng) throw new Error('Không tìm thấy nguyên liệu.');

                            const supIng = request.supplier.ingredients.find((si) => si.ingredientId === ingId);
                            const conversionQty = supIng
                                ? toDecimal(supIng.conversionQuantity, 1)
                                : new Prisma.Decimal(1);
                            const receivedUnit = supIng?.purchaseUnit || currentIng.baseUnit;
                            const targetUnit = supIng?.conversionTargetUnit || currentIng.baseUnit;

                            // Quy đổi về baseUnit của Ingredient
                            const singlePurchaseUnitInBase = convertToBaseQuantity(
                                conversionQty,
                                targetUnit,
                                currentIng.baseUnit
                            );
                            const totalImportBaseQty = roundQty3(
                                singlePurchaseUnitInBase.mul(receiveItem.receivedQuantity)
                            );

                            // Mục 2.2: unitCost = giá mua 1 đơn vị đặt / số lượng base nhận được trên 1 đơn vị đặt
                            let unitCostPerBase: Prisma.Decimal;
                            if (effectiveUnitPrice.gt(0) && singlePurchaseUnitInBase.gt(0)) {
                                unitCostPerBase = roundCost4(effectiveUnitPrice.div(singlePurchaseUnitInBase));
                            } else if (supIng && toDecimal(supIng.pricePerBaseUnit).gt(0)) {
                                unitCostPerBase = roundCost4(toDecimal(supIng.pricePerBaseUnit));
                            } else {
                                unitCostPerBase = roundCost4(toDecimal(currentIng.costPerBaseUnit));
                            }

                            const newMovingAvg = calculateMovingAverageCost(
                                currentIng.quantity,
                                currentIng.costPerBaseUnit,
                                totalImportBaseQty,
                                unitCostPerBase
                            );

                            const batchesToCreate =
                                receiveItem.batches && receiveItem.batches.length > 0
                                    ? receiveItem.batches
                                    : [
                                          {
                                              batchCode: null,
                                              expirationDate: currentIng.shelfLifeDays
                                                  ? new Date(Date.now() + currentIng.shelfLifeDays * 86400000).toISOString()
                                                  : new Date(Date.now() + 180 * 86400000).toISOString(),
                                              quantity: receiveItem.receivedQuantity
                                          }
                                      ];

                            for (const b of batchesToCreate) {
                                const batchBaseQty = roundQty3(singlePurchaseUnitInBase.mul(b.quantity));
                                const batchTotalCost = roundMoney2(batchBaseQty.mul(unitCostPerBase));
                                const batchCode =
                                    b.batchCode?.trim() ||
                                    `${currentIng.sku}-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 9000 + 1000)}`;

                                const createdBatch = await tx.ingredientBatch.create({
                                    data: {
                                        ingredientId: currentIng.id,
                                        batchCode,
                                        quantityInitial: batchBaseQty,
                                        quantityRemaining: batchBaseQty,
                                        unitCost: unitCostPerBase,
                                        expirationDate: b.expirationDate ? new Date(b.expirationDate) : null,
                                        supplierId: request.supplierId,
                                        goodsReceiptId: goodsReceipt.id,
                                        purchaseRequestItemId: requestItem.id,
                                        receivedQty: roundQty3(toDecimal(b.quantity)),
                                        receivedUnit,
                                        note: input.note?.trim() || null
                                    }
                                });

                                await tx.inventoryTransaction.create({
                                    data: {
                                        ingredientId: currentIng.id,
                                        batchId: createdBatch.id,
                                        type: InventoryTransactionType.IMPORT,
                                        quantity: batchBaseQty,
                                        unitCost: unitCostPerBase,
                                        totalCost: batchTotalCost,
                                        referenceType: 'GoodsReceipt',
                                        referenceId: goodsReceipt.id,
                                        performedBy: userId,
                                        reason:
                                            input.note ??
                                            `Nhập lô nguyên liệu ${batchCode} từ yêu cầu ${request.requestNumber}`
                                    }
                                });
                            }

                            await tx.ingredient.update({
                                where: { id: currentIng.id },
                                data: {
                                    quantity: { increment: totalImportBaseQty },
                                    costPerBaseUnit: newMovingAvg,
                                    rowVersion: { increment: 1 }
                                }
                            });

                            affectedIngredientIds.add(currentIng.id);
                            continue;
                        }

                        // Luồng Inventory cũ (Product)
                        if (!requestItem.inventoryId) {
                            throw new Error('Purchase request item thiếu thông tin kho hoặc nguyên liệu.');
                        }
                        const inventory = await tx.inventory.findUnique({ where: { id: requestItem.inventoryId } });
                        if (!inventory) throw new Error('Inventory not found.');

                        await tx.inventory.update({
                            where: { id: inventory.id },
                            data: { quantity: { increment: receiveItem.receivedQuantity } }
                        });

                        const unitCostLegacy = roundCost4(effectiveUnitPrice);

                        if (receiveItem.batches && receiveItem.batches.length > 0) {
                            for (const b of receiveItem.batches) {
                                let batchCode = b.batchCode;
                                if (!batchCode) {
                                    const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
                                    const prefix = `BATCH_${dateStr}_`;

                                    if (batchCounters[inventory.id] === undefined) {
                                        const existingBatches = await tx.inventoryBatch.findMany({
                                            where: { inventoryId: inventory.id, batchCode: { startsWith: prefix } },
                                            select: { batchCode: true }
                                        });
                                        let maxNum = 0;
                                        for (const eb of existingBatches) {
                                            const parts = eb.batchCode.split('_');
                                            if (parts.length >= 3) {
                                                const num = parseInt(parts[2]!, 10);
                                                if (!isNaN(num)) maxNum = Math.max(maxNum, num);
                                            }
                                        }
                                        batchCounters[inventory.id] = maxNum + 1;
                                    } else {
                                        batchCounters[inventory.id]!++;
                                    }

                                    const seqStr = String(batchCounters[inventory.id]).padStart(3, '0');
                                    batchCode = `${prefix}${seqStr}`;
                                }
                                const existingBatch = await tx.inventoryBatch.findFirst({
                                    where: { inventoryId: inventory.id, batchCode }
                                });
                                let batchId = '';
                                if (existingBatch) {
                                    await tx.inventoryBatch.update({
                                        where: { id: existingBatch.id },
                                        data: { quantity: { increment: b.quantity } }
                                    });
                                    batchId = existingBatch.id;
                                } else {
                                    const newBatch = await tx.inventoryBatch.create({
                                        data: {
                                            inventoryId: inventory.id,
                                            batchCode,
                                            quantity: b.quantity,
                                            expirationDate: new Date(b.expirationDate)
                                        }
                                    });
                                    batchId = newBatch.id;
                                }
                                await tx.inventoryTransaction.create({
                                    data: {
                                        productId: requestItem.productId,
                                        performedBy: userId,
                                        type: InventoryTransactionType.IMPORT,
                                        quantity: b.quantity,
                                        unitCost: unitCostLegacy,
                                        totalCost: roundMoney2(unitCostLegacy.mul(b.quantity)),
                                        referenceType: 'GoodsReceipt',
                                        referenceId: goodsReceipt.id,
                                        reason: input.note ?? `Nhập lô ${batchCode} từ yêu cầu ${request.requestNumber}`,
                                        legacyBatchId: batchId
                                    }
                                });
                            }
                        } else {
                            await tx.inventoryTransaction.create({
                                data: {
                                    productId: requestItem.productId,
                                    performedBy: userId,
                                    type: InventoryTransactionType.IMPORT,
                                    quantity: receiveItem.receivedQuantity,
                                    unitCost: unitCostLegacy,
                                    totalCost: roundMoney2(unitCostLegacy.mul(receiveItem.receivedQuantity)),
                                    referenceType: 'GoodsReceipt',
                                    referenceId: goodsReceipt.id,
                                    reason: input.note ?? `Nhập hàng từ yêu cầu ${request.requestNumber}`
                                }
                            });
                        }
                    }

                    for (const ingId of affectedIngredientIds) {
                        await recalculateCostsForIngredient(ingId, tx);
                    }

                    const allItems = await tx.purchaseRequestItem.findMany({ where: { requestId: request.id } });
                    let allItemsFullyReceived = true;
                    for (const item of allItems) {
                        if (item.quantityReceived < item.quantity) {
                            allItemsFullyReceived = false;
                            break;
                        }
                    }

                    const newStatus = allItemsFullyReceived
                        ? PurchaseRequestStatus.RECEIVED
                        : currentRequest?.status || PurchaseRequestStatus.SENT;

                    return tx.purchaseRequest.update({
                        where: { id: request.id },
                        data: {
                            status: newStatus,
                            receivedAt: new Date(),
                            receivedAmount: { increment: roundMoney2(totalReceivedAmountToIncrement) }
                        },
                        include: purchaseInclude
                    });
                });
            } catch (error: any) {
                lastError = error;
                if (error.code === 'P2002' || error.message?.includes('Unique constraint failed')) {
                    retries++;
                    if (retries >= 3) {
                        throw new Error(`Đã thử tạo mã lô 3 lần nhưng vẫn bị trùng. Vui lòng thử lại sau. (Lỗi: ${error.message})`);
                    }
                    await new Promise((res) => setTimeout(res, 100 * retries));
                } else {
                    throw error;
                }
            }
        }
        throw lastError;
    },

    async delete(id: string): Promise<PurchaseRequestRecord> {
        return prisma.purchaseRequest.delete({ where: { id }, include: purchaseInclude });
    }
};
