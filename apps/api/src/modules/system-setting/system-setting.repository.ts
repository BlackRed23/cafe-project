import type { Prisma, SystemSetting } from '@cafe-project/database';
import { prisma } from '../../common/prisma';

export type SystemSettingRecord = SystemSetting;

export const systemSettingRepository = {
    async findMany(): Promise<SystemSettingRecord[]> {
        return prisma.systemSetting.findMany({
            orderBy: { key: 'asc' }
        });
    },

    async findByKey(key: string): Promise<SystemSettingRecord | null> {
        return prisma.systemSetting.findUnique({ where: { key } });
    },

    async upsert(key: string, value: string): Promise<SystemSettingRecord> {
        return prisma.systemSetting.upsert({
            where: { key },
            update: { value },
            create: { key, value }
        });
    }
};
