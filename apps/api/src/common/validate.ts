import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodType } from 'zod';
import { sendError } from './response';

export const validateBody = <T>(schema: ZodType<T>): RequestHandler => {
    return (req: Request, res: Response, next: NextFunction): void => {
        const parsed = schema.safeParse(req.body);

        if (!parsed.success) {
            sendError(res, 400, parsed.error.issues[0]?.message ?? 'Validation error.');
            return;
        }

        req.body = parsed.data;
        next();
    };
};
