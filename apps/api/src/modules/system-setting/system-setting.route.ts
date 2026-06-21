import { Router } from 'express';
import { asyncHandler } from '../../common/async-handler';
import { validateBody } from '../../common/validate';
import { authenticate, requireRole } from '../auth/auth.middleware';
import { findSystemSetting, listSystemSettings, patchSystemSetting } from './system-setting.controller';
import { updateSystemSettingSchema } from './system-setting.validator';

const router = Router();
const canRead = [authenticate, requireRole(['ADMIN', 'STAFF'])];
const adminOnly = [authenticate, requireRole(['ADMIN'])];

router.get('/', ...canRead, asyncHandler(listSystemSettings));
router.get('/:key', ...canRead, asyncHandler(findSystemSetting));
router.patch('/:key', ...adminOnly, validateBody(updateSystemSettingSchema), asyncHandler(patchSystemSetting));

export default router;
