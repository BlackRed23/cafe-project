import { Router } from 'express';
import { asyncHandler } from '../../common/async-handler';
import { validateBody } from '../../common/validate';
import { authenticate, requireRole } from '../auth/auth.middleware';
import { findSupplier, listProductsBySupplier, listSupplierProducts, listSuppliers, listSuppliersByProduct, patchSupplier, patchSupplierProduct, removeSupplier, removeSupplierProduct, storeSupplier, storeSupplierProduct } from './supplier.controller';
import { createSupplierProductSchema, createSupplierSchema, updateSupplierProductSchema, updateSupplierSchema } from './supplier.validator';
import { readIngredientSupplierEligibility } from './supplier-eligibility.read';
import { sendSuccess } from '../../common/response';

const supplierRoutes = Router();
const supplierProductRoutes = Router();
const canView = [authenticate, requireRole(['ADMIN'])];
const adminOnly = [authenticate, requireRole(['ADMIN'])];

supplierRoutes.get('/', ...canView, asyncHandler(listSuppliers));
// Catalog eligibility is not a supplier stock confirmation. No writes here.
supplierRoutes.get('/ingredients/:ingredientId/eligibility', ...adminOnly,
    asyncHandler(async (req, res) => sendSuccess(res, 200,
        'Supplier catalog and authoritative reorder inputs; capacity unverified.',
        await readIngredientSupplierEligibility(req.params.ingredientId))));
supplierRoutes.get('/:id', ...canView, asyncHandler(findSupplier));
supplierRoutes.get('/:supplierId/products', ...canView, asyncHandler(listProductsBySupplier));
supplierRoutes.post('/', ...adminOnly, validateBody(createSupplierSchema), asyncHandler(storeSupplier));
supplierRoutes.put('/:id', ...adminOnly, validateBody(updateSupplierSchema), asyncHandler(patchSupplier));
supplierRoutes.delete('/:id', ...adminOnly, asyncHandler(removeSupplier));

supplierProductRoutes.get('/', ...canView, asyncHandler(listSupplierProducts));
supplierProductRoutes.post('/', ...adminOnly, validateBody(createSupplierProductSchema), asyncHandler(storeSupplierProduct));
supplierProductRoutes.put('/:id', ...adminOnly, validateBody(updateSupplierProductSchema), asyncHandler(patchSupplierProduct));
supplierProductRoutes.delete('/:id', ...adminOnly, asyncHandler(removeSupplierProduct));

const productSupplierRoutes = Router();
productSupplierRoutes.get('/:productId/suppliers', ...canView, asyncHandler(listSuppliersByProduct));

export { supplierRoutes, supplierProductRoutes, productSupplierRoutes };
export default supplierRoutes;
