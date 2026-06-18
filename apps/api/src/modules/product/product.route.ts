import { Router } from 'express';
import { asyncHandler } from '../../common/async-handler';
import { validateBody } from '../../common/validate';
import { authenticate, requireRole } from '../auth/auth.middleware';
import { findProduct, listProducts, patchProduct, removeProduct, storeProduct, scheduleDeleteProduct, restoreProduct, purgeProduct } from './product.controller';
import { createProductSchema, updateProductSchema } from './product.validator';

const router = Router();
const adminOnly = [authenticate, requireRole(['ADMIN'])];

router.get('/', asyncHandler(listProducts));
router.get('/:id', asyncHandler(findProduct));
router.post('/', ...adminOnly, validateBody(createProductSchema), asyncHandler(storeProduct));
router.put('/:id', ...adminOnly, validateBody(updateProductSchema), asyncHandler(patchProduct));
router.delete('/:id', ...adminOnly, asyncHandler(removeProduct));

// New soft-delete and purge routes
router.patch('/:id/schedule-delete', ...adminOnly, asyncHandler(scheduleDeleteProduct));
router.patch('/:id/restore', ...adminOnly, asyncHandler(restoreProduct));
router.delete('/:id/purge', ...adminOnly, asyncHandler(purgeProduct));

export default router;