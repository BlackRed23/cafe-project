import { z } from 'zod';

export const systemSettingKeySchema = z.string({ error: 'Khóa cấu hình phải là chuỗi.' })
    .trim()
    .min(1, 'Khóa cấu hình là bắt buộc.')
    .regex(/^[A-Za-z0-9_.-]+$/, 'Khóa cấu hình chỉ được chứa chữ cái, số, dấu chấm, gạch ngang và gạch dưới.');

export const updateSystemSettingSchema = z.object({
    value: z.string({ error: 'Giá trị cấu hình phải là chuỗi.' })
        .max(5000, 'Giá trị cấu hình không được vượt quá 5000 ký tự.')
});

export type UpdateSystemSettingInput = z.infer<typeof updateSystemSettingSchema>;
