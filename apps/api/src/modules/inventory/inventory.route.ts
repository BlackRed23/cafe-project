import { Router } from 'express';
import { asyncHandler } from '../../common/async-handler';
import { validateBody } from '../../common/validate';
import { authenticate, requireRole } from '../auth/auth.middleware';
import { adjustStock, findInventory, importStock, listInventories, listInventoryTransactions, suggestThreshold, updateThreshold } from './inventory.controller';
import { adjustInventorySchema, importInventorySchema, updateThresholdSchema } from './inventory.validator';

const inventoryRoutes = Router();
const inventoryTransactionRoutes = Router();
const canViewInventory = [authenticate, requireRole(['ADMIN', 'STAFF'])];
const adminOnly = [authenticate, requireRole(['ADMIN'])];

inventoryRoutes.get('/', ...canViewInventory, asyncHandler(listInventories));
inventoryRoutes.get('/:id/suggest-threshold', ...canViewInventory, asyncHandler(suggestThreshold));
inventoryRoutes.get('/:id', ...canViewInventory, asyncHandler(findInventory));
inventoryRoutes.post('/import', ...adminOnly, validateBody(importInventorySchema), asyncHandler(importStock));
inventoryRoutes.post('/adjust', ...adminOnly, validateBody(adjustInventorySchema), asyncHandler(adjustStock));
inventoryRoutes.post('/threshold', ...adminOnly, validateBody(updateThresholdSchema), asyncHandler(updateThreshold));

inventoryTransactionRoutes.get('/', ...canViewInventory, asyncHandler(listInventoryTransactions));

export { inventoryRoutes, inventoryTransactionRoutes };
export default inventoryRoutes;
