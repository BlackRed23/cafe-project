import { InventoryTransactionType, OrderStatus, type Prisma } from '@cafe-project/database';
import { prisma } from '@cafe-project/database';
import type { CreateOrderInput, OrderFiltersInput } from './order.validator';
import { detectShippingZone, calculateShippingFee } from './shipping.service';
import { scanInventoryViaAgentService } from '../agent/agent.client';

const orderInclude = {
    user: { select: { id: true, name: true, email: true } },
    items: { include: { product: true } },
    payment: true
} satisfies Prisma.OrderInclude;

export type OrderRecord = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

export const orderRepository = {
    async findMany(filters: OrderFiltersInput = {}): Promise<OrderRecord[]> {
        return prisma.order.findMany({
            where: {
                ...(filters.status ? { status: filters.status } : {}),
                ...(filters.paymentStatus ? { payment: { status: filters.paymentStatus } } : {})
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

    async create(userId: string, input: CreateOrderInput): Promise<OrderRecord> {
        return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const productIds = input.items.map((item) => item.productId);
            const products = await tx.product.findMany({
                where: { id: { in: productIds }, isActive: true },
                include: { inventory: true }
            });

            const productById = new Map(products.map((product: any) => [product.id, product]));
            let totalAmount = 0;

            for (const item of input.items) {
                const product = productById.get(item.productId);
                if (!product) throw new Error('Không tìm thấy sản phẩm.');

                // Lưu ý: Đây chỉ là early-check để báo lỗi sớm và thân thiện cho người dùng (hiển thị số lượng khả dụng cụ thể).
                // KHÔNG PHẢI nguồn chân lý (source of truth) để chống race condition/oversell.
                // Chốt chặn an toàn thực sự (source of truth) nằm ở câu lệnh raw SQL atomic phía dưới trong vòng lặp giữ chỗ.
                const availableStock = product.inventory ? product.inventory.quantity - product.inventory.reservedStock : 0;
                if (!product.inventory || availableStock < item.quantity) {
                    throw new Error(
                        `Không đủ tồn kho khả dụng để tạo đơn hàng. Sản phẩm "${product.name}" khả dụng: ${availableStock}, bạn đặt: ${item.quantity}.`
                    );
                }

                totalAmount += Number(product.price) * item.quantity;
            }

            const subtotal = totalAmount;
            const shippingZone = detectShippingZone(input.shippingAddress ?? '');
            const shippingFee = calculateShippingFee(shippingZone, subtotal);
            const grandTotal = subtotal + shippingFee;

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
                    items: {
                        create: input.items.map((item) => {
                            const product = productById.get(item.productId)!;
                            return { productId: item.productId, quantity: item.quantity, price: product.price };
                        })
                    },
                    payment: {
                        create: { method: input.paymentMethod, amount: grandTotal, status: 'PENDING' }
                    }
                },
                include: orderInclude
            });

            for (const item of input.items) {
                const product = productById.get(item.productId)!;
                if (!product.inventory) continue;

                const updateResult = await tx.$executeRaw`
                    UPDATE "Inventory"
                    SET "reservedStock" = "reservedStock" + ${item.quantity}
                    WHERE "productId" = ${item.productId}
                      AND "quantity" - "reservedStock" >= ${item.quantity}
                `;

                if (updateResult !== 1) {
                    throw new Error(`Không đủ tồn kho khả dụng để tạo đơn hàng. Sản phẩm "${product.name}" vừa hết hàng.`);
                }

                await tx.inventoryTransaction.create({
                    data: {
                        productId: item.productId,
                        userId,
                        type: InventoryTransactionType.ORDER,
                        quantity: item.quantity,
                        reason: `Giữ hàng cho đơn ${order.id}`
                    }
                });
            }

            return order;
        });
    },

    async updateStatus(order: OrderRecord, nextStatus: OrderStatus, userId: string): Promise<OrderRecord> {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const shouldFinalizeStock = !order.stockDeductedAt && nextStatus === OrderStatus.COMPLETED;
            const shouldReleaseReserved =
                !order.stockDeductedAt &&
                nextStatus === OrderStatus.CANCELLED &&
                (order.status === OrderStatus.PENDING || order.status === OrderStatus.PROCESSING);

            const updatedOrderCount = await tx.order.updateMany({
                where: { id: order.id, status: order.status },
                data: {
                    status: nextStatus,
                    ...(shouldFinalizeStock ? { stockDeductedAt: new Date() } : {})
                }
            });

            if (updatedOrderCount.count !== 1) {
                throw new Error('Đơn hàng đã được xử lý trước đó hoặc không ở trạng thái hợp lệ.');
            }

            if (shouldFinalizeStock) {
                for (const item of order.items) {
                    const inventory = await tx.inventory.findUnique({ where: { productId: item.productId } });
                    if (!inventory) continue;

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
                                        userId,
                                        type: InventoryTransactionType.ORDER,
                                        quantity: -deduction,
                                        reason: `Trừ kho thật cho đơn ${order.id}`,
                                        batchId: batch.id
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

                const productIds = order.items.map(item => item.productId);
                scanInventoryViaAgentService({
                    productIds,
                    triggerType: 'ORDER_COMPLETED',
                    sourceType: 'ORDER',
                    sourceId: order.id,
                    note: 'Order completed, stock finalized'
                }, userId).catch((error) => {
                    console.error('[AI_AGENT] Failed to scan inventory after order completion', error);
                });
            }

            if (shouldReleaseReserved) {
                for (const item of order.items) {
                    const inventory = await tx.inventory.findUnique({ where: { productId: item.productId } });
                    if (!inventory) continue;

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
                            userId,
                            type: InventoryTransactionType.CANCEL,
                            quantity: -item.quantity,
                            reason: `Nhả giữ hàng cho đơn ${order.id}`
                        }
                    });
                }
            }

            // Đã được update ở đầu transaction, bây giờ chỉ fetch trả về

            const updatedOrder = await tx.order.findUnique({
                where: { id: order.id },
                include: orderInclude
            });

            return updatedOrder!;
        });
    }
};
