import type { SystemSetting } from '@cafe-project/database';
import { prisma } from '@cafe-project/database';

export const internalAgentSettingPrefixes = ['agent.workflow.checkpoint.', 'agent.purchasing.continuation.'];

export type SystemSettingRecord = SystemSetting;

export const systemSettingRepository = {
    async findMany(): Promise<SystemSettingRecord[]> {
        return prisma.systemSetting.findMany({
            where: { NOT: internalAgentSettingPrefixes.map(prefix => ({ key: { startsWith: prefix } })) },
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
