import {
    ConsumptionStatus,
    InventoryTransactionType,
    OrderStatus,
    PaymentMethod,
    PaymentStatus,
    Prisma,
    TransactionStatus
} from '@cafe-project/database';
import { prisma } from '@cafe-project/database';
import {
    allocateFifoBatches,
    calculateOrderItemCostSnapshot,
    roundCost4,
    roundMoney2,
    roundQty3,
    toDecimal
} from '../../common/ingredient-cost.utils';
import type { CreateOrderInput, OrderFiltersInput } from './order.validator';
import { detectShippingZone, calculateShippingFee } from './shipping.service';
import { scanInventoryViaAgentService } from '../agent/agent.client';
import { appendManualPaymentAudit } from '../payment/payment.repository';

const orderInclude = {
    user: { select: { id: true, name: true, email: true } },
    items: {
        include: {
            product: true,
            recipe: true,
            toppings: {
                include: {
                    topping: true
                }
            }
        }
    },
    payments: { orderBy: [{ attemptNo: 'desc' }, { createdAt: 'desc' }] }
} satisfies Prisma.OrderInclude;

export type OrderRecord = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

export const orderRepository = {
    async findMany(filters: OrderFiltersInput = {}): Promise<OrderRecord[]> {
        return prisma.order.findMany({
            where: {
                ...(filters.status ? { status: filters.status } : {}),
                ...(filters.paymentStatus ? { paymentStatus: filters.paymentStatus } : {})
            },
            include: orderInclude,
            orderBy: { createdAt: 'desc' }
        });
    },

    async findByUser(userId: string): Promise<OrderRecord[]> {
        return prisma.order.findMany({ where: { userId }, include: orderInclude, orderBy: { createdAt: 'desc' } });
    },

    async findById(id: string): Promise<OrderRecord | null> {
        return prisma.order.findUnique({ where: { id }, include: orderInclude });
    },

    async findStaleUnpaidOnlineOrders(cutoffDate: Date, now: Date = new Date()): Promise<OrderRecord[]> {
        return prisma.order.findMany({
            where: {
                status: OrderStatus.PENDING,
                paymentStatus: PaymentStatus.PENDING,
                paymentMethod: { in: [PaymentMethod.MOMO, PaymentMethod.VNPAY] },
                createdAt: { lt: cutoffDate },
                payments: {
                    none: {
                        OR: [
                            { status: TransactionStatus.PAID },
                            {
                                status: { in: [TransactionStatus.INITIATED, TransactionStatus.PENDING] },
                                expiresAt: { gt: now }
                            }
                        ]
                    }
                }
            },
            include: orderInclude,
            orderBy: { createdAt: 'asc' }
        });
    },

    async create(userId: string, input: CreateOrderInput): Promise<OrderRecord> {
        return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const productIds = Array.from(new Set(input.items.map((item) => item.productId)));
            const products = await tx.product.findMany({
                where: { id: { in: productIds }, isActive: true },
                include: { inventory: true }
            });
            const productById = new Map(products.map((product) => [product.id, product]));

            const activeRecipes = await tx.recipe.findMany({
                where: { productId: { in: productIds }, isActive: true },
                include: {
                    ingredients: {
                        include: { ingredient: true }
                    }
                }
            });
            const activeRecipeByProductId = new Map(activeRecipes.map((r) => [r.productId, r]));

            const allToppingIds = Array.from(
                new Set(input.items.flatMap((it) => (it.toppings ?? []).map((t) => t.toppingId)))
            );
            const toppings = allToppingIds.length > 0
                ? await tx.topping.findMany({
                      where: { id: { in: allToppingIds }, isActive: true },
                      include: {
                          ingredients: {
                              include: { ingredient: true }
                          }
                      }
                  })
                : [];
            const toppingById = new Map(toppings.map((t) => [t.id, t]));

            let totalAmount = 0;

            for (const item of input.items) {
                const product = productById.get(item.productId);
                if (!product) throw new Error('Không tìm thấy sản phẩm.');

                const activeRecipe = activeRecipeByProductId.get(item.productId);
                if (!activeRecipe) {
                    // Sản phẩm chưa có công thức -> kiểm tra tồn kho legacy Inventory
                    const availableStock = product.inventory
                        ? product.inventory.quantity - product.inventory.reservedStock
                        : 0;
                    if (!product.inventory || availableStock < item.quantity) {
                        throw new Error(
                            `Không đủ tồn kho khả dụng để tạo đơn hàng. Sản phẩm "${product.name}" khả dụng: ${availableStock}, bạn đặt: ${item.quantity}.`
                        );
                    }
                }

                let itemToppingsPrice = 0;
                for (const tInput of item.toppings ?? []) {
                    const topping = toppingById.get(tInput.toppingId);
                    if (!topping) {
                        throw new Error('Topping không tồn tại hoặc đã ngừng bán.');
                    }
                    itemToppingsPrice += Number(topping.price) * tInput.quantity;
                }

                totalAmount += Number(product.price) * item.quantity + itemToppingsPrice;
            }

            const subtotal = totalAmount;
            const shippingZone = detectShippingZone(input.shippingAddress ?? '');
            const shippingFee = calculateShippingFee(shippingZone, subtotal);
            const grandTotal = subtotal + shippingFee;

            const isOnlineGateway =
                input.paymentMethod === PaymentMethod.MOMO || input.paymentMethod === PaymentMethod.VNPAY;
            const initialTxStatus = isOnlineGateway ? TransactionStatus.INITIATED : TransactionStatus.PENDING;

            const order = await tx.order.create({
                data: {
                    userId,
                    status: OrderStatus.PENDING,
                    totalAmount: grandTotal,
                    shippingFee,
                    shippingZone,
                    shippingName: input.shippingName,
                    shippingPhone: input.shippingPhone,
                    shippingAddress: input.shippingAddress,
                    note: input.note,
                    paymentMethod: input.paymentMethod,
                    paymentStatus: PaymentStatus.PENDING,
                    items: {
                        create: input.items.map((item) => {
                            const product = productById.get(item.productId)!;
                            const activeRecipe = activeRecipeByProductId.get(item.productId);
                            const itemToppings = item.toppings ?? [];

                            return {
                                productId: item.productId,
                                quantity: item.quantity,
                                price: product.price,
                                recipeId: activeRecipe?.id ?? null,
                                recipeVersion: activeRecipe?.version ?? null,
                                consumptionStatus: ConsumptionStatus.PENDING,
                                toppings:
                                    itemToppings.length > 0
                                        ? {
                                              create: itemToppings.map((tInput) => {
                                                  const topping = toppingById.get(tInput.toppingId)!;
                                                  return {
                                                      toppingId: topping.id,
                                                      quantity: tInput.quantity,
                                                      price: topping.price,
                                                      costSnapshot: 0
                                                  };
                                              })
                                          }
                                        : undefined
                            };
                        })
                    },
                    payments: {
                        create: {
                            method: input.paymentMethod,
                            amount: grandTotal,
                            status: initialTxStatus,
                            attemptNo: 1
                        }
                    }
                },
                include: orderInclude
            });

            // Giữ chỗ kho cho từng OrderItem
            for (const createdItem of order.items) {
                const product = productById.get(createdItem.productId)!;
                const activeRecipe = createdItem.recipeId
                    ? activeRecipeByProductId.get(createdItem.productId)
                    : null;

                if (activeRecipe) {
                    // Tính tổng nguyên liệu cần giữ chỗ cho dòng OrderItem này (recipe + toppings)
                    const needMap = new Map<string, { name: string; baseUnit: string; qty: Prisma.Decimal }>();

                    for (const ri of activeRecipe.ingredients) {
                        if (ri.isOptional) continue;
                        const need = roundQty3(toDecimal(ri.quantityBase).mul(createdItem.quantity));
                        if (need.lte(0)) continue;
                        const prev = needMap.get(ri.ingredientId);
                        needMap.set(ri.ingredientId, {
                            name: ri.ingredient.name,
                            baseUnit: ri.ingredient.baseUnit,
                            qty: prev ? roundQty3(prev.qty.add(need)) : need
                        });
                    }

                    for (const oit of createdItem.toppings) {
                        const toppingFull = toppingById.get(oit.toppingId);
                        if (!toppingFull) continue;
                        for (const ti of toppingFull.ingredients) {
                            const need = roundQty3(toDecimal(ti.quantityBase).mul(oit.quantity));
                            if (need.lte(0)) continue;
                            const prev = needMap.get(ti.ingredientId);
                            needMap.set(ti.ingredientId, {
                                name: ti.ingredient.name,
                                baseUnit: ti.ingredient.baseUnit,
                                qty: prev ? roundQty3(prev.qty.add(need)) : need
                            });
                        }
                    }

                    for (const [ingredientId, info] of needMap.entries()) {
                        const updateResult = await tx.$executeRaw`
                            UPDATE "Ingredient"
                            SET "reserved" = "reserved" + ${info.qty},
                                "rowVersion" = "rowVersion" + 1,
                                "updatedAt" = NOW()
                            WHERE "id" = ${ingredientId}
                              AND "deletedAt" IS NULL
                              AND "isActive" = true
                              AND "quantity" - "reserved" >= ${info.qty}
                        `;

                        if (updateResult !== 1) {
                            throw new Error(
                                `Không đủ tồn kho nguyên liệu "${info.name}" khả dụng để tạo đơn hàng cho món "${product.name}".`
                            );
                        }

                        await tx.inventoryTransaction.create({
                            data: {
                                ingredientId,
                                performedBy: userId,
                                type: InventoryTransactionType.RESERVE,
                                quantity: info.qty,
                                unitCost: 0,
                                totalCost: 0,
                                orderItemId: createdItem.id,
                                referenceType: 'Order',
                                referenceId: order.id,
                                reason: `Giữ nguyên liệu cho đơn ${order.id}`
                            }
                        });
                    }
                } else {
                    // Tương thích ngược: giữ chỗ trên bảng Inventory cũ
                    if (!product.inventory) continue;

                    const updateResult = await tx.$executeRaw`
                        UPDATE "Inventory"
                        SET "reservedStock" = "reservedStock" + ${createdItem.quantity}
                        WHERE "productId" = ${createdItem.productId}
                          AND "quantity" - "reservedStock" >= ${createdItem.quantity}
                    `;

                    if (updateResult !== 1) {
                        throw new Error(
                            `Không đủ tồn kho khả dụng để tạo đơn hàng. Sản phẩm "${product.name}" vừa hết hàng.`
                        );
                    }

                    await tx.inventoryTransaction.create({
                        data: {
                            productId: createdItem.productId,
                            performedBy: userId,
                            type: InventoryTransactionType.ORDER,
                            quantity: createdItem.quantity,
                            orderItemId: createdItem.id,
                            referenceType: 'Order',
                            referenceId: order.id,
                            reason: `Giữ hàng cho đơn ${order.id}`
                        }
                    });
                }
            }

            return order;
        });
    },

    async confirmManualPayment(
        order: OrderRecord,
        userId: string,
        note?: string
    ): Promise<OrderRecord> {
        return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const now = new Date();
            const updatedOrderCount = await tx.order.updateMany({
                where: {
                    id: order.id,
                    status: { not: OrderStatus.CANCELLED },
                    paymentStatus: { not: PaymentStatus.PAID }
                },
                data: {
                    paymentStatus: PaymentStatus.PAID,
                    paidAt: now
                }
            });

            if (updatedOrderCount.count !== 1) {
                throw new Error('Đơn hàng đã được thanh toán hoặc không ở trạng thái hợp lệ.');
            }

            const latestPayment = await tx.payment.findFirst({
                where: { orderId: order.id },
                orderBy: [{ attemptNo: 'desc' }, { createdAt: 'desc' }]
            });

            if (latestPayment) {
                const nextPayload = appendManualPaymentAudit(latestPayment.responsePayload, {
                    by: userId,
                    from: latestPayment.status,
                    to: TransactionStatus.PAID,
                    at: now.toISOString(),
                    note: note ?? 'Xác nhận đã nhận tiền thủ công'
                });

                await tx.payment.update({
                    where: { id: latestPayment.id },
                    data: {
                        status: TransactionStatus.PAID,
                        paidAt: latestPayment.paidAt ?? now,
                        failureCode: null,
                        failureMessage: null,
                        responsePayload: nextPayload
                    }
                });
            } else {
                await tx.payment.create({
                    data: {
                        orderId: order.id,
                        method: order.paymentMethod ?? PaymentMethod.CASH,
                        merchantRef: `${order.id}_1`,
                        amount: order.totalAmount,
                        status: TransactionStatus.PAID,
                        attemptNo: 1,
                        paidAt: now,
                        responsePayload: appendManualPaymentAudit(null, {
                            by: userId,
                            from: TransactionStatus.PENDING,
                            to: TransactionStatus.PAID,
                            at: now.toISOString(),
                            note: note ?? 'Xác nhận đã nhận tiền thủ công'
                        })
                    }
                });
            }

            const updatedOrder = await tx.order.findUnique({
                where: { id: order.id },
                include: orderInclude
            });
            return updatedOrder!;
        });
    },

    async updateStatus(
        order: OrderRecord,
        nextStatus: OrderStatus,
        userId?: string | null,
        paymentStatus?: PaymentStatus
    ): Promise<OrderRecord> {
        const actorId = userId || null;
        const auditActor = actorId ?? 'SYSTEM_CRON';
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const isStatusSame = order.status === nextStatus;
            const shouldFinalizeStock = !order.stockDeductedAt && nextStatus === OrderStatus.COMPLETED;
            const shouldReleaseReserved =
                !order.stockDeductedAt &&
                nextStatus === OrderStatus.CANCELLED &&
                (order.status === OrderStatus.PENDING || order.status === OrderStatus.PROCESSING);
            const now = new Date();

            if (!isStatusSame || paymentStatus) {
                const updatedOrderCount = await tx.order.updateMany({
                    where: {
                        id: order.id,
                        status: order.status,
                        ...(nextStatus === OrderStatus.CANCELLED && order.paymentStatus !== PaymentStatus.PAID
                            ? { paymentStatus: { not: PaymentStatus.PAID } }
                            : {})
                    },
                    data: {
                        status: nextStatus,
                        ...(paymentStatus
                            ? {
                                  paymentStatus,
                                  ...(paymentStatus === PaymentStatus.PAID ? { paidAt: order.paidAt ?? now } : {})
                              }
                            : {}),
                        ...(shouldFinalizeStock ? { stockDeductedAt: now } : {})
                    }
                });

                if (updatedOrderCount.count !== 1) {
                    throw new Error('Đơn hàng đã được xử lý trước đó hoặc không ở trạng thái hợp lệ.');
                }
            }

            // BUG-2: Atomic sync of Payment attempt when paymentStatus = PAID is requested
            if (paymentStatus === PaymentStatus.PAID && order.paymentStatus !== PaymentStatus.PAID) {
                const latestPayment = await tx.payment.findFirst({
                    where: { orderId: order.id },
                    orderBy: [{ attemptNo: 'desc' }, { createdAt: 'desc' }]
                });

                if (latestPayment && latestPayment.status !== TransactionStatus.PAID) {
                    const nextPayload = appendManualPaymentAudit(latestPayment.responsePayload, {
                        by: auditActor,
                        from: latestPayment.status,
                        to: TransactionStatus.PAID,
                        at: now.toISOString(),
                        note: nextStatus === OrderStatus.COMPLETED
                            ? 'Hoàn thành đơn hàng & xác nhận thanh toán'
                            : 'Xác nhận thanh toán cùng cập nhật đơn hàng'
                    });

                    await tx.payment.update({
                        where: { id: latestPayment.id },
                        data: {
                            status: TransactionStatus.PAID,
                            paidAt: latestPayment.paidAt ?? now,
                            failureCode: null,
                            failureMessage: null,
                            responsePayload: nextPayload
                        }
                    });
                } else if (!latestPayment) {
                    await tx.payment.create({
                        data: {
                            orderId: order.id,
                            method: order.paymentMethod ?? PaymentMethod.CASH,
                            merchantRef: `${order.id}_1`,
                            amount: order.totalAmount,
                            status: TransactionStatus.PAID,
                            attemptNo: 1,
                            paidAt: now,
                            responsePayload: appendManualPaymentAudit(null, {
                                by: auditActor,
                                from: TransactionStatus.PENDING,
                                to: TransactionStatus.PAID,
                                at: now.toISOString(),
                                note: 'Hoàn thành đơn hàng & xác nhận thanh toán'
                            })
                        }
                    });
                }
            }

            // BUG-3: If cancelling an order that was already PAID, mark PAID payment(s) as REFUND_REQUIRED
            if (nextStatus === OrderStatus.CANCELLED && order.paymentStatus === PaymentStatus.PAID) {
                await tx.payment.updateMany({
                    where: {
                        orderId: order.id,
                        status: TransactionStatus.PAID
                    },
                    data: {
                        failureCode: 'REFUND_REQUIRED',
                        failureMessage: 'Đơn bị hủy sau khi đã thanh toán – cần hoàn tiền.'
                    }
                });
            }

            // BUG-6: When cancelling an unpaid order, expire any INITIATED / PENDING payment attempts
            if (nextStatus === OrderStatus.CANCELLED && order.paymentStatus !== PaymentStatus.PAID) {
                await tx.payment.updateMany({
                    where: {
                        orderId: order.id,
                        status: { in: [TransactionStatus.INITIATED, TransactionStatus.PENDING] }
                    },
                    data: {
                        status: TransactionStatus.EXPIRED,
                        failureCode: actorId ? 'ORDER_CANCELLED' : 'ORDER_AUTO_CANCELLED',
                        failureMessage: actorId
                            ? 'Đơn hàng đã bị hủy trước khi hoàn tất thanh toán.'
                            : 'Đơn hàng tự động hủy do quá hạn thanh toán online.'
                    }
                });
            }

            if (nextStatus === OrderStatus.PROCESSING && order.status === OrderStatus.PENDING) {
                await tx.orderItem.updateMany({
                    where: { orderId: order.id, startedAt: null },
                    data: { startedAt: new Date() }
                });
            }

            if (shouldFinalizeStock) {
                const now = new Date();
                for (const item of order.items) {
                    if (item.recipeId) {
                        // Luồng trừ kho Nguyên liệu theo Recipe + FIFO Batch
                        const recipe = await tx.recipe.findUnique({
                            where: { id: item.recipeId },
                            include: {
                                ingredients: {
                                    include: { ingredient: true }
                                }
                            }
                        });

                        if (!recipe) {
                            throw new Error(`Không tìm thấy công thức (${item.recipeId}) cho dòng đơn hàng.`);
                        }

                        const toppingIds = item.toppings.map((t) => t.toppingId);
                        const toppingsFull = toppingIds.length > 0
                            ? await tx.topping.findMany({
                                  where: { id: { in: toppingIds } },
                                  include: { ingredients: { include: { ingredient: true } } }
                              })
                            : [];
                        const toppingById = new Map(toppingsFull.map((t) => [t.id, t]));

                        // 1. Trừ nguyên liệu của Recipe chính
                        let recipeIngredientActualCost = new Prisma.Decimal(0);

                        for (const ri of recipe.ingredients) {
                            if (ri.isOptional) continue;
                            const needQty = roundQty3(toDecimal(ri.quantityBase).mul(item.quantity));
                            if (needQty.lte(0)) continue;

                            await tx.$queryRaw`SELECT "id" FROM "Ingredient" WHERE "id" = ${ri.ingredientId} FOR UPDATE`;
                            const updatedIng = await tx.ingredient.updateMany({
                                where: {
                                    id: ri.ingredientId,
                                    quantity: { gte: needQty },
                                    reserved: { gte: needQty }
                                },
                                data: {
                                    quantity: { decrement: needQty },
                                    reserved: { decrement: needQty },
                                    rowVersion: { increment: 1 }
                                }
                            });

                            if (updatedIng.count !== 1) {
                                throw new Error(
                                    `Không đủ số lượng nguyên liệu "${ri.ingredient.name}" đang giữ để hoàn tất đơn hàng.`
                                );
                            }

                            const batches = await tx.ingredientBatch.findMany({
                                where: {
                                    ingredientId: ri.ingredientId,
                                    quantityRemaining: { gt: 0 },
                                    OR: [
                                        { expirationDate: null },
                                        { expirationDate: { gte: startOfToday } }
                                    ]
                                },
                                orderBy: [
                                    { expirationDate: 'asc' },
                                    { receivedAt: 'asc' },
                                    { id: 'asc' }
                                ]
                            });

                            const { allocations, totalCost } = allocateFifoBatches(
                                batches,
                                needQty,
                                ri.ingredient.name
                            );

                            for (const alloc of allocations) {
                                const idempotencyKey = `consume:${item.id}:${ri.ingredientId}:${alloc.batchId}`;
                                const updatedBatch = await tx.ingredientBatch.updateMany({
                                    where: { id: alloc.batchId, quantityRemaining: { gte: alloc.quantity } },
                                    data: { quantityRemaining: { decrement: alloc.quantity } }
                                });
                                if (updatedBatch.count !== 1) {
                                    throw new Error(`Lô nguyên liệu "${ri.ingredient.name}" vừa thay đổi, vui lòng thử lại.`);
                                }

                                await tx.inventoryTransaction.upsert({
                                    where: { idempotencyKey },
                                    update: {},
                                    create: {
                                        idempotencyKey,
                                        ingredientId: ri.ingredientId,
                                        batchId: alloc.batchId,
                                        type: InventoryTransactionType.CONSUME,
                                        quantity: alloc.quantity.neg(),
                                        unitCost: alloc.unitCost,
                                        totalCost: alloc.totalCost,
                                        orderItemId: item.id,
                                        referenceType: 'Order',
                                        referenceId: order.id,
                                        performedBy: userId,
                                        reason: `Tiêu hao nguyên liệu cho đơn ${order.id}`
                                    }
                                });
                            }

                            recipeIngredientActualCost = recipeIngredientActualCost.add(totalCost);
                        }

                        // 2. Trừ nguyên liệu của Toppings (nếu có) và ghi nhận costSnapshot
                        const toppingsForSnapshot: Array<{
                            toppingId: string;
                            quantity: number;
                            price: Prisma.Decimal;
                            unitCostSnapshot: Prisma.Decimal;
                        }> = [];

                        for (const oit of item.toppings) {
                            const toppingFull = toppingById.get(oit.toppingId);
                            let totalToppingItemCost = new Prisma.Decimal(0);

                            if (toppingFull && toppingFull.ingredients.length > 0) {
                                for (const ti of toppingFull.ingredients) {
                                    const needQty = roundQty3(toDecimal(ti.quantityBase).mul(oit.quantity));
                                    if (needQty.lte(0)) continue;

                                    await tx.$queryRaw`SELECT "id" FROM "Ingredient" WHERE "id" = ${ti.ingredientId} FOR UPDATE`;
                                    const updatedIng = await tx.ingredient.updateMany({
                                        where: {
                                            id: ti.ingredientId,
                                            quantity: { gte: needQty },
                                            reserved: { gte: needQty }
                                        },
                                        data: {
                                            quantity: { decrement: needQty },
                                            reserved: { decrement: needQty },
                                            rowVersion: { increment: 1 }
                                        }
                                    });

                                    if (updatedIng.count !== 1) {
                                        throw new Error(
                                            `Không đủ số lượng nguyên liệu "${ti.ingredient.name}" của topping để hoàn tất đơn hàng.`
                                        );
                                    }

                                    const batches = await tx.ingredientBatch.findMany({
                                        where: {
                                            ingredientId: ti.ingredientId,
                                            quantityRemaining: { gt: 0 },
                                            OR: [
                                                { expirationDate: null },
                                                { expirationDate: { gte: startOfToday } }
                                            ]
                                        },
                                        orderBy: [
                                            { expirationDate: 'asc' },
                                            { receivedAt: 'asc' },
                                            { id: 'asc' }
                                        ]
                                    });

                                    const { allocations, totalCost } = allocateFifoBatches(
                                        batches,
                                        needQty,
                                        ti.ingredient.name
                                    );

                                    for (const alloc of allocations) {
                                        const idempotencyKey = `consume:${item.id}:topping:${oit.id}:${ti.ingredientId}:${alloc.batchId}`;
                                        const updatedBatch = await tx.ingredientBatch.updateMany({
                                            where: { id: alloc.batchId, quantityRemaining: { gte: alloc.quantity } },
                                            data: { quantityRemaining: { decrement: alloc.quantity } }
                                        });
                                        if (updatedBatch.count !== 1) {
                                            throw new Error(`Lô nguyên liệu "${ti.ingredient.name}" vừa thay đổi, vui lòng thử lại.`);
                                        }

                                        await tx.inventoryTransaction.upsert({
                                            where: { idempotencyKey },
                                            update: {},
                                            create: {
                                                idempotencyKey,
                                                ingredientId: ti.ingredientId,
                                                batchId: alloc.batchId,
                                                type: InventoryTransactionType.CONSUME,
                                                quantity: alloc.quantity.neg(),
                                                unitCost: alloc.unitCost,
                                                totalCost: alloc.totalCost,
                                                orderItemId: item.id,
                                                referenceType: 'Order',
                                                referenceId: order.id,
                                                performedBy: userId,
                                                reason: `Tiêu hao nguyên liệu topping cho đơn ${order.id}`
                                            }
                                        });
                                    }

                                    totalToppingItemCost = totalToppingItemCost.add(totalCost);
                                }
                            }

                            const unitCostSnapshot = oit.quantity > 0
                                ? roundCost4(totalToppingItemCost.div(oit.quantity))
                                : new Prisma.Decimal(0);

                            await tx.orderItemTopping.update({
                                where: { id: oit.id },
                                data: { costSnapshot: roundMoney2(totalToppingItemCost) }
                            });

                            toppingsForSnapshot.push({
                                toppingId: oit.toppingId,
                                quantity: oit.quantity,
                                price: oit.price,
                                unitCostSnapshot
                            });
                        }

                        const snapshot = calculateOrderItemCostSnapshot({
                            price: item.price,
                            quantity: item.quantity,
                            ingredientCostTotal: recipeIngredientActualCost,
                            toppings: toppingsForSnapshot,
                            recipe: {
                                yieldQuantity: recipe.yieldQuantity,
                                laborCost: recipe.laborCost,
                                overheadCost: recipe.overheadCost
                            }
                        });

                        await tx.orderItem.update({
                            where: { id: item.id },
                            data: {
                                consumptionStatus: ConsumptionStatus.COMMITTED,
                                startedAt: item.startedAt ?? now,
                                committedAt: now,
                                ingredientCost: snapshot.ingredientCost,
                                toppingCost: snapshot.toppingCost,
                                totalCost: snapshot.totalCost,
                                grossProfit: snapshot.grossProfit
                            }
                        });
                    } else {
                        // Tương thích ngược (Mục 2.8): Sản phẩm chưa có recipe active -> trừ Inventory cũ + lấy Product.costPrice
                        const inventory = await tx.inventory.findUnique({ where: { productId: item.productId } });
                        if (inventory) {
                            const updated = await tx.inventory.updateMany({
                                where: {
                                    id: inventory.id,
                                    quantity: { gte: item.quantity },
                                    reservedStock: { gte: item.quantity }
                                },
                                data: {
                                    quantity: { decrement: item.quantity },
                                    reservedStock: { decrement: item.quantity }
                                }
                            });

                            if (updated.count !== 1) {
                                throw new Error('Không đủ số lượng hàng đang giữ để cập nhật đơn hàng.');
                            }

                            const batches = await tx.inventoryBatch.findMany({
                                where: { inventoryId: inventory.id, quantity: { gt: 0 }, expirationDate: { gte: startOfToday } },
                                orderBy: [{ expirationDate: 'asc' }, { id: 'asc' }]
                            });

                            const totalSellable = batches.reduce((sum: number, b: any) => sum + b.quantity, 0);
                            if (totalSellable < item.quantity) {
                                throw new Error(`Không đủ lô hàng còn hạn để xuất. Yêu cầu: ${item.quantity}, Có thể xuất: ${totalSellable}.`);
                            }

                            let remainingToDeduct = item.quantity;
                            const fallbackUnitCost = roundCost4(toDecimal(item.product.costPrice));

                            for (const batch of batches) {
                                if (remainingToDeduct <= 0) break;

                                let currentBatchQuantity = batch.quantity;
                                let retryCount = 0;
                                const MAX_RETRY = 5;

                                while (currentBatchQuantity > 0 && remainingToDeduct > 0) {
                                    if (retryCount >= MAX_RETRY) {
                                        throw new Error('Hệ thống đang xử lý nhiều giao dịch cùng lúc, vui lòng thử lại.');
                                    }

                                    const deduction = Math.min(currentBatchQuantity, remainingToDeduct);
                                    const updatedBatch = await tx.inventoryBatch.updateMany({
                                        where: { id: batch.id, quantity: { gte: deduction } },
                                        data: { quantity: { decrement: deduction } }
                                    });

                                    if (updatedBatch.count === 1) {
                                        await tx.inventoryTransaction.create({
                                            data: {
                                                productId: item.productId,
                                                performedBy: userId,
                                                type: InventoryTransactionType.ORDER,
                                                quantity: -deduction,
                                                unitCost: fallbackUnitCost,
                                                totalCost: roundMoney2(fallbackUnitCost.mul(deduction)),
                                                orderItemId: item.id,
                                                referenceType: 'Order',
                                                referenceId: order.id,
                                                reason: `Trừ kho thật cho đơn ${order.id}`,
                                                legacyBatchId: batch.id
                                            }
                                        });
                                        remainingToDeduct -= deduction;
                                        break;
                                    } else {
                                        retryCount++;
                                        const freshBatch = await tx.inventoryBatch.findUnique({
                                            where: { id: batch.id }
                                        });
                                        if (!freshBatch || freshBatch.quantity <= 0) {
                                            break;
                                        }
                                        currentBatchQuantity = freshBatch.quantity;
                                    }
                                }
                            }

                            if (remainingToDeduct > 0) {
                                throw new Error(`Không đủ lô hàng còn hạn để xuất (vừa bị giành mất). Số lượng còn thiếu: ${remainingToDeduct}.`);
                            }
                        }

                        const snapshot = calculateOrderItemCostSnapshot({
                            price: item.price,
                            quantity: item.quantity,
                            recipe: null,
                            fallbackProductCostPrice: item.product.costPrice
                        });

                        await tx.orderItem.update({
                            where: { id: item.id },
                            data: {
                                consumptionStatus: ConsumptionStatus.COMMITTED,
                                startedAt: item.startedAt ?? now,
                                committedAt: now,
                                ingredientCost: snapshot.ingredientCost,
                                toppingCost: snapshot.toppingCost,
                                totalCost: snapshot.totalCost,
                                grossProfit: snapshot.grossProfit
                            }
                        });
                    }
                }

                const productIds = order.items.map((item) => item.productId);
                scanInventoryViaAgentService({
                    productIds,
                    triggerType: 'ORDER_COMPLETED',
                    sourceType: 'ORDER',
                    sourceId: order.id,
                    note: 'Order completed, stock finalized'
                }, actorId ?? undefined).catch((error) => {
                    console.error('[AI_AGENT] Failed to scan inventory after order completion', error);
                });
            }

            if (shouldReleaseReserved) {
                const now = new Date();
                for (const item of order.items) {
                    if (item.recipeId) {
                        // Nhả giữ chỗ nguyên liệu dựa trên các giao dịch RESERVE của OrderItem
                        const reserveTxns = await tx.inventoryTransaction.findMany({
                            where: {
                                orderItemId: item.id,
                                type: InventoryTransactionType.RESERVE,
                                ingredientId: { not: null }
                            }
                        });

                        for (const rTx of reserveTxns) {
                            if (!rTx.ingredientId) continue;
                            const releaseQty = roundQty3(toDecimal(rTx.quantity).abs());
                            if (releaseQty.lte(0)) continue;

                            const updatedIng = await tx.ingredient.updateMany({
                                where: {
                                    id: rTx.ingredientId,
                                    reserved: { gte: releaseQty }
                                },
                                data: {
                                    reserved: { decrement: releaseQty },
                                    rowVersion: { increment: 1 }
                                }
                            });

                            if (updatedIng.count !== 1) {
                                throw new Error('Không đủ số lượng nguyên liệu đang giữ để nhả cho đơn hủy.');
                            }

                            await tx.inventoryTransaction.create({
                                data: {
                                    ingredientId: rTx.ingredientId,
                                    performedBy: actorId,
                                    type: InventoryTransactionType.RELEASE,
                                    quantity: releaseQty.neg(),
                                    unitCost: 0,
                                    totalCost: 0,
                                    orderItemId: item.id,
                                    referenceType: 'Order',
                                    referenceId: order.id,
                                    reason: actorId
                                        ? `Nhả giữ nguyên liệu cho đơn ${order.id}`
                                        : `Tự động nhả giữ nguyên liệu do đơn ${order.id} quá hạn thanh toán`
                                }
                            });
                        }
                    } else {
                        const inventory = await tx.inventory.findUnique({ where: { productId: item.productId } });
                        if (inventory) {
                            const updated = await tx.inventory.updateMany({
                                where: { id: inventory.id, reservedStock: { gte: item.quantity } },
                                data: { reservedStock: { decrement: item.quantity } }
                            });

                            if (updated.count !== 1) {
                                throw new Error('Không đủ số lượng hàng đang giữ để cập nhật đơn hàng.');
                            }

                            await tx.inventoryTransaction.create({
                                data: {
                                    productId: item.productId,
                                    performedBy: actorId,
                                    type: InventoryTransactionType.CANCEL,
                                    quantity: -item.quantity,
                                    orderItemId: item.id,
                                    referenceType: 'Order',
                                    referenceId: order.id,
                                    reason: actorId
                                        ? `Nhả giữ hàng cho đơn ${order.id}`
                                        : `Tự động nhả giữ hàng do đơn ${order.id} quá hạn thanh toán`
                                }
                            });
                        }
                    }

                    await tx.orderItem.update({
                        where: { id: item.id },
                        data: {
                            consumptionStatus: ConsumptionStatus.VOIDED,
                            voidedAt: now
                        }
                    });
                }
            }

            const updatedOrder = await tx.order.findUnique({
                where: { id: order.id },
                include: orderInclude
            });

            return updatedOrder!;
        });
    }
};
