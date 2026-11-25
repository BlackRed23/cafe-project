import type { NextFunction, Request, Response } from 'express';
import { MulterError } from 'multer';
import { Prisma } from '@cafe-project/database';
import { HttpError } from './http-error';
import { sendError } from './response';

export const notFoundHandler = (req: Request, res: Response): void => {
    sendError(res, 404, `Không tìm thấy route ${req.method} ${req.originalUrl}.`);
};

export const errorHandler = (error: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction): void => {
    void _next;
    if (error instanceof SyntaxError && error.status === 400) {
        sendError(res, 400, 'JSON body không hợp lệ.');
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
        const message = error.code === 'LIMIT_FILE_SIZE' ? 'Kích thước ảnh phải nhỏ hơn hoặc bằng 5MB.' : error.message;

        sendError(res, 400, message);
        return;
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2022' || error.code === 'P2021') {
            sendError(res, 500, 'Cơ sở dữ liệu không đồng bộ. Vui lòng chạy Prisma db push hoặc migration, sau đó khởi động lại API server.');
            return;
        }

        if (error.code === 'P2002') {
            sendError(res, 409, 'Dữ liệu này đã tồn tại.');
            return;
        }
    }

    if (error instanceof Prisma.PrismaClientInitializationError) {
        sendError(res, 500, 'Kết nối cơ sở dữ liệu thất bại. Vui lòng kiểm tra DATABASE_URL và đảm bảo PostgreSQL đang chạy.');
        return;
    }

    if (error instanceof Prisma.PrismaClientValidationError) {
        sendError(res, 400, 'Yêu cầu cơ sở dữ liệu không hợp lệ.');
        return;
    }

    // Never echo a raw exception/stack to an HTTP client, including development.
    // Unknown errors may contain SQL, provider responses, keys or private input.
    const kind = error instanceof Error
        ? error.name.replace(/[^A-Za-z]/g, '').slice(0, 40) : 'UnknownError';
    console.error(JSON.stringify({
        event: 'http.request.error',
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId,
        kind: kind || 'UnknownError',
        status: 500
    }));
    sendError(res, 500, 'Lỗi máy chủ nội bộ.');
};
