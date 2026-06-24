import { Router } from 'express';
import { asyncHandler } from '../../common/async-handler';
import { authenticate, requireRole } from '../auth/auth.middleware';
import { uploadProductImage } from './upload.controller';
import { upload } from '../../common/upload';

import { RequestHandler } from 'express';

const router = Router();

router.post(
    '/product-image',
    authenticate,
    requireRole(['ADMIN']),
    upload.single('image') as unknown as RequestHandler,
    asyncHandler(uploadProductImage)
);

export default router;
