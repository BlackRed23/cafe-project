import type { Request, Response } from 'express';
import { sendSuccess, sendError } from '../../common/response';
import { userService } from './user.service';
import type { CreateUserInput, UpdateUserInput } from './user.validator';

export const listUsers = async (_req: Request, res: Response): Promise<void> => {
    try {
        const users = await userService.getUsers();
        sendSuccess(res, 200, 'Get users successfully.', { users });
    } catch (error: any) {
        sendError(res, 500, error.message);
    }
};

export const findUser = async (req: Request, res: Response): Promise<void> => {
    try {
        const user = await userService.getUserById(req.params.id);
        sendSuccess(res, 200, 'Get user successfully.', { user });
    } catch (error: any) {
        sendError(res, 404, error.message);
    }
};

export const storeUser = async (req: Request, res: Response): Promise<void> => {
    try {
        const user = await userService.createUser(req.body as CreateUserInput);
        sendSuccess(res, 201, 'Create user successfully.', { user });
    } catch (error: any) {
        sendError(res, 400, error.message);
    }
};

export const patchUser = async (req: Request, res: Response): Promise<void> => {
    try {
        const user = await userService.updateUser(req.params.id, req.body as UpdateUserInput);
        sendSuccess(res, 200, 'Update user successfully.', { user });
    } catch (error: any) {
        sendError(res, 400, error.message);
    }
};

export const removeUser = async (req: Request, res: Response): Promise<void> => {
    try {
        const user = await userService.deleteUser(req.params.id);
        sendSuccess(res, 200, 'Delete user successfully.', { user });
    } catch (error: any) {
        sendError(res, 400, error.message);
    }
};
