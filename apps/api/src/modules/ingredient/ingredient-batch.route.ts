import { Router } from 'express';
import { prisma } from '@cafe-project/database';
import { asyncHandler } from '../../common/async-handler';
import { HttpError } from '../../common/http-error';
import { sendSuccess } from '../../common/response';
import { authMiddleware, roleMiddleware } from '../auth/auth.middleware';
import { UserRole } from '@cafe-project/database';

/** Read-only IngredientBatch APIs. Quality holds/recalls require a schema migration and are NOT inferred here. */
export const ingredientBatchRoutes = Router();
ingredientBatchRoutes.use(authMiddleware, roleMiddleware(UserRole.ADMIN, UserRole.STAFF));

const view = (batch: any, now: Date, warningDays: number) => {
    const remaining = Number(batch.quantityRemaining);
    const expiry = batch.expirationDate ? new Date(batch.expirationDate) : null;
    const expired = !!expiry && expiry.getTime() <= now.getTime();
    const expiringSoon = !!expiry && !expired && expiry.getTime() <= now.getTime() + warningDays * 86400000;
    return {
        id: batch.id, ingredientId: batch.ingredientId,
        ingredient: batch.ingredient ? { id: batch.ingredient.id, name: batch.ingredient.name, baseUnit: batch.ingredient.baseUnit } : undefined,
        batchCode: batch.batchCode, quantityInitial: Number(batch.quantityInitial),
        quantityRemaining: remaining, unitCost: Number(batch.unitCost),
        expirationDate: batch.expirationDate, receivedAt: batch.receivedAt,
        supplierId: batch.supplierId, receivedQty: batch.receivedQty == null ? null : Number(batch.receivedQty),
        receivedUnit: batch.receivedUnit, note: batch.note,
        derivedStatus: remaining <= 0 ? 'DEPLETED' : expired ? 'EXPIRED' : expiringSoon ? 'EXPIRING_SOON' : expiry ? 'UNEXPIRED' : 'UNKNOWN_EXPIRY',
        /** This is expiry-only availability; quality quarantine is not represented by the current model. */
        expirationEligible: remaining > 0 && !expired,
    };
};

const query = (raw: unknown) => (typeof raw === 'string' ? raw.trim() : '');
const validDays = (raw: unknown) => {
    const val = raw == null ? 7 : Number(raw);
    if (!Number.isInteger(val) || val < 0 || val > 365) throw new HttpError(400, 'days phải là số nguyên từ 0 đến 365.');
    return val;
};

ingredientBatchRoutes.get('/', asyncHandler(async (req, res) => {
    const ingredientId = query(req.query.ingredientId);
    const status = query(req.query.status).toUpperCase();
    const allowed = ['', 'DEPLETED', 'EXPIRED', 'EXPIRING_SOON', 'UNEXPIRED', 'UNKNOWN_EXPIRY'];
    if (!allowed.includes(status)) throw new HttpError(400, 'status không hợp lệ.');
    const days = validDays(req.query.days);
    const now = new Date();
    const batches = await prisma.ingredientBatch.findMany({
        where: { ...(ingredientId ? { ingredientId } : {}), ingredient: { deletedAt: null } },
        include: { ingredient: { select: { id: true, name: true, baseUnit: true } } },
        orderBy: [{ expirationDate: 'asc' }, { receivedAt: 'asc' }, { id: 'asc' }],
    });
    const data = batches.map(b => view(b, now, days)).filter(b => !status || b.derivedStatus === status);
    sendSuccess(res, 200, 'Danh sách lô nguyên liệu.', data);
}));

ingredientBatchRoutes.get('/expiring', asyncHandler(async (req, res) => {
    const days = validDays(req.query.days);
    const now = new Date();
    const end = new Date(now.getTime() + days * 86400000);
    const batches = await prisma.ingredientBatch.findMany({
        where: { quantityRemaining: { gt: 0 }, expirationDate: { gt: now, lte: end }, ingredient: { deletedAt: null } },
        include: { ingredient: { select: { id: true, name: true, baseUnit: true } } },
        orderBy: [{ expirationDate: 'asc' }, { receivedAt: 'asc' }, { id: 'asc' }],
    });
    sendSuccess(res, 200, 'Các lô sắp hết hạn.', batches.map(b => view(b, now, days)));
}));

ingredientBatchRoutes.get('/:id', asyncHandler(async (req, res) => {
    const batch = await prisma.ingredientBatch.findFirst({
        where: { id: req.params.id!, ingredient: { deletedAt: null } },
        include: { ingredient: { select: { id: true, name: true, baseUnit: true } } },
    });
    if (!batch) throw new HttpError(404, 'Không tìm thấy lô nguyên liệu.');
    sendSuccess(res, 200, 'Chi tiết lô nguyên liệu.', view(batch, new Date(), 7));
}));

ingredientBatchRoutes.get('/:id/transactions', asyncHandler(async (req, res) => {
    const exists = await prisma.ingredientBatch.findFirst({ where: { id: req.params.id!, ingredient: { deletedAt: null } }, select: { id: true } });
    if (!exists) throw new HttpError(404, 'Không tìm thấy lô nguyên liệu.');
    const transactions = await prisma.inventoryTransaction.findMany({
        where: { batchId: exists.id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    sendSuccess(res, 200, 'Giao dịch của lô nguyên liệu.', transactions);
}));
