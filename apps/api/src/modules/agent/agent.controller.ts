import { errorMessage, errorStatus } from '../../common/error-fields';
import type { Response } from 'express';
import {
    createPurchaseRequestFromRecommendationViaAgentService,
    getAgentLogsViaAgentService,
    getRecommendationsViaAgentService,
    recommendReorderViaAgentService,
    scanInventoryViaAgentService
} from './agent.client';
import { sendError, sendSuccess } from '../../common/response';
import type { AuthenticatedRequest } from '../auth/auth.middleware';

const statusFromError = (error: unknown): number => errorStatus(error, 'statusCode') || errorStatus(error, 'status') || 500;
const messageFromError = (error: unknown, fallback: string): string => errorMessage(error) || fallback;

export const getLogs = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const result = await getAgentLogsViaAgentService(req.query, req.user?.id);
        sendSuccess(res, 200, 'Get agent logs successfully.', result);
    } catch (error) {
        sendError(res, statusFromError(error), messageFromError(error, 'Unable to retrieve agent logs.'));
    }
};

export const scanInventory = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!req.user) return sendError(res, 401, 'Authentication is required.');
    try {
        const result = await scanInventoryViaAgentService(req.body, req.user.id);
        sendSuccess(res, 200, 'Inventory scan completed.', result);
    } catch (error) {
        sendError(res, statusFromError(error), messageFromError(error, 'Inventory scan failed.'));
    }
};

export const recommendReorder = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!req.user) return sendError(res, 401, 'Authentication is required.');
    try {
        const result = await recommendReorderViaAgentService(req.body, req.user.id);
        sendSuccess(res, 200, 'AI inventory reorder recommendations generated successfully.', result);
    } catch (error) {
        sendError(res, statusFromError(error), messageFromError(error, 'Failed to generate recommendations.'));
    }
};

export const getRecommendations = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const result = await getRecommendationsViaAgentService(_req.user?.id);
        sendSuccess(res, 200, 'Recommendations fetched successfully.', result);
    } catch (error) {
        sendError(res, statusFromError(error), messageFromError(error, 'Failed to fetch recommendations.'));
    }
};

export const createPurchaseRequestFromRecommendation = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!req.user) return sendError(res, 401, 'Authentication is required.');
    try {
        const result = await createPurchaseRequestFromRecommendationViaAgentService(req.params.id, req.user.id);
        // Legacy URL now prepares a proposal only. It grants no approval/create authority.
        sendSuccess(res, 202, 'Proposal saved. Review version/hash and approve through Backend.', { proposal: result });
    } catch (error) {
        sendError(res, statusFromError(error), messageFromError(error, 'Failed to create purchase request.'));
    }
};
