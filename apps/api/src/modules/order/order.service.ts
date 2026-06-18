import { OrderStatus, PaymentStatus } from '@cafe-project/database';
import { HttpError } from '../../common/http-error';
import type { JwtUserPayload } from '../auth/auth.service';
import { orderRepository, type OrderRecord } from './order.repository';
import type { CreateOrderInput, OrderFiltersInput, OrderStatusInput } from './order.validator';
import { agentService } from '../agent/agent.service';

export type OrderDto = ReturnType<typeof toOrderDto>;

const toOrderDto = (order: OrderRecord) => ({
    id: order.id,
    userId: order.userId,
    customer: order.user,
    status: order.status,
    displayStatus: order.status === OrderStatus.PROCESSING ? 'CONFIRMED' : order.status,
    totalAmount: Number(order.totalAmount),
    paymentStatus: order.payment?.status ?? 'PENDING',
    payment: order.payment ? { ...order.payment, amount: Number(order.payment.amount) } : null,
    items: order.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.product.name,
        productSku: item.product.sku,
        quantity: item.quantity,
        unitPrice: Number(item.price),
        subtotal: Number(item.price) * item.quantity
    })),
    createdAt: order.createdAt,
    updatedAt: order.updatedAt
});

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

const assertTransition = (order: OrderRecord, next: OrderStatus): void => {
    const current = order.status;

    if (current === OrderStatus.CANCELLED && next === OrderStatus.PENDING) {
        if (order.payment?.status === PaymentStatus.PAID) {
            throw new HttpError(400, 'Không thể khôi phục đơn hàng đã thanh toán.');
        }

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
    const message = error instanceof Error ? error.message : fallback;

    if (message.includes('Not enough inventory')) {
        return new HttpError(400, 'Không đủ tồn kho để xác nhận đơn hàng.');
    }

    return new HttpError(400, fallback);
};

export const createOrder = async (userId: string, input: CreateOrderInput): Promise<OrderDto> => {
    try {
        return toOrderDto(await orderRepository.create(userId, input));
    } catch (error) {
        throw normalizeOrderError(error, 'Không thể tạo đơn hàng. Vui lòng kiểm tra lại thông tin đơn hàng.');
    }
};

export const getMyOrders = async (userId: string): Promise<OrderDto[]> => {
    return (await orderRepository.findByUser(userId)).map(toOrderDto);
};

export const getAllOrders = async (filters: OrderFiltersInput): Promise<OrderDto[]> => {
    return (await orderRepository.findMany(filters)).map(toOrderDto);
};

export const getOrderById = async (id: string, user: JwtUserPayload): Promise<OrderDto> => {
    const order = await ensureOrderExists(id);
    assertCanView(order, user);
    return toOrderDto(order);
};

export const updateOrderStatus = async (id: string, input: OrderStatusInput, userId: string): Promise<OrderDto> => {
    const order = await ensureOrderExists(id);
    const nextStatus = normalizeStatus(input.status);
    assertTransition(order, nextStatus);

    try {
        const updatedOrder = await orderRepository.updateStatus(order, nextStatus, userId);

        if (nextStatus === OrderStatus.PROCESSING && order.status === OrderStatus.PENDING) {
            const productIds = updatedOrder.items.map((item) => item.productId);
            // Async trigger agent to scan inventory
            agentService.scanInventory({ productIds, triggerType: 'ORDER' }, userId).catch(console.error);
        }

        return toOrderDto(updatedOrder);
    } catch (error) {
        throw normalizeOrderError(error, 'Không thể cập nhật trạng thái đơn hàng.');
    }
};
