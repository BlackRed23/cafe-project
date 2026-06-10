import type { Response } from 'express';
import { sendSuccess } from '../../common/response';
import type { AuthenticatedRequest } from '../auth/auth.middleware';
import { getAllSettings, getSettingByKey, upsertSetting } from './system-setting.service';
import type { UpdateSystemSettingInput } from './system-setting.validator';

export const listSystemSettings = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    const settings = await getAllSettings();
    sendSuccess(res, 200, 'Lấy danh sách cấu hình hệ thống thành công.', { settings });
};

export const findSystemSetting = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const setting = await getSettingByKey(req.params.key);
    sendSuccess(res, 200, 'Lấy cấu hình hệ thống thành công.', { setting });
};

export const patchSystemSetting = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const setting = await upsertSetting(req.params.key, (req.body as UpdateSystemSettingInput).value);
    sendSuccess(res, 200, 'Cập nhật cấu hình thành công.', { setting });
};
