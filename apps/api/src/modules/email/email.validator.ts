import { z } from 'zod';

export const sendEmailSchema = z.object({
    to: z.string().email('Invalid email address.').optional(),
    subject: z.string().trim().min(1, 'Subject is required.').max(255, 'Subject is too long.'),
    body: z.string().trim().min(1, 'Email body is required.')
});

export type SendEmailInput = z.infer<typeof sendEmailSchema>;
