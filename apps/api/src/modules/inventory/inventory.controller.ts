import type { Response } from 'express';
import { sendError, sendSuccess } from '../../common/response';
import type { AuthenticatedRequest } from '../auth/auth.middleware';
import { adjustInventory, getInventories, getInventoryById, getInventoryTransactions, importInventory } from './inventory.service';
import type { AdjustInventoryInput, ImportInventoryInput } from './inventory.validator';

export const listInventories = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    const inventories = await getInventories();

    sendSuccess(res, 200, 'Get inventories successfully.', { inventories });
};

export const findInventory = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const inventory = await getInventoryById(req.params.id);

    sendSuccess(res, 200, 'Get inventory successfully.', { inventory });
};

export const listInventoryTransactions = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    const transactions = await getInventoryTransactions();

    sendSuccess(res, 200, 'Get inventory transactions successfully.', { transactions });
};

export const importStock = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!req.user) {
        sendError(res, 401, 'Authentication is required.');
        return;
    }

    const inventory = await importInventory(req.body as ImportInventoryInput, req.user.id);

    sendSuccess(res, 200, 'Import inventory successfully.', { inventory });
};

export const adjustStock = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!req.user) {
        sendError(res, 401, 'Authentication is required.');
        return;
    }

    const inventory = await adjustInventory(req.body as AdjustInventoryInput, req.user.id);

    sendSuccess(res, 200, 'Adjust inventory successfully.', { inventory });
};