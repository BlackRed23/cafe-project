import type { Response } from 'express';
import { sendError, sendSuccess } from '../../common/response';
import type { AuthenticatedRequest } from '../auth/auth.middleware';
import { createOrder, getAllOrders, getMyOrders, getOrderById, updateOrderStatus } from './order.service';
import type { CreateOrderInput, OrderFiltersInput, OrderStatusInput } from './order.validator';

export const storeOrder = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!req.user) return sendError(res, 401, 'Authentication is required.');
    const order = await createOrder(req.user.id, req.body as CreateOrderInput);
    
    console.log(`\n==================================================`);
    console.log(`🛒 [TẠO ĐƠN HÀNG THÀNH CÔNG]`);
    console.log(`   - Mã đơn hàng : ${order.id}`);
    console.log(`   - Khách hàng   : ${req.user.email}`);
    console.log(`   - Tổng tiền    : ${order.totalAmount ? Number(order.totalAmount).toLocaleString('vi-VN') : 0}đ`);
    console.log(`   - Món đã chọn  : ${order.items?.length || 0} sản phẩm`);
    console.log(`==================================================\n`);

    sendSuccess(res, 201, 'Create order successfully.', { order });
};

export const listMyOrders = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!req.user) return sendError(res, 401, 'Authentication is required.');
    const orders = await getMyOrders(req.user.id);
    sendSuccess(res, 200, 'Get my orders successfully.', { orders });
};

export const findOrder = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!req.user) return sendError(res, 401, 'Authentication is required.');
    const order = await getOrderById(req.params.id, req.user);
    sendSuccess(res, 200, 'Get order successfully.', { order });
};

export const listOrders = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const orders = await getAllOrders(req.query as OrderFiltersInput);
    sendSuccess(res, 200, 'Get orders successfully.', { orders });
};

export const patchOrderStatus = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!req.user) return sendError(res, 401, 'Authentication is required.');
    const order = await updateOrderStatus(req.params.id, req.body as OrderStatusInput, req.user.id);

    console.log(`\n📦 [CẬP NHẬT TRẠNG THÁI ĐƠN HÀNG] ID: ${order.id} | Trạng thái mới: ${order.status}\n`);

    sendSuccess(res, 200, 'Update order status successfully.', { order });
};