import type { Response } from 'express';
import { sendError, sendSuccess } from '../../common/response';
import type { AuthenticatedRequest } from '../auth/auth.middleware';
import { agentService } from './agent.service';
import type { ScanInventoryInput, RecommendReorderInput } from './agent.validator';

export const scanInventory = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!req.user) return sendError(res, 401, 'Authentication is required.');
    const result = await agentService.scanInventory(req.body as ScanInventoryInput, req.user.id);
    sendSuccess(res, 200, 'Inventory scan completed.', result);
};

export const listAgentLogs = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const logs = await agentService.logs();
        sendSuccess(res, 200, 'Get agent logs successfully.', { logs });
    } catch (error: any) {
        sendError(res, 500, error.message || 'Unable to retrieve agent logs.');
    }
};

export const recommendReorder = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!req.user) return sendError(res, 401, 'Authentication is required.');
    try {
        const result = await agentService.recommendReorder(req.body as RecommendReorderInput, req.user.id);
        sendSuccess(res, 200, 'AI inventory reorder recommendations generated successfully.', result);
    } catch (error: any) {
        sendError(res, 500, error.message || 'Failed to generate recommendations.');
    }
};

export const getRecommendations = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const result = await agentService.getRecommendations();
        sendSuccess(res, 200, 'Recommendations fetched successfully.', result);
    } catch (error: any) {
        sendError(res, 500, error.message || 'Failed to fetch recommendations.');
    }
};

export const createPurchaseRequestFromRecommendation = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!req.user) return sendError(res, 401, 'Authentication is required.');
    try {
        const result = await agentService.createPurchaseRequestFromRecommendation(req.params.id, req.user.id);
        sendSuccess(res, 201, 'Purchase request created from AI recommendation successfully.', { purchaseRequest: result });
    } catch (error: any) {
        const status = error.status || 500;
        sendError(res, status, error.message || 'Failed to create purchase request.');
    }
};
