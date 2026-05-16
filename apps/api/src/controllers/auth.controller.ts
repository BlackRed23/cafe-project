import { Request, Response } from 'express';
import { registerUserService } from '../services/auth.service';

export const register = async (req: Request, res: Response) => {
    try {
        // Gọi tầng Service để xử lý logic
        const user = await registerUserService(req.body);

        // Trả về JSON cho Client
        res.status(201).json({
            message: 'Đăng ký tài khoản thành công!',
            data: user,
        });
    } catch (error: any) {
        // Nếu tầng Service ném ra lỗi (VD: Trùng email), Controller sẽ bắt ở đây
        res.status(400).json({
            error: error.message || 'Đã xảy ra lỗi trong quá trình đăng ký.',
        });
    }
};