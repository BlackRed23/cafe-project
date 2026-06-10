import type { Response } from 'express';
import { sendSuccess, sendError } from '../../common/response';
import type { AuthenticatedRequest } from '../auth/auth.middleware';
import { dashboardService } from './dashboard.service';

export const getSummary = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const summary = await dashboardService.getSummary();
        sendSuccess(res, 200, 'Get dashboard summary successfully.', summary);
    } catch (error: any) {
        sendError(res, 500, error.message || 'Unable to retrieve dashboard summary.');
    }
};

export const getRevenue = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const days = Number(req.query.days) || 30;
        const revenue = await dashboardService.getRevenue(days);
        sendSuccess(res, 200, 'Get revenue analytics successfully.', revenue);
    } catch (error: any) {
        sendError(res, 500, error.message || 'Unable to retrieve revenue analytics.');
    }
};

export const getLowStock = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const lowStock = await dashboardService.getLowStock();
        sendSuccess(res, 200, 'Get low stock products successfully.', lowStock);
    } catch (error: any) {
        sendError(res, 500, error.message || 'Unable to retrieve low stock list.');
    }
};

export const getRecentActivity = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const activities = await dashboardService.getRecentActivity();
        sendSuccess(res, 200, 'Get recent activities successfully.', activities);
    } catch (error: any) {
        sendError(res, 500, error.message || 'Unable to retrieve recent activities.');
    }
};
