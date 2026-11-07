import { Router } from 'express';
import { UserRole } from '@cafe-project/database';
import { asyncHandler } from '../../common/async-handler';
import { validateBody } from '../../common/validate';
import { authMiddleware, roleMiddleware } from '../auth/auth.middleware';
import { ingredientController } from './ingredient.controller';
import {
    createIngredientSchema,
    importIngredientSchema,
    updateIngredientSchema,
    wasteIngredientSchema
} from './ingredient.validator';

export const ingredientRoutes = Router();

ingredientRoutes.use(authMiddleware);

ingredientRoutes.get(
    '/',
    roleMiddleware(UserRole.ADMIN, UserRole.STAFF),
    asyncHandler(ingredientController.list)
);

ingredientRoutes.get(
    '/:id',
    roleMiddleware(UserRole.ADMIN, UserRole.STAFF),
    asyncHandler(ingredientController.getById)
);

ingredientRoutes.get(
    '/:id/transactions',
    roleMiddleware(UserRole.ADMIN, UserRole.STAFF),
    asyncHandler(ingredientController.getTransactions)
);

ingredientRoutes.post(
    '/',
    roleMiddleware(UserRole.ADMIN),
    validateBody(createIngredientSchema),
    asyncHandler(ingredientController.create)
);

ingredientRoutes.patch(
    '/:id',
    roleMiddleware(UserRole.ADMIN),
    validateBody(updateIngredientSchema),
    asyncHandler(ingredientController.update)
);

ingredientRoutes.delete(
    '/:id',
    roleMiddleware(UserRole.ADMIN),
    asyncHandler(ingredientController.remove)
);

ingredientRoutes.post(
    '/:id/import',
    roleMiddleware(UserRole.ADMIN, UserRole.STAFF),
    validateBody(importIngredientSchema),
    asyncHandler(ingredientController.importStock)
);

ingredientRoutes.post(
    '/:id/waste',
    roleMiddleware(UserRole.ADMIN, UserRole.STAFF),
    validateBody(wasteIngredientSchema),
    asyncHandler(ingredientController.recordWaste)
);
