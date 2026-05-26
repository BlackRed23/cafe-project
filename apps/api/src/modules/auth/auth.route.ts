import { Router } from 'express';
import { asyncHandler } from '../../common/async-handler';
import { validateBody } from '../../common/validate';
import { login, profile, register } from './auth.controller';
import { authenticate } from './auth.middleware';
import { loginSchema, registerSchema } from './auth.validator';

const router = Router();

router.post('/register', validateBody(registerSchema), asyncHandler(register));
router.post('/login', validateBody(loginSchema), asyncHandler(login));
router.get('/profile', authenticate, asyncHandler(profile));

export default router;
