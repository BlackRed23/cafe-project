import type { Response } from 'express';
import type { ApiResponse } from '@cafe-project/types';

export const successResponse = <T>(message: string, data: T): ApiResponse<T> => ({
    success: true,
    message,
    data
});

export const errorResponse = (message: string): ApiResponse<null> => ({
    success: false,
    message,
    data: null
});

export const sendSuccess = <T>(res: Response, statusCode: number, message: string, data: T): void => {
    res.type('application/json; charset=utf-8').status(statusCode).json(successResponse(message, data));
};

export const sendError = (res: Response, statusCode: number, message: string): void => {
    res.type('application/json; charset=utf-8').status(statusCode).json(errorResponse(message));
};
