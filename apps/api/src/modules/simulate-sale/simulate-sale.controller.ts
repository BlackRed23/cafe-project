import type { Response } from 'express';
import { sendError, sendSuccess } from '../../common/response';
import type { AuthenticatedRequest } from '../auth/auth.middleware';
import { simulateSaleService } from './simulate-sale.service';
import type { SimulateSaleInput } from './simulate-sale.validator';

export const runSimulateSale = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!req.user) return sendError(res, 401, 'Authentication is required.');
    const result = await simulateSaleService.run(req.body as SimulateSaleInput, req.user.id);
    sendSuccess(res, 200, 'Simulate sale completed.', result);
};

export const restoreSimulateSale = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!req.user) return sendError(res, 401, 'Authentication is required.');
    const result = await simulateSaleService.restore(req.params.transactionId, req.user.id);
    sendSuccess(res, 200, 'Simulation sale restored.', result);
};

export const getPendingSimulateSaleRestore = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!req.user) return sendError(res, 401, 'Authentication is required.');
    const result = await simulateSaleService.pendingRestore(req.user.id);
    sendSuccess(res, 200, 'Pending simulation restore fetched.', result);
};
