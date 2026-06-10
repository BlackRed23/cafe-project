import type { Response } from 'express';
import { sendError } from '../../common/response';
import type { AuthenticatedRequest } from './auth.middleware';
import { getCurrentUser, loginUser, registerUser, type AuthResponse, type AuthUser } from './auth.service';
import type { LoginInput, RegisterInput } from './auth.validation';

export const register = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = await registerUser(req.body as RegisterInput);

    res.status(201).json({ user });
};

export const login = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const data = await loginUser(req.body as LoginInput);

    res.status(200).json(data satisfies AuthResponse);
};

export const me = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!req.user) {
        sendError(res, 401, 'Authentication is required.');
        return;
    }

    const user = await getCurrentUser(req.user.id);

    res.status(200).json(user satisfies AuthUser);
};

export const profile = me;
