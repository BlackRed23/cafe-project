import type { Request, Response } from 'express';
import { sendSuccess } from '../../common/response';
import { supplierService } from './supplier.service';
import type { CreateSupplierInput, CreateSupplierProductInput, UpdateSupplierInput, UpdateSupplierProductInput } from './supplier.validator';

export const listSuppliers = async (_req: Request, res: Response): Promise<void> => sendSuccess(res, 200, 'Get suppliers successfully.', { suppliers: await supplierService.listSuppliers() });
export const findSupplier = async (req: Request, res: Response): Promise<void> => sendSuccess(res, 200, 'Get supplier successfully.', { supplier: await supplierService.getSupplier(req.params.id) });
export const storeSupplier = async (req: Request, res: Response): Promise<void> => sendSuccess(res, 201, 'Create supplier successfully.', { supplier: await supplierService.createSupplier(req.body as CreateSupplierInput) });
export const patchSupplier = async (req: Request, res: Response): Promise<void> => sendSuccess(res, 200, 'Update supplier successfully.', { supplier: await supplierService.updateSupplier(req.params.id, req.body as UpdateSupplierInput) });
export const removeSupplier = async (req: Request, res: Response): Promise<void> => sendSuccess(res, 200, 'Delete supplier successfully.', { supplier: await supplierService.deleteSupplier(req.params.id) });

export const listSupplierProducts = async (_req: Request, res: Response): Promise<void> => sendSuccess(res, 200, 'Get supplier products successfully.', { supplierProducts: await supplierService.listSupplierProducts() });
export const listProductsBySupplier = async (req: Request, res: Response): Promise<void> => sendSuccess(res, 200, 'Get supplier products successfully.', { supplierProducts: await supplierService.listProductsBySupplier(req.params.supplierId) });
export const listSuppliersByProduct = async (req: Request, res: Response): Promise<void> => sendSuccess(res, 200, 'Get product suppliers successfully.', { supplierProducts: await supplierService.listSuppliersByProduct(req.params.productId) });
export const storeSupplierProduct = async (req: Request, res: Response): Promise<void> => sendSuccess(res, 201, 'Create supplier product successfully.', { supplierProduct: await supplierService.createSupplierProduct(req.body as CreateSupplierProductInput) });
export const patchSupplierProduct = async (req: Request, res: Response): Promise<void> => sendSuccess(res, 200, 'Update supplier product successfully.', { supplierProduct: await supplierService.updateSupplierProduct(req.params.id, req.body as UpdateSupplierProductInput) });
export const removeSupplierProduct = async (req: Request, res: Response): Promise<void> => sendSuccess(res, 200, 'Delete supplier product successfully.', { supplierProduct: await supplierService.deleteSupplierProduct(req.params.id) });