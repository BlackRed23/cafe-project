import { Router } from 'express';
import { UserRole } from '@cafe-project/database';
import { asyncHandler } from '../../common/async-handler';
import { sendSuccess } from '../../common/response';
import { validateBody } from '../../common/validate';
import { authMiddleware, roleMiddleware, type AuthenticatedRequest } from '../auth/auth.middleware';
import {
    stocktakeCreateSchema, stocktakeEntrySchema, stocktakeSubmitSchema, stocktakeDecisionSchema
} from './stocktake.validator';
import { stocktakeService } from './stocktake.service';

export const stocktakeRoutes = Router();
stocktakeRoutes.use(authMiddleware, roleMiddleware(UserRole.ADMIN, UserRole.STAFF));
stocktakeRoutes.post('/', validateBody(stocktakeCreateSchema), asyncHandler(async (req: AuthenticatedRequest, res) => {
    sendSuccess(res, 201, 'Đã mở phiên kiểm kê.', await stocktakeService.create(req.body, req.user!));
}));
stocktakeRoutes.get('/:id', asyncHandler(async (req: AuthenticatedRequest, res) => {
    sendSuccess(res, 200, 'Phiên kiểm kê và dữ liệu kiểm đếm.', await stocktakeService.get(req.params.id!, req.user!));
}));
stocktakeRoutes.post('/:id/entries', validateBody(stocktakeEntrySchema), asyncHandler(async (req: AuthenticatedRequest, res) => {
    sendSuccess(res, 200, 'Đã lưu kết quả đếm có phiên bản.', await stocktakeService.save(req.params.id!, req.body, req.user!));
}));
stocktakeRoutes.post('/:id/submit', validateBody(stocktakeSubmitSchema), asyncHandler(async (req: AuthenticatedRequest, res) => {
    sendSuccess(res, 200, 'Đã nộp kiểm kê hoặc chuyển điều tra.', await stocktakeService.submit(req.params.id!, req.body, req.user!));
}));
stocktakeRoutes.post('/:id/approve', roleMiddleware(UserRole.ADMIN), validateBody(stocktakeSubmitSchema),
    asyncHandler(async (req: AuthenticatedRequest, res) => {
        sendSuccess(res, 200, 'Đã xét duyệt kiểm kê.', await stocktakeService.approve(req.params.id!, req.body, req.user!));
    }));
stocktakeRoutes.post('/:id/reject', roleMiddleware(UserRole.ADMIN), validateBody(stocktakeDecisionSchema),
    asyncHandler(async (req: AuthenticatedRequest, res) => {
        sendSuccess(res, 200, 'Đã từ chối kiểm kê và lưu lý do.', await stocktakeService.reject(req.params.id!, req.body, req.user!));
    }));
stocktakeRoutes.post('/:id/reopen', roleMiddleware(UserRole.ADMIN), validateBody(stocktakeDecisionSchema),
    asyncHandler(async (req: AuthenticatedRequest, res) => {
        sendSuccess(res, 200, 'Đã yêu cầu kiểm kê lại và giữ lịch sử.', await stocktakeService.reopen(req.params.id!, req.body, req.user!));
    }));
