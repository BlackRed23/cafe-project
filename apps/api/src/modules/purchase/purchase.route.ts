import { Router } from 'express';
import { asyncHandler } from '../../common/async-handler';
import { validateBody } from '../../common/validate';
import { authenticate, requireRole } from '../auth/auth.middleware';
import { approvePurchaseRequest, completePurchaseRequest, findPurchaseRequest, listPurchaseRequests, markPurchaseRequestPaid, markPurchaseRequestSent, receivePurchaseRequest, rejectPurchaseRequest, removePurchaseRequest, storePurchaseRequest } from './purchase.controller';
import { createPurchaseRequestSchema, markPurchaseRequestPaidSchema, receivePurchaseRequestSchema, rejectPurchaseRequestSchema } from './purchase.validator';
import { getEmailPreview, sendEmail, retryEmail } from '../email/email.controller';
import { purchaseOrderService } from './purchase-order.service';
import {
    poCreateSchema, poDispatchSchema, poDecisionSchema, poCancelSchema,
    poSelectSupplierSchema, poReceiptSchema, poDiscrepancySchema, poReturnSchema,
    poInvoiceSchema, purchasingHoldSchema, purchasingAssignSchema,
    poOverdeliveryAmendmentSchema, poShelfLifeRuleSchema, poCancelResolutionSchema,
    purchasingAggregationSchema
} from './purchase-order.validator';
import { sendSuccess } from '../../common/response';
import type { AuthenticatedRequest } from '../auth/auth.middleware';
import { prisma } from '@cafe-project/database';

const router = Router();
const canView = [authenticate, requireRole(['ADMIN', 'STAFF'])];
const adminOnly = [authenticate, requireRole(['ADMIN'])];

// Explicit PO contract. All external supplier dispatch is disabled for this
// implementation: SANDBOX/UNKNOWN actions are audit-only, no SMTP call.
export const purchaseOrderRoutes = Router();
purchaseOrderRoutes.post('/', ...adminOnly, validateBody(poCreateSchema),
    asyncHandler(async (req: AuthenticatedRequest, res) =>
        sendSuccess(res, 201, 'Đã lập PO từ yêu cầu được duyệt.',
            await purchaseOrderService.create(req.body, req.user!))));
purchaseOrderRoutes.get('/:id', ...adminOnly, asyncHandler(async (req: AuthenticatedRequest, res) =>
    sendSuccess(res, 200, 'Chi tiết PO và lịch sử nghiệp vụ.',
        await purchaseOrderService.get(req.params.id!, req.user!))));
purchaseOrderRoutes.post('/:id/dispatch', ...adminOnly, validateBody(poDispatchSchema),
    asyncHandler(async (req: AuthenticatedRequest, res) =>
        sendSuccess(res, 200, 'Đã ghi nhận trạng thái điều phối thử, không liên hệ nhà cung cấp.',
            await purchaseOrderService.dispatch(req.params.id!, req.body, req.user!))));
purchaseOrderRoutes.post('/:id/confirm', ...adminOnly, validateBody(poDecisionSchema),
    asyncHandler(async (req: AuthenticatedRequest, res) =>
        sendSuccess(res, 200, 'Đã ghi nhận chứng cứ xác nhận thủ công; nhà cung cấp chưa được xác minh độc lập.',
            await purchaseOrderService.confirm(req.params.id!, req.body, req.user!))));
purchaseOrderRoutes.post('/:id/reject', ...adminOnly, validateBody(poDecisionSchema),
    asyncHandler(async (req: AuthenticatedRequest, res) =>
        sendSuccess(res, 200, 'Đã ghi nhận từ chối PO theo xác nhận thủ công.',
            await purchaseOrderService.reject(req.params.id!, req.body, req.user!))));
purchaseOrderRoutes.post('/:id/cancel', ...adminOnly, validateBody(poCancelSchema),
    asyncHandler(async (req: AuthenticatedRequest, res) =>
        sendSuccess(res, 200, 'Đã ghi nhận hủy PO và giữ lịch sử nhập trước đó.',
            await purchaseOrderService.cancel(req.params.id!, req.body, req.user!))));
purchaseOrderRoutes.post('/:id/request-cancel', ...adminOnly, validateBody(poCancelSchema),
    asyncHandler(async (req: AuthenticatedRequest, res) =>
        sendSuccess(res, 200, 'Đã giữ xử lý PO; chờ xác nhận chính sách và nghĩa vụ với nhà cung cấp.',
            await purchaseOrderService.requestCancellation(req.params.id!, req.body, req.user!))));
purchaseOrderRoutes.post('/:id/cancellation-resolution', ...adminOnly, validateBody(poCancelResolutionSchema),
    asyncHandler(async (req: AuthenticatedRequest, res) =>
        sendSuccess(res, 201, 'Đã lưu chứng cứ hủy; cam kết vẫn chờ chính sách.',
            await purchaseOrderService.recordCancellationResolution(req.params.id!, req.body, req.user!))));
purchaseOrderRoutes.post('/:id/receipts', ...canView, validateBody(poReceiptSchema),
    asyncHandler(async (req: AuthenticatedRequest, res) =>
        sendSuccess(res, 201, 'Đã ghi nhận thực nhận theo PO và lô nguyên liệu.',
            await purchaseOrderService.receive(req.params.id!, req.body, req.user!))));
purchaseOrderRoutes.post('/:id/discrepancies', ...canView, validateBody(poDiscrepancySchema),
    asyncHandler(async (req: AuthenticatedRequest, res) =>
        sendSuccess(res, 201, 'Đã lưu bằng chứng giao hàng sai lệch, chưa điều chỉnh tồn.',
            await purchaseOrderService.discrepancy(req.params.id!, req.body, req.user!))));
purchaseOrderRoutes.post('/:id/overdelivery-amendments', ...adminOnly,
    validateBody(poOverdeliveryAmendmentSchema),
    asyncHandler(async (req: AuthenticatedRequest, res) =>
        sendSuccess(res, 201, 'Đã ghi đề nghị sửa đổi giao vượt; chờ duyệt chính sách.',
            await purchaseOrderService.requestOverdeliveryAmendment(req.params.id!, req.body, req.user!))));
purchaseOrderRoutes.post('/:id/returns', ...adminOnly, validateBody(poReturnSchema),
    asyncHandler(async (req: AuthenticatedRequest, res) =>
        sendSuccess(res, 201, 'Đã tạo bút toán trả nhà cung cấp; công nợ chưa tất toán.',
            await purchaseOrderService.returnToSupplier(req.params.id!, req.body, req.user!))));
purchaseOrderRoutes.post('/:id/invoices/reconcile', ...adminOnly, validateBody(poInvoiceSchema),
    asyncHandler(async (req: AuthenticatedRequest, res) =>
        sendSuccess(res, 201, 'Đã đối soát hóa đơn; không tự xác nhận thanh toán.',
            await purchaseOrderService.reconcileInvoice(req.params.id!, req.body, req.user!))));

router.get('/', ...canView, asyncHandler(listPurchaseRequests));
router.post('/sourcing-holds', ...canView, validateBody(purchasingHoldSchema),
    asyncHandler(async (req: AuthenticatedRequest, res) =>
        sendSuccess(res, 201, 'Đã giữ yêu cầu mua hàng chờ tìm nhà cung cấp, chưa lập PO.',
            await purchaseOrderService.createSourcingHold(req.body, req.user!))));
router.post('/demand-aggregations', ...adminOnly, validateBody(purchasingAggregationSchema),
    asyncHandler(async (req: AuthenticatedRequest, res) =>
        sendSuccess(res, 201, 'ADMIN đã duyệt nhóm nguồn; từng PR còn nguyên, chờ chính sách hợp nhất.',
            await purchaseOrderService.aggregateIndependentDemand(req.body, req.user!))));
router.get('/shelf-life-rules', ...adminOnly,
    asyncHandler(async (req: AuthenticatedRequest, res) =>
        sendSuccess(res, 200, 'Ngưỡng hạn dùng dự thảo.',
            await purchaseOrderService.listShelfLifeRules(req.user!))));
router.post('/shelf-life-rules', ...adminOnly, validateBody(poShelfLifeRuleSchema),
    asyncHandler(async (req: AuthenticatedRequest, res) =>
        sendSuccess(res, 201, 'Đã lưu ngưỡng hạn dùng DRAFT; chưa có phê duyệt chính sách.',
            await purchaseOrderService.configureShelfLifeRule(req.body, req.user!))));
router.post('/:id/assign-supplier', ...adminOnly, validateBody(purchasingAssignSchema),
    asyncHandler(async (req: AuthenticatedRequest, res) =>
        sendSuccess(res, 200, 'Đã phân công nhà cung cấp cho yêu cầu chờ.',
            await purchaseOrderService.assignSupplier(req.params.id!, req.body, req.user!))));
router.get('/ingredients/:ingredientId/eligible-suppliers', ...adminOnly,
    asyncHandler(async (req, res) => {
        const ingredient = await prisma.ingredient.findFirst({ where: {
            id: req.params.ingredientId!, isActive: true, deletedAt: null
        } });
        if (!ingredient) throw new Error('Không tìm thấy nguyên liệu.');
        const mappings = await prisma.supplierIngredient.findMany({ where: {
            ingredientId: ingredient.id, supplier: { status: 'ACTIVE', deletedAt: null }
        }, include: { supplier: true } });
        const eligible = mappings.filter(m => m.conversionQuantity.gt(0) &&
            m.conversionTargetUnit === ingredient.baseUnit);
        sendSuccess(res, 200, eligible.length ? 'Nhà cung cấp hợp lệ.' :
            'Chưa có nhà cung cấp hợp lệ; yêu cầu cần xử lý thủ công trước khi tạo PO.',
        { ingredientId: ingredient.id, eligible: eligible.map(m => ({ supplierId: m.supplierId,
            supplierName: m.supplier.name, purchaseUnit: m.purchaseUnit,
            conversionToBase: m.conversionQuantity.toString() })),
            status: eligible.length ? 'READY' : 'NEEDS_SUPPLIER', createPOAllowed: eligible.length > 0 });
    }));
router.post('/:id/select-supplier', ...adminOnly, validateBody(poSelectSupplierSchema),
    asyncHandler(async (req: AuthenticatedRequest, res) =>
        sendSuccess(res, 200, 'Đã chọn nhà cung cấp thay thế với audit.',
            await purchaseOrderService.selectSupplier(req.params.id!, req.body, req.user!))));
router.get('/:id', ...canView, asyncHandler(findPurchaseRequest));
router.post('/', ...adminOnly, validateBody(createPurchaseRequestSchema), asyncHandler(storePurchaseRequest));
router.patch('/:id/approve', ...adminOnly, asyncHandler(approvePurchaseRequest));
router.patch('/:id/reject', ...adminOnly, validateBody(rejectPurchaseRequestSchema), asyncHandler(rejectPurchaseRequest));
router.patch('/:id/mark-sent', ...adminOnly, asyncHandler(markPurchaseRequestSent));
router.patch('/:id/receive', ...canView, validateBody(receivePurchaseRequestSchema), asyncHandler(receivePurchaseRequest));
router.post('/:id/mark-paid', ...adminOnly, validateBody(markPurchaseRequestPaidSchema), asyncHandler(markPurchaseRequestPaid));
router.patch('/:id/complete', ...adminOnly, asyncHandler(completePurchaseRequest));
router.delete('/:id', ...adminOnly, asyncHandler(removePurchaseRequest));

// Email endpoints
router.get('/:id/email-preview', ...adminOnly, asyncHandler(getEmailPreview));
router.post('/:id/send-email', ...adminOnly, asyncHandler(sendEmail));
router.post('/:id/retry-email', ...adminOnly, asyncHandler(retryEmail));

export default router;
