import { Router } from 'express';
import { asyncHandler } from '../../common/async-handler';
import { upload } from '../../common/upload';
import { validateBody } from '../../common/validate';
import { authenticate, requireRole } from '../auth/auth.middleware';
import {
    findProduct,
    listProducts,
    patchProduct,
    removeProduct,
    storeProduct
} from './product.controller';
import { createProductSchema, updateProductSchema } from './product.validator';

const router = Router();
const protectProductWrite = [authenticate, requireRole(['ADMIN', 'MANAGER'])];

router.get('/', asyncHandler(listProducts));
router.get('/:id', asyncHandler(findProduct));
router.post(
    '/',
    ...protectProductWrite,
    upload.single('image'),
    validateBody(createProductSchema),
    asyncHandler(storeProduct)
);
router.patch(
    '/:id',
    ...protectProductWrite,
    upload.single('image'),
    validateBody(updateProductSchema),
    asyncHandler(patchProduct)
);
router.delete('/:id', ...protectProductWrite, asyncHandler(removeProduct));

export default router;
