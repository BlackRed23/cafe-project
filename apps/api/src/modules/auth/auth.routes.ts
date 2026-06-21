import { Router } from 'express';
import { asyncHandler } from '../../common/async-handler';
import { validateBody } from '../../common/validate';
import { login, me, register, updateProfile, changePassword } from './auth.controller';
import { authMiddleware } from './auth.middleware';
import { loginSchema, registerSchema } from './auth.validation';

const router = Router();

router.post('/register', validateBody(registerSchema), asyncHandler(register));
router.post('/login', validateBody(loginSchema), asyncHandler(login));
router.get('/me', authMiddleware, asyncHandler(me));
router.patch('/profile', authMiddleware, asyncHandler(updateProfile));
router.patch('/change-password', authMiddleware, asyncHandler(changePassword));

export default router;
