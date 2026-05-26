import type { NextFunction, Request, Response } from 'express';
import { MulterError } from 'multer';
import { HttpError } from './http-error';
import { sendError } from './response';

export const notFoundHandler = (req: Request, res: Response): void => {
    sendError(res, 404, `Route ${req.method} ${req.originalUrl} not found.`);
};

export const errorHandler = (error: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction): void => {
    if (error instanceof SyntaxError && error.status === 400) {
        sendError(res, 400, 'Invalid JSON body.');
        return;
    }

    if (error instanceof HttpError) {
        sendError(res, error.statusCode, error.message);
        return;
    }

    if (error instanceof MulterError) {
        const message = error.code === 'LIMIT_FILE_SIZE' ? 'Image size must be less than or equal to 5MB.' : error.message;

        sendError(res, 400, message);
        return;
    }

    console.error('[api]', error);
    sendError(res, 500, 'Internal server error.');
};
