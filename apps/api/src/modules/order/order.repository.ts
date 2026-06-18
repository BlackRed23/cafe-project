import { InventoryTransactionType, OrderStatus, type Prisma } from '@cafe-project/database';
import { prisma } from '../../common/prisma';
import type { CreateOrderInput, OrderFiltersInput } from './order.validator';
import { detectShippingZone, calculateShippingFee } from './shipping.service';

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
        return prisma.$transaction(async (tx) => {
            const productIds = input.items.map((item) => item.productId);
            const products = await tx.product.findMany({
                where: { id: { in: productIds }, isActive: true },
                include: { inventory: true }
            });

            const productById = new Map(products.map((product) => [product.id, product]));
            let totalAmount = 0;

            // === KIỂM TRA TỒN KHO TRƯỚC KHI ĐẶT ===
            for (const item of input.items) {
                const product = productById.get(item.productId);
                if (!product) throw new Error(`Không tìm thấy sản phẩm.`);
                if (!product.inventory || product.inventory.quantity < item.quantity) {
                    throw new Error(
                        `Sản phẩm "${product.name}" không đủ hàng. ` +
                        `Còn lại: ${product.inventory?.quantity ?? 0}, bạn đặt: ${item.quantity}.`
                    );
                }
                totalAmount += Number(product.price) * item.quantity;
            }

            // === TÍNH PHÍ GIAO HÀNG ===
            const subtotal = totalAmount;
            const shippingZone = detectShippingZone(input.shippingAddress ?? '');
            const shippingFee = calculateShippingFee(shippingZone, subtotal);
            const grandTotal = subtotal + shippingFee;

            // === TẠO ĐƠN HÀNG ===
            const order = await tx.order.create({
                data: {
                    userId,
                    status: OrderStatus.PENDING,
                    totalAmount: grandTotal,
                    shippingFee: shippingFee,
                    shippingZone: shippingZone,
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

            // === TRỪ KHO NGAY KHI ĐẶT HÀNG ===
            for (const item of input.items) {
                const inventory = await tx.inventory.findUnique({ where: { productId: item.productId } });
                if (!inventory) continue;
                const updated = await tx.inventory.updateMany({
                    where: { id: inventory.id, quantity: { gte: item.quantity } },
                    data: { quantity: { decrement: item.quantity } }
                });
                if (updated.count !== 1) {
                    const product = productById.get(item.productId)!;
                    throw new Error(`Sản phẩm "${product.name}" vừa hết hàng. Vui lòng thử lại.`);
                }
                await tx.inventoryTransaction.create({
                    data: {
                        productId: item.productId,
                        userId,
                        type: InventoryTransactionType.ORDER,
                        quantity: -item.quantity,
                        reason: `Đặt hàng ${order.id}`
                    }
                });
            }

            return order;
        });
    },

    async updateStatus(order: OrderRecord, nextStatus: OrderStatus, userId: string): Promise<OrderRecord> {
        return prisma.$transaction(async (tx) => {
            // === HOÀN KHO KHI HỦY ĐƠN (ở bất kỳ trạng thái nào) ===
            if (nextStatus === OrderStatus.CANCELLED) {
                for (const item of order.items) {
                    const inventory = await tx.inventory.findUnique({ where: { productId: item.productId } });
                    if (!inventory) continue;
                    await tx.inventory.update({
                        where: { id: inventory.id },
                        data: { quantity: { increment: item.quantity } }
                    });
                    await tx.inventoryTransaction.create({
                        data: {
                            productId: item.productId,
                            userId,
                            type: InventoryTransactionType.CANCEL,
                            quantity: item.quantity,
                            reason: `Hủy đơn hàng ${order.id}`
                        }
                    });
                }
            }

            return tx.order.update({ where: { id: order.id }, data: { status: nextStatus }, include: orderInclude });
        });
    }
};
