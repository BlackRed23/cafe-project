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
import { duplicateReceiptItemIndex } from './purchase.receipt-validation';
import { HttpError } from '../../common/http-error';
import { createHash } from 'node:crypto';
import { verifyAndLockAutomaticNeed, type VerifiedPurchaseNeed } from './purchase-need.guard';

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
            if (input.demandSourceKey) {
                await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${input.demandSourceKey}))::text`;
                const previous = await tx.purchaseRequest.findUnique({ where: { demandSourceKey: input.demandSourceKey } });
                if (previous) {
                    const hash = createHash('sha256').update(JSON.stringify({ supplierId: input.supplierId,
                        notes: input.notes ?? null,
                        items: input.items.map(i => ({ ingredientId: i.ingredientId, inventoryId: i.inventoryId,
                            quantity: i.quantity, unitPrice: i.unitPrice ?? null, notes: i.notes ?? null })) })).digest('hex');
                    if (previous.requestedBy === userId && previous.demandHash === hash)
                        return tx.purchaseRequest.findUniqueOrThrow({ where: { id: previous.id }, include: purchaseInclude });
                    throw new HttpError(409, 'Nguồn nhu cầu đã được dùng cho nội dung khác.');
                }
            }
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
                const verifiedAutomaticNeeds: VerifiedPurchaseNeed[] = [];
                // Run every verified auto-shortage read under the SAME ingredient
                // advisory lock held by the proposal execute writer. A caller
                // choosing a different demandSourceKey cannot create a second
                // active PR for the same Backend-attested LOW_STOCK need.
                const automaticNeed = input.aiGenerated ||
                    Boolean(input.demandSourceKey?.startsWith('ai-ln-agent-'));
                for (const ingId of [...new Set(ingredientIds)].sort()) {
                    if (automaticNeed) {
                        verifiedAutomaticNeeds.push(await verifyAndLockAutomaticNeed(tx, ingId));
                    } else {
                        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'purchasing-demand:' + ingId}))::text`;
                    }
                }
                const activeIngItem = !automaticNeed && !input.demandSourceKey ? await tx.purchaseRequestItem.findFirst({
                    where: {
                        ingredientId: { in: ingredientIds },
                        request: { status: { in: [...ACTIVE_PURCHASE_REQUEST_STATUSES] } }
                    },
                    select: { id: true }
                }) : null;
                if (activeIngItem) throw new Error(ACTIVE_PURCHASE_REQUEST_MESSAGE);
                // Keep this validated attestation local to the transaction.
                // It must never be reconstructed from a caller hash or note.
                if (verifiedAutomaticNeeds.length) {
                    const request = await createRequest(tx);
                    await tx.agentLog.create({ data: {
                        action: 'AI_LN_AUTOMATIC_SHORTAGE_PR_CREATED',
                        result: 'SUCCESS',
                        reference_type: 'PurchaseRequest', reference_id: request.id,
                        createdBy: userId, fallback_used: false,
                        input: JSON.stringify({
                            needIdentities: verifiedAutomaticNeeds.map(need => need.identity),
                            sourceKeysSha256: input.demandSourceKey
                                ? createHash('sha256').update(input.demandSourceKey).digest('hex') : null,
                            attested: verifiedAutomaticNeeds
                        }),
                        output: JSON.stringify({ purchaseRequestId: request.id, status: request.status }),
                        reasoning: 'Current Backend lot, stocktake, inbound and active PR evidence verified under shared ingredient transaction lock.'
                    } });
                    return request;
                }
            }

            return createRequest(tx);
            async function createRequest(tx: Prisma.TransactionClient): Promise<PurchaseRequestRecord> {
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
                    demandSourceKey: input.demandSourceKey ?? null,
                    demandHash: input.demandSourceKey ? createHash('sha256')
                        .update(JSON.stringify({ supplierId: input.supplierId, notes: input.notes ?? null,
                            items: input.items.map(i => ({ ingredientId: i.ingredientId, inventoryId: i.inventoryId,
                                quantity: i.quantity, unitPrice: i.unitPrice ?? null, notes: i.notes ?? null })) }))
                        .digest('hex') : null,
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
            }
        }, { timeout: 20000 });
    },

    async updateStatus(id: string, data: Prisma.PurchaseRequestUpdateInput): Promise<PurchaseRequestRecord> {
        return prisma.purchaseRequest.update({ where: { id }, data, include: purchaseInclude });
    },

    async receive(request: PurchaseRequestRecord, input: ReceivePurchaseRequestInput, userId: string): Promise<PurchaseRequestRecord> {
        if (duplicateReceiptItemIndex(input.items) !== -1) {
            throw new HttpError(400, 'Each purchase request item can appear only once per receipt.');
        }
        const payloadHash = createHash('sha256').update(JSON.stringify({
            purchaseOrderId: input.purchaseOrderId ?? null,
            supplierInvoiceNo: input.supplierInvoiceNo ?? null,
            note: input.note ?? null,
            items: input.items
        })).digest('hex');

        if (input.idempotencyKey) {
            const existingReceipt = await prisma.goodsReceipt.findUnique({
                where: { idempotencyKey: input.idempotencyKey }
            });
            if (existingReceipt && existingReceipt.purchaseRequestId === request.id &&
                existingReceipt.receivedBy === userId && existingReceipt.requestHash === payloadHash) {
                const existingPr = await prisma.purchaseRequest.findUnique({
                    where: { id: request.id },
                    include: purchaseInclude
                });
                if (existingPr) return existingPr;
            }
            if (existingReceipt) throw new HttpError(409, 'Mã nhận hàng đã dùng với nội dung khác.');
        }
        let retries = 0;
        let lastError: any = null;

        while (retries < 3) {
            try {
                return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
                    // All receipts for the same approved demand serialize here.
                    await tx.$queryRaw`SELECT "id" FROM "PurchaseRequest" WHERE "id" = ${request.id} FOR UPDATE`;
                    if (input.idempotencyKey) {
                        const existingReceipt = await tx.goodsReceipt.findUnique({
                            where: { idempotencyKey: input.idempotencyKey }
                        });
                        if (existingReceipt && existingReceipt.purchaseRequestId === request.id &&
                            existingReceipt.receivedBy === userId && existingReceipt.requestHash === payloadHash) {
                            const existingPr = await tx.purchaseRequest.findUnique({
                                where: { id: request.id },
                                include: purchaseInclude
                            });
                            if (existingPr) return existingPr;
                        }
                        if (existingReceipt) throw new HttpError(409, 'Mã nhận hàng đã dùng với nội dung khác.');
                    }
                    const freshItems = await tx.purchaseRequestItem.findMany({
                        where: { requestId: request.id }
                    });
                    if (!input.purchaseOrderId && await tx.purchaseOrder.count({
                        where: { purchaseRequestId: request.id }
                    }) > 0) {
                        throw new HttpError(409, 'Yêu cầu đã có PO; phải nhận hàng qua PO có trạng thái hợp lệ.');
                    }
                    let po: Awaited<ReturnType<typeof tx.purchaseOrder.findUnique>> | null = null;
                    if (input.purchaseOrderId) {
                        po = await tx.purchaseOrder.findUnique({ where: { id: input.purchaseOrderId } });
                        if (!po || po.purchaseRequestId !== request.id ||
                            !['CONFIRMED', 'PARTIALLY_RECEIVED'].includes(po.status)) {
                            throw new HttpError(409, 'PO chưa được xác nhận hoặc không thể tiếp tục nhận hàng.');
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
                            idempotencyKey: input.idempotencyKey?.trim() || null,
                            requestHash: input.idempotencyKey ? payloadHash : null,
                            purchaseOrderId: po?.id ?? null
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
                        const latestItem = freshItems.find(item => item.id === requestItem.id);
                        if (!latestItem) throw new HttpError(409, 'Purchase item no longer exists.');
                        if (po) {
                            const poItem = await tx.purchaseOrderItem.findFirst({
                                where: { purchaseOrderId: po.id, purchaseRequestItemId: requestItem.id }
                            });
                            if (!poItem || receiveItem.receivedQuantity > poItem.quantityOrdered - poItem.quantityReceived) {
                                throw new HttpError(409, 'Lượng nhận vượt PO hoặc mặt hàng không thuộc PO.');
                            }
                            if (receiveItem.unitPrice !== undefined &&
                                !new Prisma.Decimal(receiveItem.unitPrice).equals(poItem.unitPrice)) {
                                throw new HttpError(409, 'Đơn giá nhận hàng khác PO; phải đối soát hóa đơn riêng.');
                            }
                            await tx.purchaseOrderItem.update({ where: { id: poItem.id },
                                data: { quantityReceived: { increment: receiveItem.receivedQuantity } } });
                        }

                        const effectiveUnitPrice = receiveItem.unitPrice !== undefined
                            ? toDecimal(receiveItem.unitPrice)
                            : toDecimal(requestItem.unitPrice ?? 0);

                        totalReceivedAmountToIncrement = totalReceivedAmountToIncrement.add(
                            effectiveUnitPrice.mul(receiveItem.receivedQuantity)
                        );

                        const currentQuantityReceived = latestItem.quantityReceived || 0;
                        const remaining = requestItem.quantity - currentQuantityReceived;

                        if (receiveItem.receivedQuantity > remaining) {
                            throw new Error('Số lượng nhận không được vượt quá số lượng còn lại của yêu cầu.');
                        }

                        await tx.purchaseRequestItem.update({
                            where: { id: requestItem.id },
                            data: {
                                quantityReceived: { increment: receiveItem.receivedQuantity },
                                // Agreed price is immutable; invoice discrepancies
                                // are captured via PurchaseInvoiceReconciliation.
                            }
                        });

                        // Luồng Nguyên liệu mới (Ingredient)
                        if (requestItem.ingredientId && requestItem.ingredient) {
                            const ingId = requestItem.ingredientId;
                            await tx.$queryRaw`SELECT "id" FROM "Ingredient" WHERE "id" = ${ingId} FOR UPDATE`;
                            const currentIng = await tx.ingredient.findUnique({ where: { id: ingId } });
                            if (!currentIng) throw new Error('Không tìm thấy nguyên liệu.');

                            const supIng = request.supplier?.ingredients.find((si) => si.ingredientId === ingId);
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
                                                  : null,
                                              quantity: receiveItem.receivedQuantity
                                          }
                                      ];

                            for (const b of batchesToCreate) {
                                // LO-08: No arbitrary fallback (previously +180 days).
                                // Validate at the DB transaction boundary as well as at the HTTP layer.
                                const expiresAt = b.expirationDate ? new Date(b.expirationDate) : null;
                                if (!expiresAt || !Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
                                    throw new HttpError(400, 'Phiếu nhận nguyên liệu phải có hạn sử dụng hợp lệ trong tương lai cho từng lô.');
                                }
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
                                        expirationDate: expiresAt,
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

                    if (po) {
                        const poItems = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: po.id } });
                        const finished = poItems.every(item => item.quantityReceived >= item.quantityOrdered);
                        const partial = poItems.some(item => item.quantityReceived > 0);
                        await tx.purchaseOrder.update({ where: { id: po.id },
                            data: { status: finished ? 'RECEIVED' : partial ? 'PARTIALLY_RECEIVED' : 'CONFIRMED' } });
                    }

                    return tx.purchaseRequest.update({
                        where: { id: request.id },
                        data: {
                            status: newStatus,
                            receivedAt: new Date(),
                            receivedAmount: { increment: roundMoney2(totalReceivedAmountToIncrement) }
                        },
                        include: purchaseInclude
                    });
                }, { timeout: 25000 });
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
