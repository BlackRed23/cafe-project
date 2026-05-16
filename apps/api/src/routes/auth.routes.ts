import { Router } from 'express';
import { register } from '../controllers/auth.controller';

const router = Router();

// Định nghĩa API: POST /api/auth/register
router.post('/register', register);

export default router;