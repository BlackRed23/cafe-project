import { Router } from 'express';
import { asyncHandler } from '../../common/async-handler';
import { authenticate, requireRole } from '../auth/auth.middleware';
import {
    getSummary,
    getRevenue,
    getProfit,
    getProductMargins,
    getIngredientUsage,
    getLowStock,
    getRecentActivity,
    getStaffSummary
} from './dashboard.controller';

const router = Router();
const adminOnly = [authenticate, requireRole(['ADMIN'])];
const canView = [authenticate, requireRole(['ADMIN', 'STAFF'])];

router.get('/staff-summary', ...canView, asyncHandler(getStaffSummary));
router.get('/summary', ...adminOnly, asyncHandler(getSummary));
router.get('/revenue', ...adminOnly, asyncHandler(getRevenue));
router.get('/profit', ...adminOnly, asyncHandler(getProfit));
router.get('/product-margins', ...adminOnly, asyncHandler(getProductMargins));
router.get('/ingredient-usage', ...adminOnly, asyncHandler(getIngredientUsage));
router.get('/low-stock', ...adminOnly, asyncHandler(getLowStock));
router.get('/recent-activity', ...adminOnly, asyncHandler(getRecentActivity));

export default router;
