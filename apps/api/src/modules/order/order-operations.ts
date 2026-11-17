import { createHash } from 'node:crypto';
import { prisma, Prisma, OrderStatus, ConsumptionStatus } from '@cafe-project/database';
import { HttpError } from '../../common/http-error';
import { roundQty3, roundMoney2 } from '../../common/ingredient-cost.utils';
import { consumeReservedOrder, releaseReservedOrder, orderInclude, type OrderRecord } from './order.repository';
import type { JwtUserPayload } from '../auth/auth.service';

type Tx = Prisma.TransactionClient;
type Item = { productId: string; quantity: number };
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const lock = async (tx: Tx, id: string) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${id} FOR UPDATE`;
    const order = await tx.order.findUnique({ where: { id }, include: orderInclude });
    if (!order) throw new HttpError(404, 'Order not found.');
    return order;
};
const version = (o: OrderRecord, expected: number) => {
    if (o.version !== expected) throw new HttpError(409, 'Order version changed.');
};
const active = (o: OrderRecord) => o.items.filter(i => !i.replacedAt && i.attemptType === 'SALE' && i.consumptionStatus !== 'VOIDED');
const itemTotal = (i: OrderRecord['items'][number]) => i.price.mul(i.quantity).add(i.toppings.reduce((n, t) => n.add(t.price.mul(t.quantity)), new Prisma.Decimal(0)));
const eligibleBefore = (o: OrderRecord) => {
    if (!['PENDING', 'PROCESSING'].includes(o.status) || o.stockDeductedAt) throw new HttpError(409, 'Order already prepared.');
    if (o.paymentStatus === 'PAID' || o.payments.some(p => p.status === 'PAID') || o.payments.some(p => p.method !== 'CASH')) {
        throw new HttpError(409, 'Reconcile existing payment before editing order.');
    }
};
const snapshot = async (tx: Tx, o: OrderRecord, input: Item, actor: string, source?: OrderRecord['items'][number]) => {
    await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${input.productId} FOR SHARE`;
    const product = await tx.product.findUnique({ where: { id: input.productId } });
    if (!product || (!source && (!product.isActive || product.deletedAt || product.requiresRecipe !== true))) throw new HttpError(409, 'Replacement product unavailable or requires ingredient recipe.');
    const recipes = await tx.recipe.findMany({ where: source ? { id: source.recipeId ?? '' } : { productId: product.id, isActive: true }, include: { ingredients: { include: { ingredient: true } } } });
    const recipe = recipes[0], now = new Date();
    if (recipes.length !== 1 || !recipe.ingredients.length || recipe.yieldQuantity.lte(0) ||
        (!source && (recipe.effectiveFrom > now || (recipe.effectiveTo && recipe.effectiveTo <= now))) ||
        recipe.ingredients.some(r => !r.ingredient.isActive || r.ingredient.deletedAt || r.quantityBase.lte(0))) throw new HttpError(409, 'Recipe unavailable.');
    const item = await tx.orderItem.create({ data: { orderId: o.id, productId: product.id, quantity: input.quantity,
        price: source ? source.price : product.price, recipeId: recipe.id, recipeVersion: recipe.version,
        attemptType: source ? 'REMAKE' : 'SALE', originalItemId: source?.id,
        ...(source?.toppings.length ? { toppings: { create: source.toppings.map(t => ({ toppingId: t.toppingId, quantity: t.quantity, price: t.price })) } } : {}) }, include: { toppings: true } });
    const demand = new Map<string, Prisma.Decimal>();
    if (source) {
        // Original reservation ledger is immutable base-unit demand snapshot, including toppings.
        const rows = await tx.inventoryTransaction.findMany({ where: { orderItemId: source.id, type: 'RESERVE', ingredientId: { not: null } } });
        for (const r of rows) demand.set(r.ingredientId!, (demand.get(r.ingredientId!) ?? new Prisma.Decimal(0)).add(r.quantity));
    } else {
        for (const r of recipe.ingredients.filter(r => !r.isOptional)) {
            const qty = roundQty3(r.quantityBase.mul(item.quantity).div(recipe.yieldQuantity));
            if (qty.lte(0)) throw new HttpError(400, 'Ingredient demand below supported precision.');
            demand.set(r.ingredientId, (demand.get(r.ingredientId) ?? new Prisma.Decimal(0)).add(qty));
        }
    }
    for (const [ingredientId, qty] of [...demand].sort(([a], [b]) => a.localeCompare(b))) {
        await tx.$queryRaw`SELECT id FROM "Ingredient" WHERE id = ${ingredientId} FOR UPDATE`;
        const count = await tx.$executeRaw`UPDATE "Ingredient" SET reserved=reserved+${qty}, "rowVersion"="rowVersion"+1, "updatedAt"=now()
          WHERE id=${ingredientId} AND "isActive"=true AND "deletedAt" IS NULL
          AND quantity-reserved-COALESCE((SELECT SUM("quantityRemaining") FROM "IngredientBatch" WHERE "ingredientId"=${ingredientId}
            AND "quantityRemaining">0 AND ("expirationDate"<=clock_timestamp() OR "qualityStatus" IS DISTINCT FROM 'AVAILABLE')),0)>=${qty}`;
        if (count !== 1) throw new HttpError(400, 'Insufficient usable ingredient stock.');
        await tx.inventoryTransaction.create({ data: { ingredientId, orderItemId: item.id, type: 'RESERVE', quantity: qty,
            performedBy: actor, referenceType: 'Order', referenceId: o.id, reason: source ? 'Authorized remake reservation' : 'Replacement reservation' } });
    }
    return item;
};
const replay = async (tx: Tx, orderId: string, requestId: string, digest: string, actor: string) => {
    const op = await tx.orderOperation.findUnique({ where: { orderId_requestId: { orderId, requestId } } });
    if (op && (op.requestHash !== digest || op.actorId !== actor)) throw new HttpError(409, 'requestId payload or actor conflict.');
    return op;
};
const refreshed = (tx: Tx, id: string) => tx.order.findUniqueOrThrow({ where: { id }, include: orderInclude });

export const requestOrderOperation = async (id: string, input: { requestId: string; expectedVersion: number; kind: string; reason: string; originalItemId?: string; replacement?: Item }, user: JwtUserPayload) => prisma.$transaction(async tx => {
    const o = await lock(tx, id), digest = hash(input), prior = await replay(tx, id, input.requestId, digest, user.id);
    if (prior) return prior;
    version(o, input.expectedVersion);
    if (!o.stockDeductedAt || !['PREPARING', 'COMPLETED'].includes(o.status)) throw new HttpError(409, 'Operation requires consumed order.');
    const original = active(o).find(i => i.id === input.originalItemId);
    if (input.kind !== 'CANCEL' && (!original || original.consumptionStatus !== 'COMMITTED')) throw new HttpError(409, 'Original consumed sale item required.');
    if (input.kind === 'CORRECTION' && !input.replacement) throw new HttpError(400, 'Replacement required.');
    const op = await tx.orderOperation.create({ data: { orderId: id, requestId: input.requestId, requestHash: digest,
        kind: input.kind, actorId: user.id, reason: input.reason, originalItemId: input.originalItemId,
        payload: input as Prisma.InputJsonValue } });
    await tx.order.update({ where: { id }, data: { version: { increment: 1 } } }); return op;
}, { timeout: 15000 });

export const approveOrderOperation = async (id: string, operationId: string, expected: number, user: JwtUserPayload) => prisma.$transaction(async tx => {
    if (user.role !== 'ADMIN') throw new HttpError(403, 'ADMIN approval required.');
    const o = await lock(tx, id), op = await tx.orderOperation.findFirst({ where: { id: operationId, orderId: id } });
    if (!op) throw new HttpError(404, 'Operation not found.');
    if (op.status === 'APPLIED') return op;
    version(o, expected);
    if (op.status !== 'REQUESTED' || !o.stockDeductedAt || !['PREPARING', 'COMPLETED'].includes(o.status)) throw new HttpError(409, 'Order no longer eligible.');
    const payload = op.payload as { replacement?: Item };
    const original = active(o).find(i => i.id === op.originalItemId);
    let replacementItemId: string | undefined, amountDelta = new Prisma.Decimal(0);
    if (op.kind === 'CANCEL') {
        await releaseReservedOrder(tx, o, user.id);
        await tx.order.update({ where: { id }, data: { status: OrderStatus.CANCELLED } });
        await tx.payment.updateMany({ where: { orderId: id, status: 'PAID' },
            data: { failureCode: 'REFUND_REQUIRED', failureMessage: 'Authorized cancellation after consumption; refund handled separately.' } });
    } else {
        if (!original || original.consumptionStatus !== 'COMMITTED') throw new HttpError(409, 'Original item already replaced.');
        if (op.kind === 'REMAKE') {
            const attempt = await snapshot(tx, o, { productId: original.productId, quantity: original.quantity }, user.id, original);
            const prepared = await refreshed(tx, id);
            await consumeReservedOrder(tx, { ...prepared, items: prepared.items.filter(i => i.id === attempt.id) }, user.id);
            replacementItemId = attempt.id;
        } else if (op.kind === 'CORRECTION' && payload.replacement) {
            const replacement = await snapshot(tx, o, payload.replacement, user.id);
            replacementItemId = replacement.id;
            await tx.orderItem.update({ where: { id: replacement.id }, data: { originalItemId: original.id } });
            await tx.orderItem.update({ where: { id: original.id }, data: { replacedAt: new Date() } });
            amountDelta = roundMoney2(replacement.price.mul(replacement.quantity).sub(itemTotal(original)));
            await tx.order.update({ where: { id }, data: { adjustmentTotal: { increment: amountDelta }, status: OrderStatus.PREPARING } });
        } else throw new HttpError(409, 'Unknown operation.');
    }
    await tx.order.update({ where: { id }, data: { version: { increment: 1 } } });
    return tx.orderOperation.update({ where: { id: op.id }, data: { status: 'APPLIED', approvedBy: user.id,
        approvedAt: new Date(), replacementItemId, amountDelta } });
}, { timeout: 15000 });

export const editOrderItems = async (id: string, input: { requestId: string; expectedVersion: number; reason: string; items: Item[] }, user: JwtUserPayload) => prisma.$transaction(async tx => {
    const o = await lock(tx, id), digest = hash(input), prior = await replay(tx, id, input.requestId, digest, user.id);
    if (prior) return prior;
    version(o, input.expectedVersion); eligibleBefore(o);
    await releaseReservedOrder(tx, o, user.id);
    await tx.orderItem.updateMany({ where: { orderId: id, consumptionStatus: ConsumptionStatus.VOIDED }, data: { replacedAt: new Date() } });
    const replacements = [];
    for (const item of input.items) replacements.push(await snapshot(tx, o, item, user.id));
    const total = replacements.reduce((sum, item) => sum.add(item.price.mul(item.quantity)), new Prisma.Decimal(o.shippingFee));
    await tx.order.update({ where: { id }, data: { totalAmount: total, version: { increment: 1 } } });
    await tx.payment.updateMany({ where: { orderId: id, status: 'PENDING', method: 'CASH' }, data: { amount: total } });
    return tx.orderOperation.create({ data: { orderId: id, requestId: input.requestId, requestHash: digest, kind: 'EDIT', status: 'APPLIED',
        actorId: user.id, approvedBy: user.id, approvedAt: new Date(), reason: input.reason,
        payload: { input, before: active(o).map(i => ({ id: i.id, productId: i.productId, recipeId: i.recipeId, price: i.price.toString(), quantity: i.quantity })), oldTotal: o.totalAmount.toString(), newTotal: total.toString(), replacementItemIds: replacements.map(i => i.id) } } });
}, { timeout: 15000 });

export const prepareReplacementItem = async (id: string, itemId: string, input: { requestId: string; expectedVersion: number }, user: JwtUserPayload) => prisma.$transaction(async tx => {
    const o = await lock(tx, id), digest = hash({ itemId, ...input }), prior = await replay(tx, id, input.requestId, digest, user.id);
    if (prior) return prior;
    version(o, input.expectedVersion);
    const item = active(o).find(i => i.id === itemId && i.originalItemId && i.consumptionStatus === 'PENDING');
    if (o.status !== 'PREPARING' || !item) throw new HttpError(409, 'Pending replacement required.');
    await consumeReservedOrder(tx, { ...o, items: [item] }, user.id);
    await tx.order.update({ where: { id }, data: { version: { increment: 1 } } });
    return tx.orderOperation.create({ data: { orderId: id, requestId: input.requestId, requestHash: digest,
        kind: 'PREPARE_REPLACEMENT', status: 'APPLIED', actorId: user.id, approvedBy: user.id, approvedAt: new Date(),
        reason: 'Start replacement preparation', originalItemId: item.originalItemId, replacementItemId: item.id, payload: input } });
}, { timeout: 15000 });
