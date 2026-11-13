import { createHash, randomUUID } from 'node:crypto';
import { OrderStatus, Prisma, prisma } from '@cafe-project/database';
import { HttpError } from '../../common/http-error';
import { activeRecipe, recipeNeeds } from '../../common/recipe-stock';
import { lockStock, reserveIngredient, finishReservation } from './order-stock';
import { reservationUnits } from './order-snapshot';
import type { CreateOrderInput, OrderFiltersInput } from './order.validator';
import { detectShippingZone, calculateShippingFee } from './shipping.service';

const orderInclude = { user: { select: { id: true, name: true, email: true } }, items: { include: { product: true } }, payments: true } satisfies Prisma.OrderInclude;
export type OrderRecord = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

export const orderRepository = {
    async findMany(filters: OrderFiltersInput = {}): Promise<OrderRecord[]> {
        return prisma.order.findMany({ where: { ...(filters.status ? { status: filters.status } : {}), ...(filters.paymentStatus ? { paymentStatus: filters.paymentStatus } : {}) }, include: orderInclude, orderBy: { createdAt: 'desc' } });
    },
    async findByUser(userId: string): Promise<OrderRecord[]> { return prisma.order.findMany({ where: { userId }, include: orderInclude, orderBy: { createdAt: 'desc' } }); },
    async findById(id: string): Promise<OrderRecord | null> { return prisma.order.findUnique({ where: { id }, include: orderInclude }); },
    async create(userId: string, input: CreateOrderInput): Promise<OrderRecord> {
        return prisma.$transaction(async tx => {
            const key = input.idempotencyKey ? `order-create:${digest(input.idempotencyKey)}` : undefined;
            const fingerprint = digest(JSON.stringify({ ...input, idempotencyKey: undefined, userId }));
            if (key) {
                // One transaction-level lock also serializes same key for different ingredients.
                await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
                const prior = await tx.inventoryTransaction.findUnique({ where: { idempotencyKey: key }, include: { orderItem: { include: { order: { include: orderInclude } } } } });
                if (prior) {
                    const snapshot = prior.orderItem?.costBreakdown;
                    if (!prior.orderItem || !snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot) || snapshot.commandFingerprint !== fingerprint ||
                        prior.performedBy !== userId) throw new HttpError(409, 'Order idempotencyKey đã được dùng cho yêu cầu khác.');
                    return prior.orderItem.order;
                }
            }
            const products = await tx.product.findMany({ where: { id: { in: input.items.map(i => i.productId) }, isActive: true, deletedAt: null },
                include: { recipes: { include: { ingredients: { include: { ingredient: { include: { batches: true } } } } } } } });
            const plans = input.items.map(item => {
                const product = products.find(p => p.id === item.productId);
                if (!product) throw new HttpError(400, 'Không tìm thấy sản phẩm đang bán.');
                const recipe = activeRecipe(product.recipes);
                return { item, product, recipe, orderItemId: randomUUID(), needs: recipeNeeds(recipe, item.quantity) };
            });
            const totals = new Map<string, Prisma.Decimal>();
            for (const plan of plans) for (const [id, amount] of plan.needs) totals.set(id, (totals.get(id) ?? new Prisma.Decimal(0)).plus(amount));
            await lockStock(tx, [...totals.keys()]);
            for (const [id, amount] of totals) await reserveIngredient(tx, id, amount);
            const subtotal = plans.reduce((s, p) => s.plus(p.product.price.times(p.item.quantity)), new Prisma.Decimal(0));
            const shippingZone = detectShippingZone(input.shippingAddress ?? '');
            const shippingFee = calculateShippingFee(shippingZone, subtotal.toNumber());
            const grandTotal = subtotal.plus(shippingFee);
            if (grandTotal.lt(0) || grandTotal.gt('9999999999.99') || grandTotal.decimalPlaces() > 2) throw new HttpError(400, 'Tổng đơn vượt giới hạn tiền tệ.');
            const order = await tx.order.create({ data: { userId, status: 'PENDING', totalAmount: grandTotal, shippingFee, shippingZone,
                shippingName: input.shippingName, shippingPhone: input.shippingPhone, shippingAddress: input.shippingAddress, note: input.note,
                paymentMethod: input.paymentMethod, payments: { create: { method: input.paymentMethod, amount: grandTotal, currency: 'VND', status: 'PENDING' } },
                items: { create: plans.map(p => ({ id: p.orderItemId, productId: p.product.id, quantity: p.item.quantity, price: p.product.price,
                    recipeId: p.recipe.id, recipeVersion: p.recipe.version, consumptionStatus: 'PENDING',
                    costBreakdown: { schema: 'api-recipe-v1', commandFingerprint: fingerprint, recipeId: p.recipe.id, recipeVersion: p.recipe.version, servings: p.item.quantity,
                        ingredients: [...p.needs].map(([ingredientId, quantity]) => ({ ingredientId, quantityBase: quantity.toString(),
                            baseUnit: p.recipe.ingredients.find(line => line.ingredientId === ingredientId)!.ingredient.baseUnit })) }
                })) }
            }, include: orderInclude });
            let first = true;
            for (let index = 0; index < plans.length; index++) {
                const plan = plans[index]!;
                for (const [ingredientId, amount] of plan.needs) {
                    await tx.inventoryTransaction.create({ data: { ingredientId, orderItemId: plan.orderItemId, type: 'RESERVE', quantity: amount,
                        performedBy: userId, referenceType: 'ORDER', referenceId: order.id,
                        idempotencyKey: first && key ? key : `order:${plan.orderItemId}:reserve:${ingredientId}`, reason: `Giữ nguyên liệu cho đơn ${order.id}` } });
                    first = false;
                }
            }
            return order;
        });
    },
    async updateStatus(order: OrderRecord, next: OrderStatus, userId: string): Promise<OrderRecord> {
        return prisma.$transaction(async tx => {
            await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${order.id} FOR UPDATE`;
            const current = await tx.order.findUnique({ where: { id: order.id }, include: orderInclude });
            if (!current) throw new HttpError(404, 'Order not found.');
            if (current.status === next) return current;
            const allowed = new Set(['PENDING->PROCESSING', 'PROCESSING->COMPLETED', 'PENDING->CANCELLED', 'PROCESSING->CANCELLED']);
            if (!allowed.has(`${current.status}->${next}`)) throw new HttpError(409, 'Trạng thái đơn đã thay đổi hoặc chuyển bước không hợp lệ.');
            if (next === 'COMPLETED' || next === 'CANCELLED') {
                const reservations = await tx.inventoryTransaction.findMany({ where: { referenceType: 'ORDER', referenceId: current.id, type: 'RESERVE' } });
                if (current.items.some(item => item.consumptionStatus !== 'PENDING' || !item.recipeId || !item.recipeVersion ||
                    !reservations.some(r => r.orderItemId === item.id)) || reservations.some(r => !r.orderItemId || !r.quantity.gt(0))) {
                    throw new HttpError(409, 'BLOCKED: thiếu snapshot/giữ kho; cần đối soát đơn lịch sử, không tự hoàn kho.');
                }
                await lockStock(tx, reservations.map(r => r.ingredientId));
                const units = reservationUnits(current.items, reservations);
                for (const r of reservations) await finishReservation(tx, r.ingredientId, r.quantity, current.id, r.orderItemId!, userId, next === 'COMPLETED', units.get(`${r.orderItemId}:${r.ingredientId}`)!);
                await tx.orderItem.updateMany({ where: { orderId: current.id }, data: next === 'COMPLETED'
                    ? { consumptionStatus: 'COMMITTED', committedAt: new Date() } : { consumptionStatus: 'VOIDED_BEFORE_START', voidedAt: new Date() } });
            }
            return tx.order.update({ where: { id: current.id }, data: { status: next }, include: orderInclude });
        });
    }
};
