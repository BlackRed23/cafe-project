import { HttpError } from '../../common/http-error';
import { systemSettingRepository, type SystemSettingRecord } from './system-setting.repository';
import { systemSettingKeySchema } from './system-setting.validator';

const DEFAULT_SETTINGS: Record<string, string> = {
    'ai.enabled': 'true',
    'ai.slogan': '',
    'ai.promptPrefix': '',
    'ai.scanCron': '*/5 * * * *',
    'inventory.defaultMinThreshold': '10',
    'inventory.reorderPlanningPeriod': 'WEEKLY',
    'inventory.reorderPlanningCustomDays': '14',
    'store.name': 'Cafe System',
    'store.email': '',
    'store.phone': ''
};

export type SystemSettingDto = {
    key: string;
    value: string;
    updatedAt: Date | null;
};

const toDto = (setting: SystemSettingRecord): SystemSettingDto => ({
    key: setting.key,
    value: setting.value,
    updatedAt: setting.updatedAt
});

const toDefaultDto = (key: string): SystemSettingDto => ({
    key,
    value: DEFAULT_SETTINGS[key] ?? '',
    updatedAt: null
});

const normalizeKey = (key: string): string => {
    const parsed = systemSettingKeySchema.safeParse(key);
    if (!parsed.success) {
        throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Khóa cấu hình không hợp lệ.');
    }

    return parsed.data;
};

export const getSupportedSystemSettingKeys = (): string[] => Object.keys(DEFAULT_SETTINGS);

export const getAllSettings = async (): Promise<SystemSettingDto[]> => {
    const settings = await systemSettingRepository.findMany();
    const byKey = new Map(settings.map((setting) => [setting.key, toDto(setting)]));

    for (const key of getSupportedSystemSettingKeys()) {
        if (!byKey.has(key)) {
            byKey.set(key, toDefaultDto(key));
        }
    }

    return Array.from(byKey.values()).sort((a, b) => a.key.localeCompare(b.key));
};

export const getSettingByKey = async (key: string): Promise<SystemSettingDto> => {
    const normalizedKey = normalizeKey(key);
    const setting = await systemSettingRepository.findByKey(normalizedKey);

    if (setting) {
        return toDto(setting);
    }

    if (normalizedKey in DEFAULT_SETTINGS) {
        return toDefaultDto(normalizedKey);
    }

    throw new HttpError(404, 'Không tìm thấy cấu hình hệ thống.');
};

export const upsertSetting = async (key: string, value: string): Promise<SystemSettingDto> => {
    const normalizedKey = normalizeKey(key);
    const setting = await systemSettingRepository.upsert(normalizedKey, value);

    return toDto(setting);
};

export const getOptionalSettingValue = async (key: string): Promise<string | null> => {
    const normalizedKey = normalizeKey(key);
    const setting = await systemSettingRepository.findByKey(normalizedKey);

    return setting?.value ?? DEFAULT_SETTINGS[normalizedKey] ?? null;
};
