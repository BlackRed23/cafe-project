import type { Response } from 'express';
import { sendError } from '../../common/response';
import type { AuthenticatedRequest } from './auth.middleware';
import { getCurrentUser, loginUser, registerUser, updateUserProfile, changeUserPassword, loginWithGoogle, forgotPassword, resetPassword, type AuthResponse, type AuthUser } from './auth.service';
import type { ForgotPasswordInput, GoogleAuthInput, LoginInput, RegisterInput, ResetPasswordInput } from './auth.validation';

export const register = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = await registerUser(req.body as RegisterInput);

    res.status(201).json({ user });
};

export const login = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const data = await loginUser(req.body as LoginInput);

    res.status(200).json(data satisfies AuthResponse);
};

export const google = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const data = await loginWithGoogle(req.body as GoogleAuthInput);

    res.status(200).json(data satisfies AuthResponse);
};

export const forgot = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const data = await forgotPassword(req.body as ForgotPasswordInput);

    res.status(200).json(data);
};

export const reset = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    await resetPassword(req.body as ResetPasswordInput);

    res.status(200).json({ message: 'Password has been reset successfully.' });
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

export const updateProfile = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!req.user) {
        sendError(res, 401, 'Authentication is required.');
        return;
    }

    const { name, phone } = req.body as { name?: string; phone?: string };
    const user = await updateUserProfile(req.user.id, { name, phone });

    res.status(200).json({ user });
};

export const changePassword = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!req.user) {
        sendError(res, 401, 'Authentication is required.');
        return;
    }

    const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };

    if (!currentPassword || !newPassword) {
        sendError(res, 400, 'currentPassword and newPassword are required.');
        return;
    }

    await changeUserPassword(req.user.id, { currentPassword, newPassword });
    res.status(200).json({ message: 'Đổi mật khẩu thành công.' });
};
