import { Router } from 'express';
import { asyncHandler } from '../../common/async-handler';
import { validateBody } from '../../common/validate';
import { login, me, register, updateProfile, changePassword, google, forgot, reset } from './auth.controller';
import { authMiddleware } from './auth.middleware';
import { forgotPasswordSchema, googleAuthSchema, loginSchema, registerSchema, resetPasswordSchema } from './auth.validation';

const router = Router();

router.post('/register', validateBody(registerSchema), asyncHandler(register));
router.post('/login', validateBody(loginSchema), asyncHandler(login));
router.post('/google', validateBody(googleAuthSchema), asyncHandler(google));
router.post('/forgot-password', validateBody(forgotPasswordSchema), asyncHandler(forgot));
router.post('/reset-password', validateBody(resetPasswordSchema), asyncHandler(reset));
router.get('/me', authMiddleware, asyncHandler(me));
router.patch('/profile', authMiddleware, asyncHandler(updateProfile));
router.patch('/change-password', authMiddleware, asyncHandler(changePassword));

export default router;
