import { Router } from 'express';
import { asyncHandler } from '../../common/async-handler';
import { validateBody } from '../../common/validate';
import { authenticate, requireRole } from '../auth/auth.middleware';
import {
    findCategory,
    listCategories,
    patchCategory,
    removeCategory,
    storeCategory
} from './category.controller';
import { createCategorySchema, updateCategorySchema } from './category.validator';

const router = Router();
const protectCategoryWrite = [authenticate, requireRole(['ADMIN', 'MANAGER'])];

router.get('/', asyncHandler(listCategories));
router.get('/:id', asyncHandler(findCategory));
router.post('/', ...protectCategoryWrite, validateBody(createCategorySchema), asyncHandler(storeCategory));
router.patch('/:id', ...protectCategoryWrite, validateBody(updateCategorySchema), asyncHandler(patchCategory));
router.delete('/:id', ...protectCategoryWrite, asyncHandler(removeCategory));

export default router;
