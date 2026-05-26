import type { Response } from 'express';
import type { AuthResponse, UserResponse } from '@cafe-project/types';
import { sendError, sendSuccess } from '../../common/response';
import type { AuthenticatedRequest } from './auth.middleware';
import { getCurrentUser, loginUser, registerUser } from './auth.service';
import type { LoginInput, RegisterInput } from './auth.validator';

export const register = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = await registerUser(req.body as RegisterInput);

    sendSuccess<UserResponse>(res, 201, 'Register successfully.', { user });
};

export const login = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const data = await loginUser(req.body as LoginInput);

    sendSuccess<AuthResponse>(res, 200, 'Login successfully.', data);
};

export const profile = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!req.user) {
        sendError(res, 401, 'Authentication is required.');
        return;
    }

    const user = await getCurrentUser(req.user.userId);

    sendSuccess<UserResponse>(res, 200, 'Get profile successfully.', { user });
};
