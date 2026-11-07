import { OrderStatus, PaymentMethod, PaymentStatus, TransactionStatus } from '@cafe-project/database';
import { HttpError } from '../../common/http-error';
import type { JwtUserPayload } from '../auth/auth.service';
import { MANUAL_CONFIRMABLE_METHODS } from '../payment/payment.service';
import { orderRepository, type OrderRecord } from './order.repository';
import type {
    ConfirmPaymentInput,
    CreateOrderInput,
    OrderFiltersInput,
    OrderStatusInput
} from './order.validator';
import { scanInventoryViaAgentService, createAgentLogViaAgentService } from '../agent/agent.client';

export type OrderDto = ReturnType<typeof toOrderDto>;

const toOrderDto = (order: OrderRecord, includeCost = false) => {
    const latestPayment = order.payments?.[0] ?? null;

    const totalCogs = order.items.reduce((sum, item) => sum + Number(item.totalCost || 0), 0);
    const totalGrossProfit = order.items.reduce((sum, item) => sum + Number(item.grossProfit || 0), 0);

    const sanitizedPayment = latestPayment
        ? {
              id: latestPayment.id,
              orderId: latestPayment.orderId,
              method: latestPayment.method,
              merchantRef: latestPayment.merchantRef ?? null,
              providerTxnId: latestPayment.providerTxnId ?? null,
              attemptNo: latestPayment.attemptNo,
              amount: Number(latestPayment.amount),
              currency: latestPayment.currency,
              status: latestPayment.status,
              failureCode: latestPayment.failureCode ?? null,
              failureMessage: latestPayment.failureMessage ?? null,
              paidAt: latestPayment.paidAt ?? null,
              expiresAt: latestPayment.expiresAt ?? null,
              createdAt: latestPayment.createdAt,
              updatedAt: latestPayment.updatedAt
          }
        : null;

    return {
        id: order.id,
        userId: order.userId,
        customer: order.user,
        status: order.status,
        displayStatus: order.status === OrderStatus.PROCESSING ? 'CONFIRMED' : order.status,
        totalAmount: Number(order.totalAmount),
        shippingFee: Number(order.shippingFee),
        shippingZone: order.shippingZone ?? null,
        paymentStatus: order.paymentStatus ?? PaymentStatus.PENDING,
        paymentMethod: order.paymentMethod ?? latestPayment?.method ?? null,
        payment: sanitizedPayment,
        shippingName: order.shippingName ?? null,
        shippingPhone: order.shippingPhone ?? null,
        shippingAddress: order.shippingAddress ?? null,
        note: order.note ?? null,
        stockDeductedAt: order.stockDeductedAt ?? null,
        ...(includeCost
            ? {
                  totalCogs,
                  grossProfit: totalGrossProfit
              }
            : {}),
        items: order.items.map((item) => {
            const toppingsSubtotal = (item.toppings ?? []).reduce(
                (sum, t) => sum + Number(t.price) * t.quantity,
                0
            );
            const subtotal = Number(item.price) * item.quantity + toppingsSubtotal;

            return {
                id: item.id,
                orderId: item.orderId,
                productId: item.productId,
                productName: item.product.name,
                productSku: item.product.sku,
                recipeId: item.recipeId ?? null,
                recipeVersion: item.recipeVersion ?? null,
                consumptionStatus: item.consumptionStatus,
                quantity: item.quantity,
                price: Number(item.price),
                unitPrice: Number(item.price),
                subtotal,
                ...(includeCost
                    ? {
                          ingredientCost: Number(item.ingredientCost || 0),
                          toppingCost: Number(item.toppingCost || 0),
                          totalCost: Number(item.totalCost || 0),
                          grossProfit: Number(item.grossProfit || 0)
                      }
                    : {}),
                toppings: (item.toppings ?? []).map((t) => ({
                    id: t.id,
                    toppingId: t.toppingId,
                    toppingName: t.topping?.name ?? '',
                    quantity: t.quantity,
                    price: Number(t.price),
                    ...(includeCost ? { costSnapshot: Number(t.costSnapshot || 0) } : {})
                })),
                product: {
                    id: item.product.id,
                    name: item.product.name,
                    sku: item.product.sku,
                    unit: item.product.servingUnit ?? 'hộp',
                    imageUrl: item.product.imageUrl ?? null
                }
            };
        }),
        createdAt: order.createdAt,
        updatedAt: order.updatedAt
    };
};

const ensureOrderExists = async (id: string): Promise<OrderRecord> => {
    const order = await orderRepository.findById(id);
    if (!order) throw new HttpError(404, 'Order not found.');
    return order;
};

const normalizeStatus = (status: OrderStatusInput['status']): OrderStatus => {
    if (status === 'CONFIRMED') return OrderStatus.PROCESSING;
    return status as OrderStatus;
};

const assertCanView = (order: OrderRecord, user: JwtUserPayload): void => {
    if (user.role === 'CUSTOMER' && order.userId !== user.id) throw new HttpError(403, 'Forbidden.');
};

const assertCanManuallyMarkPaid = (order: OrderRecord): void => {
    const latestPayment = order.payments?.[0] ?? null;
    const effectiveMethod = latestPayment?.method ?? order.paymentMethod ?? PaymentMethod.CASH;

    if (!MANUAL_CONFIRMABLE_METHODS.has(effectiveMethod)) {
        if (latestPayment?.status !== TransactionStatus.PAID && order.paymentStatus !== PaymentStatus.PAID) {
            throw new HttpError(
                409,
                'Đơn đang chờ cổng thanh toán xác nhận, không thể xác nhận thủ công.'
            );
        }
    }
};

const assertTransition = (order: OrderRecord, next: OrderStatus, paymentStatus?: PaymentStatus): void => {
    const current = order.status;

    if (current === next && paymentStatus) {
        return;
    }

    const allowed = new Set([
        `${OrderStatus.PENDING}->${OrderStatus.PROCESSING}`,
        `${OrderStatus.PROCESSING}->${OrderStatus.COMPLETED}`,
        `${OrderStatus.PENDING}->${OrderStatus.CANCELLED}`,
        `${OrderStatus.PROCESSING}->${OrderStatus.CANCELLED}`
    ]);

    if (allowed.has(`${current}->${next}`)) return;

    if (current === OrderStatus.PENDING && next === OrderStatus.COMPLETED) {
        throw new HttpError(400, 'Không thể hoàn tất đơn hàng vì đơn chưa được xác nhận.');
    }

    if (current === OrderStatus.CANCELLED && next === OrderStatus.PROCESSING) {
        throw new HttpError(400, 'Không thể xác nhận đơn hàng đã bị hủy.');
    }

    if (current === OrderStatus.COMPLETED && next === OrderStatus.CANCELLED) {
        throw new HttpError(400, 'Không thể hủy đơn hàng đã hoàn tất.');
    }

    if (current === OrderStatus.COMPLETED && next === OrderStatus.PENDING) {
        throw new HttpError(400, 'Không thể khôi phục đơn hàng đã hoàn tất.');
    }

    if (current === OrderStatus.CANCELLED) {
        throw new HttpError(400, 'Đơn hàng đã bị hủy. Không thể thực hiện thêm thao tác.');
    }

    if (current === OrderStatus.COMPLETED) {
        throw new HttpError(400, 'Đơn hàng đã hoàn tất. Không thể thay đổi trạng thái.');
    }

    throw new HttpError(400, 'Không thể cập nhật trạng thái đơn hàng ở bước hiện tại.');
};

const normalizeOrderError = (error: unknown, fallback: string): HttpError => {
    if (error instanceof HttpError) {
        return error;
    }

    const message = error instanceof Error ? error.message : fallback;
    const lower = message.toLowerCase();

    if (
        lower.includes('not enough inventory') ||
        lower.includes('inventory') ||
        lower.includes('stock') ||
        lower.includes('không đủ') ||
        lower.includes('tồn kho') ||
        lower.includes('nguyên liệu') ||
        lower.includes('vừa hết hàng')
    ) {
        return new HttpError(400, message.includes('nguyên liệu') ? message : 'Không đủ tồn kho để tạo/cập nhật đơn hàng, vui lòng giảm số lượng hoặc kiểm tra lại tồn kho khả dụng.');
    }

    if (
        lower.includes('product not found') ||
        lower.includes('không tìm thấy sản phẩm') ||
        lower.includes('inactive') ||
        lower.includes('not available')
    ) {
        return new HttpError(400, 'Sản phẩm không còn khả dụng, vui lòng cập nhật giỏ hàng.');
    }

    return new HttpError(400, fallback);
};

export const createOrder = async (userId: string, input: CreateOrderInput, includeCost = false): Promise<OrderDto> => {
    try {
        return toOrderDto(await orderRepository.create(userId, input), includeCost);
    } catch (error) {
        throw normalizeOrderError(error, 'Không thể tạo đơn hàng. Vui lòng kiểm tra lại thông tin đơn hàng.');
    }
};

export const getMyOrders = async (userId: string): Promise<OrderDto[]> => {
    return (await orderRepository.findByUser(userId)).map((o) => toOrderDto(o, false));
};

export const getAllOrders = async (filters: OrderFiltersInput): Promise<OrderDto[]> => {
    return (await orderRepository.findMany(filters)).map((o) => toOrderDto(o, true));
};

export const getOrderById = async (id: string, user: JwtUserPayload): Promise<OrderDto> => {
    const order = await ensureOrderExists(id);
    assertCanView(order, user);
    const includeCost = user.role === 'ADMIN' || user.role === 'STAFF';
    return toOrderDto(order, includeCost);
};

/**
 * BUG-1: Endpoint chuyên dụng xác nhận đã nhận tiền thủ công (CASH / BANK_TRANSFER / VIET_QR)
 */
export const confirmOrderPayment = async (
    id: string,
    input: ConfirmPaymentInput,
    userId: string
): Promise<OrderDto> => {
    const order = await ensureOrderExists(id);

    if (order.status === OrderStatus.CANCELLED) {
        throw new HttpError(409, 'Không thể xác nhận thanh toán cho đơn hàng đã hủy.');
    }

    if (order.paymentStatus === PaymentStatus.PAID || order.payments.some((p) => p.status === TransactionStatus.PAID)) {
        throw new HttpError(409, 'Đơn hàng này đã được thanh toán.');
    }

    assertCanManuallyMarkPaid(order);

    const updatedOrder = await orderRepository.confirmManualPayment(order, userId, input.note);

    createAgentLogViaAgentService({
        action: 'PAYMENT_CONFIRMED_MANUAL',
        result: 'SUCCESS',
        reasoning: `Đã xác nhận thanh toán thủ công cho đơn hàng ${order.id}.`,
        input: {
            orderId: order.id,
            paymentMethod: order.paymentMethod,
            confirmedBy: userId,
            note: input.note ?? null
        }
    }).catch(() => {});

    return toOrderDto(updatedOrder, true);
};

export const updateOrderStatus = async (id: string, input: OrderStatusInput, userId: string): Promise<OrderDto> => {
    const order = await ensureOrderExists(id);
    const nextStatus = normalizeStatus(input.status);
    assertTransition(order, nextStatus, input.paymentStatus);

    if (input.paymentStatus === PaymentStatus.PAID && order.paymentStatus !== PaymentStatus.PAID) {
        if (order.status === OrderStatus.CANCELLED || nextStatus === OrderStatus.CANCELLED) {
            throw new HttpError(409, 'Không thể xác nhận thanh toán cho đơn hàng đã hủy.');
        }
        assertCanManuallyMarkPaid(order);
    }

    try {
        const updatedOrder = await orderRepository.updateStatus(order, nextStatus, userId, input.paymentStatus);

        if (nextStatus === OrderStatus.COMPLETED && !order.stockDeductedAt) {
            const productIds = updatedOrder.items.map((item) => item.productId);
            createAgentLogViaAgentService({
                action: 'ORDER_COMPLETED',
                result: 'SUCCESS',
                reasoning: `Đơn hàng ${updatedOrder.id.slice(-6)} đã hoàn thành. Tồn kho thật đã được trừ.`,
                input: {
                    orderId: updatedOrder.id,
                    orderNumber: updatedOrder.id,
                    productIds: productIds,
                    triggerType: 'ORDER_COMPLETED'
                },
                output: {
                    description: `Đơn hàng ${updatedOrder.id.slice(-6)} đã hoàn thành. Tồn kho thật đã được trừ.`
                },
                creator: userId ? { connect: { id: userId } } : undefined
            }).catch(console.error);

            scanInventoryViaAgentService({
                productIds,
                triggerType: 'ORDER_COMPLETED',
                sourceType: 'ORDER',
                sourceId: id
            }, userId).catch((error) => {
                console.error('[AI_AGENT] Failed to scan inventory after order completed', error);
            });
        }

        return toOrderDto(updatedOrder, true);
    } catch (error) {
        throw normalizeOrderError(error, 'Không thể cập nhật trạng thái đơn hàng.');
    }
};

/**
 * BUG-6 (Mở rộng): Tự động hủy các đơn hàng Online (MOMO / VNPAY) quá hạn chưa thanh toán
 * và hoàn trả tồn kho giữ chỗ (Ingredient.reserved / Inventory.reservedStock).
 */
export const resolveUnpaidOnlineOrderCancelMinutes = (rawEnvValue?: string): number => {
    const parsed = Number(rawEnvValue ?? process.env.UNPAID_ONLINE_ORDER_CANCEL_MINUTES ?? 120);
    if (!Number.isFinite(parsed) || parsed < 15) {
        return 120;
    }
    return Math.floor(parsed);
};

export const autoCancelStaleUnpaidOnlineOrders = async (
    now: Date = new Date(),
    overrideMinutes?: number
): Promise<{ cancelledCount: number; failedCount: number; cancelledOrderIds: string[] }> => {
    const cancelMinutes = overrideMinutes ?? resolveUnpaidOnlineOrderCancelMinutes();
    const cutoffDate = new Date(now.getTime() - cancelMinutes * 60 * 1000);
    const staleOrders = await orderRepository.findStaleUnpaidOnlineOrders(cutoffDate, now);

    let cancelledCount = 0;
    let failedCount = 0;
    const cancelledOrderIds: string[] = [];

    for (const order of staleOrders) {
        try {
            await orderRepository.updateStatus(order, OrderStatus.CANCELLED, null, PaymentStatus.FAILED);
            cancelledCount++;
            cancelledOrderIds.push(order.id);

            createAgentLogViaAgentService({
                action: 'ORDER_AUTO_CANCELLED_UNPAID',
                result: 'SUCCESS',
                reasoning: `Đơn hàng online ${order.id} (${order.paymentMethod}) đã tự động hủy sau ${cancelMinutes} phút chưa thanh toán và hoàn trả tồn kho giữ chỗ.`,
                input: {
                    orderId: order.id,
                    paymentMethod: order.paymentMethod,
                    createdAt: order.createdAt.toISOString(),
                    cancelMinutes
                }
            }).catch(() => {});
        } catch (error: any) {
            failedCount++;
            console.error(`[ORDER][CRON] Không thể tự động hủy đơn quá hạn ${order.id}: ${error?.message ?? error}`);
        }
    }

    return { cancelledCount, failedCount, cancelledOrderIds };
};
