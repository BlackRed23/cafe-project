import type { Response } from 'express';
import { sendError, sendSuccess } from '../../common/response';
import type { AuthenticatedRequest } from '../auth/auth.middleware';
import { adjustInventory, getInventories, getInventoryById, getInventoryThresholdSuggestion, getInventoryTransactions, importInventory, updateInventoryThreshold } from './inventory.service';
import type { AdjustInventoryInput, ImportInventoryInput, UpdateThresholdInput } from './inventory.validator';

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

    const result = await importInventory(req.body as ImportInventoryInput, req.user.id);

    sendSuccess(res, 200, result.message, result);
};

export const adjustStock = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!req.user) {
        sendError(res, 401, 'Authentication is required.');
        return;
    }

    const result = await adjustInventory(req.body as AdjustInventoryInput, req.user.id);

    sendSuccess(res, 200, result.message, result);
};

export const updateThreshold = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!req.user) {
        sendError(res, 401, 'Authentication is required.');
        return;
    }

    const result = await updateInventoryThreshold(req.body as UpdateThresholdInput);

    sendSuccess(res, 200, result.message, result);
};

export const suggestThreshold = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const suggestion = await getInventoryThresholdSuggestion(req.params.id, {
        salesWindowDays: req.query.salesWindowDays ? Number(req.query.salesWindowDays) : undefined,
        bufferDays: req.query.bufferDays ? Number(req.query.bufferDays) : undefined,
        delayBufferDays: req.query.delayBufferDays ? Number(req.query.delayBufferDays) : undefined
    });

    sendSuccess(res, 200, 'Get threshold suggestion successfully.', { suggestion });
};
