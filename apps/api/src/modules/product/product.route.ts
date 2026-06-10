import { Router } from 'express';
import { asyncHandler } from '../../common/async-handler';
import { validateBody } from '../../common/validate';
import { authenticate, requireRole } from '../auth/auth.middleware';
import { findProduct, listProducts, patchProduct, removeProduct, storeProduct } from './product.controller';
import { createProductSchema, updateProductSchema } from './product.validator';

const router = Router();
const adminOnly = [authenticate, requireRole(['ADMIN'])];

router.get('/', asyncHandler(listProducts));
router.get('/:id', asyncHandler(findProduct));
router.post('/', ...adminOnly, validateBody(createProductSchema), asyncHandler(storeProduct));
router.put('/:id', ...adminOnly, validateBody(updateProductSchema), asyncHandler(patchProduct));
router.delete('/:id', ...adminOnly, asyncHandler(removeProduct));

export default router;