import type { NextFunction, Request, Response } from 'express';
import { MulterError } from 'multer';
import { Prisma } from '@cafe-project/database';
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
        if (error.code) {
            res.type('application/json; charset=utf-8').status(error.statusCode).json({
                success: false,
                message: error.message,
                code: error.code,
                data: null
            });
        } else {
            sendError(res, error.statusCode, error.message);
        }
        return;
    }

    if (error instanceof MulterError) {
        const message = error.code === 'LIMIT_FILE_SIZE' ? 'Image size must be less than or equal to 5MB.' : error.message;

        sendError(res, 400, message);
        return;
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2022' || error.code === 'P2021') {
            sendError(res, 500, 'Database schema is not synced. Please run Prisma db push or migration, then restart the API server.');
            return;
        }

        if (error.code === 'P2002') {
            sendError(res, 409, 'A record with this unique value already exists.');
            return;
        }
    }

    if (error instanceof Prisma.PrismaClientInitializationError) {
        sendError(res, 500, 'Database connection failed. Please check DATABASE_URL and make sure PostgreSQL is running.');
        return;
    }

    if (error instanceof Prisma.PrismaClientValidationError) {
        sendError(res, 400, 'Invalid database request.');
        return;
    }

    console.error('[api]', error);
    sendError(res, 500, 'Internal server error.');
};
