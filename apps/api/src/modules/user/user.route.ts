import { Router } from 'express';
import { asyncHandler } from '../../common/async-handler';
import { validateBody } from '../../common/validate';
import { authenticate, requireRole } from '../auth/auth.middleware';
import { findUser, listUsers, patchUser, removeUser, storeUser } from './user.controller';
import { createUserSchema, updateUserSchema } from './user.validator';

const router = Router();
const adminOnly = [authenticate, requireRole(['ADMIN'])];

router.get('/', ...adminOnly, asyncHandler(listUsers));
router.get('/:id', ...adminOnly, asyncHandler(findUser));
router.post('/', ...adminOnly, validateBody(createUserSchema), asyncHandler(storeUser));
router.put('/:id', ...adminOnly, validateBody(updateUserSchema), asyncHandler(patchUser));
router.delete('/:id', ...adminOnly, asyncHandler(removeUser));

export default router;
