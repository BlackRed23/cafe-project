import { Router } from 'express';
import { asyncHandler } from '../../common/async-handler';
import { validateBody } from '../../common/validate';
import { login, me, register, updateProfile, changePassword, google, forgot, reset } from './auth.controller';
import { authMiddleware } from './auth.middleware';
import { throttleAuth } from './auth.throttle';
import { forgotPasswordSchema, googleAuthSchema, loginSchema, registerSchema, resetPasswordSchema } from './auth.validation';

const router = Router();

router.post('/register', throttleAuth(10, 15 * 60_000), validateBody(registerSchema), asyncHandler(register));
router.post('/login', throttleAuth(20, 15 * 60_000), validateBody(loginSchema), asyncHandler(login));
router.post('/google', throttleAuth(20, 15 * 60_000), validateBody(googleAuthSchema), asyncHandler(google));
router.post('/forgot-password', throttleAuth(5, 15 * 60_000), validateBody(forgotPasswordSchema), asyncHandler(forgot));
router.post('/reset-password', throttleAuth(10, 15 * 60_000), validateBody(resetPasswordSchema), asyncHandler(reset));
router.get('/me', authMiddleware, asyncHandler(me));
router.patch('/profile', authMiddleware, asyncHandler(updateProfile));
router.patch('/change-password', authMiddleware, asyncHandler(changePassword));

export default router;
