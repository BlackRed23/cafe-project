import type { SystemSetting } from '@cafe-project/database';
import { HttpError } from '../../common/http-error';
import { systemSettingRepository, type SystemSettingRecord } from './system-setting.repository';
import { systemSettingKeySchema } from './system-setting.validator';

export type SystemSettingDto = Pick<SystemSetting, 'key' | 'value' | 'updatedAt'>;

const toDto = (setting: SystemSettingRecord): SystemSettingDto => ({
    key: setting.key,
    value: setting.value,
    updatedAt: setting.updatedAt
});

const normalizeKey = (key: string): string => {
    const parsed = systemSettingKeySchema.safeParse(key);
    if (!parsed.success) throw new HttpError(400, 'Dữ liệu cấu hình không hợp lệ.');
    return parsed.data;
};

export const getAllSettings = async (): Promise<SystemSettingDto[]> => {
    const settings = await systemSettingRepository.findMany();
    return settings.map(toDto);
};

export const getSettingByKey = async (key: string): Promise<SystemSettingDto> => {
    const normalizedKey = normalizeKey(key);
    const setting = await systemSettingRepository.findByKey(normalizedKey);
    if (!setting) throw new HttpError(404, 'Không tìm thấy cấu hình hệ thống.');
    return toDto(setting);
};

export const upsertSetting = async (key: string, value: string): Promise<SystemSettingDto> => {
    const normalizedKey = normalizeKey(key);
    return toDto(await systemSettingRepository.upsert(normalizedKey, value));
};

export const getOptionalSettingValue = async (key: string): Promise<string | null> => {
    const normalizedKey = normalizeKey(key);
    const setting = await systemSettingRepository.findByKey(normalizedKey);
    return setting?.value ?? null;
};
