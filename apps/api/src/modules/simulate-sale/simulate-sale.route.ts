import { Router } from 'express';
import { asyncHandler } from '../../common/async-handler';
import { validateBody } from '../../common/validate';
import { authenticate, requireRole } from '../auth/auth.middleware';
import { runSimulateSale } from './simulate-sale.controller';
import { simulateSaleSchema } from './simulate-sale.validator';

const router = Router();
router.post('/', authenticate, requireRole(['ADMIN']), validateBody(simulateSaleSchema), asyncHandler(runSimulateSale));

export default router;