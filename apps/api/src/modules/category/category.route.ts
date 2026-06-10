import { Router } from 'express';
import { asyncHandler } from '../../common/async-handler';
import { validateBody } from '../../common/validate';
import { authenticate, requireRole } from '../auth/auth.middleware';
import { findCategory, listCategories, patchCategory, removeCategory, storeCategory } from './category.controller';
import { createCategorySchema, updateCategorySchema } from './category.validator';

const router = Router();
const adminOnly = [authenticate, requireRole(['ADMIN'])];

router.get('/', asyncHandler(listCategories));
router.get('/:id', asyncHandler(findCategory));
router.post('/', ...adminOnly, validateBody(createCategorySchema), asyncHandler(storeCategory));
router.put('/:id', ...adminOnly, validateBody(updateCategorySchema), asyncHandler(patchCategory));
router.delete('/:id', ...adminOnly, asyncHandler(removeCategory));

export default router;