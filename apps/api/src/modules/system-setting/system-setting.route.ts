import { Router, type NextFunction, type Response } from 'express';
import { asyncHandler } from '../../common/async-handler';
import { validateBody } from '../../common/validate';
import { sendError } from '../../common/response';
import { authenticate, type AuthenticatedRequest } from '../auth/auth.middleware';
import { findSystemSetting, listSystemSettings, patchSystemSetting } from './system-setting.controller';
import { updateSystemSettingSchema } from './system-setting.validator';

const router = Router();

const requireSystemSettingRole = (roles: Array<'ADMIN' | 'STAFF'>) => {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
        if (!req.user) {
            sendError(res, 401, 'Authentication is required.');
            return;
        }

        if (!roles.includes(req.user.role as 'ADMIN' | 'STAFF')) {
            sendError(res, 403, 'Bạn không có quyền thực hiện thao tác này.');
            return;
        }

        next();
    };
};

const canRead = [authenticate, requireSystemSettingRole(['ADMIN', 'STAFF'])];
const adminOnly = [authenticate, requireSystemSettingRole(['ADMIN'])];

router.get('/', ...canRead, asyncHandler(listSystemSettings));
router.get('/:key', ...canRead, asyncHandler(findSystemSetting));
router.patch('/:key', ...adminOnly, validateBody(updateSystemSettingSchema), asyncHandler(patchSystemSetting));

export default router;
