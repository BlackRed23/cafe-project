import { z } from 'zod';

export const systemSettingKeySchema = z.string()
    .trim()
    .min(1, 'Dữ liệu cấu hình không hợp lệ.')
    .regex(/^[A-Za-z0-9_.-]+$/, 'Dữ liệu cấu hình không hợp lệ.');

export const updateSystemSettingSchema = z.object({
    value: z.string()
        .max(5000, 'Dữ liệu cấu hình không hợp lệ.')
});

export type UpdateSystemSettingInput = z.infer<typeof updateSystemSettingSchema>;
