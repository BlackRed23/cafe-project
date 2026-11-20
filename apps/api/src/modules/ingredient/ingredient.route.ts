import { Router } from 'express';
import { UserRole } from '@cafe-project/database';
import { asyncHandler } from '../../common/async-handler';
import { validateBody } from '../../common/validate';
import { authMiddleware, roleMiddleware } from '../auth/auth.middleware';
import { ingredientController } from './ingredient.controller';
import { ingredientIncidentService } from './ingredient-incident.service';
import { ingredientInternalUseService } from './ingredient-internal-use.service';
import { ingredientLotService } from './ingredient-lot.service';
import { reconcileIngredientInventory } from '../inventory/inventory-reconciliation.service';
import { inventoryAdjustmentService } from '../inventory/inventory-adjustment.service';
import { inventoryCorrectionService } from '../inventory/inventory-correction.service';
import { sendSuccess } from '../../common/response';
import type { AuthenticatedRequest } from '../auth/auth.middleware';
import {
    createIngredientSchema,
    ingredientIncidentSchema,
    ingredientAdjustmentSchema,
    ingredientCorrectionSchema,
    ingredientInternalUseSchema,
    lotTransitionSchema,
    lotReturnSchema,
    importIngredientSchema,
    updateIngredientSchema,
    wasteIngredientSchema
} from './ingredient.validator';

export const ingredientRoutes = Router();

ingredientRoutes.use(authMiddleware);

ingredientRoutes.get('/:id/batches', roleMiddleware(UserRole.ADMIN, UserRole.STAFF),
    asyncHandler(async (req, res) => {
        sendSuccess(res, 200, 'Ingredient lots.', await ingredientLotService.list(req.params.id!));
    }));
ingredientRoutes.get('/:id/reconciliation', roleMiddleware(UserRole.ADMIN, UserRole.STAFF),
    asyncHandler(async (req, res) => {
        sendSuccess(res, 200, 'Đối soát tồn kho chỉ đọc.', await reconcileIngredientInventory(req.params.id!));
    }));
ingredientRoutes.post('/:id/adjustments', roleMiddleware(UserRole.ADMIN, UserRole.STAFF), validateBody(ingredientAdjustmentSchema),
    asyncHandler(async (req: AuthenticatedRequest, res) => {
        sendSuccess(res, 201, 'Đã tạo phiếu kiểm kê chờ duyệt.',
            await inventoryAdjustmentService.create(req.params.id!, req.body, req.user!.id));
    }));
ingredientRoutes.get('/:id/adjustments/:requestId', roleMiddleware(UserRole.ADMIN, UserRole.STAFF),
    asyncHandler(async (req, res) => {
        sendSuccess(res, 200, 'Chi tiết phiếu kiểm kê.',
            await inventoryAdjustmentService.get(req.params.id!, req.params.requestId!));
    }));
ingredientRoutes.post('/:id/adjustments/:requestId/approve', roleMiddleware(UserRole.ADMIN),
    asyncHandler(async (req: AuthenticatedRequest, res) => {
        sendSuccess(res, 200, 'Đã duyệt phiếu kiểm kê.',
            await inventoryAdjustmentService.approve(req.params.id!, req.params.requestId!, req.user!.id));
    }));
ingredientRoutes.post('/:id/adjustments/:requestId/reject', roleMiddleware(UserRole.ADMIN),
    asyncHandler(async (req: AuthenticatedRequest, res) => {
        sendSuccess(res, 200, 'Đã từ chối phiếu kiểm kê.',
            await inventoryAdjustmentService.reject(req.params.id!, req.params.requestId!, req.user!.id));
    }));
ingredientRoutes.post('/:id/transactions/:transactionId/corrections', roleMiddleware(UserRole.ADMIN),
    validateBody(ingredientCorrectionSchema), asyncHandler(async (req: AuthenticatedRequest, res) => {
        sendSuccess(res, 200, 'Đã ghi bút toán đảo riêng biệt; không sửa giao dịch gốc.',
            await inventoryCorrectionService.compensate(req.params.id!, req.params.transactionId!, req.body, req.user!.id));
    }));
ingredientRoutes.get('/:id/batches/:batchId/trace', roleMiddleware(UserRole.ADMIN, UserRole.STAFF),
    asyncHandler(async (req, res) => {
        sendSuccess(res, 200, 'Lot traceability.', await ingredientLotService.trace(req.params.id!, req.params.batchId!));
    }));
for (const [path, action] of [['quarantine', 'QUARANTINE'], ['recall', 'RECALL']] as const) {
    ingredientRoutes.post(`/:id/batches/:batchId/${path}`, roleMiddleware(UserRole.ADMIN), validateBody(lotTransitionSchema),
        asyncHandler(async (req: AuthenticatedRequest, res) => {
            sendSuccess(res, 200, 'Lot lifecycle recorded.', await ingredientLotService.transition(
                req.params.id!, req.params.batchId!, action, req.body, req.user!.id));
        }));
}
ingredientRoutes.post('/:id/returns', roleMiddleware(UserRole.ADMIN), validateBody(lotReturnSchema),
    asyncHandler(async (req: AuthenticatedRequest, res) => {
        sendSuccess(res, 200, 'Returned stock segregated under quarantine.',
            await ingredientLotService.returnStock(req.params.id!, req.body, req.user!.id));
    }));
ingredientRoutes.delete('/:id/batches/:batchId', roleMiddleware(UserRole.ADMIN),
    asyncHandler(async (req, res) => {
        sendSuccess(res, 200, 'Lot deletion.', await ingredientLotService.remove(req.params.id!, req.params.batchId!));
    }));

ingredientRoutes.post('/:id/internal-use', roleMiddleware(UserRole.ADMIN),
    validateBody(ingredientInternalUseSchema), asyncHandler(async (req: AuthenticatedRequest, res) => {
        sendSuccess(res, 200, 'Internal usage confirmed.',
            await ingredientInternalUseService.confirm(req.params.id!, req.body, req.user!.id));
    }));

ingredientRoutes.post('/:id/incidents', roleMiddleware(UserRole.ADMIN, UserRole.STAFF),
    validateBody(ingredientIncidentSchema), asyncHandler(async (req: AuthenticatedRequest, res) => {
        sendSuccess(res, 201, 'Incident pending verification and ADMIN approval.',
            await ingredientIncidentService.create(req.params.id!, req.body, req.user!.id));
    }));
ingredientRoutes.get('/:id/incidents/:incidentId', roleMiddleware(UserRole.ADMIN, UserRole.STAFF),
    asyncHandler(async (req, res) => {
        sendSuccess(res, 200, 'Ingredient incident.', await ingredientIncidentService.get(req.params.id!, req.params.incidentId!));
    }));
ingredientRoutes.post('/:id/incidents/:incidentId/approve', roleMiddleware(UserRole.ADMIN),
    asyncHandler(async (req: AuthenticatedRequest, res) => {
        sendSuccess(res, 200, 'Verified stock count approved.',
            await ingredientIncidentService.approve(req.params.id!, req.params.incidentId!, req.user!.id));
    }));

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
