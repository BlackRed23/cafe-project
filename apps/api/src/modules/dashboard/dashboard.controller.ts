import type { Response } from 'express';
import { sendSuccess, sendError } from '../../common/response';
import type { AuthenticatedRequest } from '../auth/auth.middleware';
import { dashboardService } from './dashboard.service';

export const getStaffSummary = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const summary = await dashboardService.getStaffSummary();
        sendSuccess(res, 200, 'Get staff dashboard summary successfully.', summary);
    } catch (error: any) {
        sendError(res, 500, error.message || 'Unable to retrieve staff dashboard summary.');
    }
};

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

export const getProfit = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const days = Number(req.query.days) || 30;
        const profit = await dashboardService.getProfit(days);
        sendSuccess(res, 200, 'Lấy thống kê giá vốn và lợi nhuận gộp thành công.', profit);
    } catch (error: any) {
        sendError(res, 500, error.message || 'Không thể lấy thống kê lợi nhuận.');
    }
};

export const getProductMargins = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const days = Number(req.query.days) || 30;
        const margins = await dashboardService.getProductMargins(days);
        sendSuccess(res, 200, 'Lấy thống kê biên lợi nhuận theo sản phẩm thành công.', margins);
    } catch (error: any) {
        sendError(res, 500, error.message || 'Không thể lấy thống kê biên lợi nhuận sản phẩm.');
    }
};

export const getIngredientUsage = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const days = Number(req.query.days) || 30;
        const usage = await dashboardService.getIngredientUsage(days);
        sendSuccess(res, 200, 'Lấy thống kê tiêu hao nguyên liệu thành công.', usage);
    } catch (error: any) {
        sendError(res, 500, error.message || 'Không thể lấy thống kê tiêu hao nguyên liệu.');
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
