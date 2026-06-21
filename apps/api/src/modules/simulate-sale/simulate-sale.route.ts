import { Router } from 'express';
import { asyncHandler } from '../../common/async-handler';
import { validateBody } from '../../common/validate';
import { authenticate, requireRole } from '../auth/auth.middleware';
import { getPendingSimulateSaleRestore, restoreSimulateSale, runSimulateSale } from './simulate-sale.controller';
import { simulateSaleSchema } from './simulate-sale.validator';

const router = Router();
router.get('/pending-restore', authenticate, requireRole(['ADMIN']), asyncHandler(getPendingSimulateSaleRestore));
router.post('/', authenticate, requireRole(['ADMIN']), validateBody(simulateSaleSchema), asyncHandler(runSimulateSale));
router.post('/:transactionId/restore', authenticate, requireRole(['ADMIN']), asyncHandler(restoreSimulateSale));

export default router;
