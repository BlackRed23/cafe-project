import { Router } from 'express';
import { asyncHandler } from '../../common/async-handler';
import { validateBody } from '../../common/validate';
import { authenticate, requireRole } from '../auth/auth.middleware';
import { 
    listAgentLogs, 
    scanInventory, 
    recommendReorder, 
    getRecommendations, 
    createPurchaseRequestFromRecommendation 
} from './agent.controller';
import { scanInventorySchema, recommendReorderSchema } from './agent.validator';

const router = Router();
const adminOnly = [authenticate, requireRole(['ADMIN'])];

router.post('/scan-inventory', ...adminOnly, validateBody(scanInventorySchema), asyncHandler(scanInventory));
router.get('/logs', ...adminOnly, asyncHandler(listAgentLogs));

// New AI reorder recommendation endpoints
router.post('/recommend-reorder', ...adminOnly, validateBody(recommendReorderSchema), asyncHandler(recommendReorder));
router.get('/recommendations', ...adminOnly, asyncHandler(getRecommendations));
router.post('/recommendations/:id/create-purchase-request', ...adminOnly, asyncHandler(createPurchaseRequestFromRecommendation));

export default router;