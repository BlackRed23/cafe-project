import { Router } from 'express';
import { UserRole } from '@cafe-project/database';
import { asyncHandler } from '../../common/async-handler';
import { validateBody } from '../../common/validate';
import { authMiddleware, roleMiddleware } from '../auth/auth.middleware';
import { recipeController } from './recipe.controller';
import {
    createRecipeSchema,
    createToppingSchema,
    previewRecipeCostSchema,
    updateToppingSchema
} from './recipe.validator';

export const productRecipeRoutes = Router();

productRecipeRoutes.get(
    '/:productId/recipes',
    authMiddleware,
    roleMiddleware(UserRole.ADMIN, UserRole.STAFF),
    asyncHandler(recipeController.listByProduct)
);

productRecipeRoutes.get(
    '/:productId/recipes/active',
    authMiddleware,
    roleMiddleware(UserRole.ADMIN, UserRole.STAFF),
    asyncHandler(recipeController.getActiveByProduct)
);

productRecipeRoutes.post(
    '/:productId/recipes/cost-preview',
    authMiddleware,
    roleMiddleware(UserRole.ADMIN, UserRole.STAFF),
    validateBody(previewRecipeCostSchema),
    asyncHandler(recipeController.previewCost)
);

productRecipeRoutes.post(
    '/:productId/recipes',
    authMiddleware,
    roleMiddleware(UserRole.ADMIN),
    validateBody(createRecipeSchema),
    asyncHandler(recipeController.createVersion)
);

productRecipeRoutes.post(
    '/:productId/recipes/:recipeId/activate',
    authMiddleware,
    roleMiddleware(UserRole.ADMIN),
    asyncHandler(recipeController.activateVersion)
);

export const toppingRoutes = Router();

toppingRoutes.get('/', asyncHandler(recipeController.listToppings));
toppingRoutes.get('/:id', asyncHandler(recipeController.getTopping));

toppingRoutes.post(
    '/',
    authMiddleware,
    roleMiddleware(UserRole.ADMIN),
    validateBody(createToppingSchema),
    asyncHandler(recipeController.createTopping)
);

toppingRoutes.patch(
    '/:id',
    authMiddleware,
    roleMiddleware(UserRole.ADMIN),
    validateBody(updateToppingSchema),
    asyncHandler(recipeController.updateTopping)
);

toppingRoutes.delete(
    '/:id',
    authMiddleware,
    roleMiddleware(UserRole.ADMIN),
    asyncHandler(recipeController.deleteTopping)
);
