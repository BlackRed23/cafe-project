import type { Request, Response } from 'express';
import { sendSuccess } from '../../common/response';
import { recipeService } from './recipe.service';
import type { CreateRecipeInput, CreateToppingInput, PreviewRecipeCostInput, UpdateToppingInput } from './recipe.validator';

export const recipeController = {
    async listByProduct(req: Request, res: Response) {
        const data = await recipeService.listByProduct(req.params.productId!);
        sendSuccess(res, 200, 'Lấy danh sách phiên bản công thức thành công.', data);
    },

    async getActiveByProduct(req: Request, res: Response) {
        const data = await recipeService.getActiveByProduct(req.params.productId!);
        sendSuccess(res, 200, 'Lấy công thức đang áp dụng thành công.', data);
    },

    async previewCost(req: Request, res: Response) {
        const data = await recipeService.previewCost(req.params.productId!, req.body as PreviewRecipeCostInput);
        sendSuccess(res, 200, 'Tính thử giá vốn công thức thành công.', data);
    },

    async createVersion(req: Request, res: Response) {
        const data = await recipeService.createVersion(req.params.productId!, req.body as CreateRecipeInput);
        sendSuccess(res, 201, 'Lưu phiên bản công thức mới thành công.', data);
    },

    async activateVersion(req: Request, res: Response) {
        const data = await recipeService.activateVersion(req.params.productId!, req.params.recipeId!);
        sendSuccess(res, 200, 'Kích hoạt phiên bản công thức thành công.', data);
    },

    async listToppings(req: Request, res: Response) {
        const includeInactive = req.query.includeInactive === 'true';
        const productId = typeof req.query.productId === 'string' ? req.query.productId : undefined;
        const data = await recipeService.listToppings(includeInactive, productId);
        sendSuccess(res, 200, 'Lấy danh sách topping thành công.', data);
    },

    async getTopping(req: Request, res: Response) {
        const data = await recipeService.getTopping(req.params.id!);
        sendSuccess(res, 200, 'Lấy thông tin topping thành công.', data);
    },

    async createTopping(req: Request, res: Response) {
        const data = await recipeService.createTopping(req.body as CreateToppingInput);
        sendSuccess(res, 201, 'Tạo topping thành công.', data);
    },

    async updateTopping(req: Request, res: Response) {
        const data = await recipeService.updateTopping(req.params.id!, req.body as UpdateToppingInput);
        sendSuccess(res, 200, 'Cập nhật topping thành công.', data);
    },

    async deleteTopping(req: Request, res: Response) {
        const data = await recipeService.deleteTopping(req.params.id!);
        sendSuccess(res, 200, 'Xóa/ẩn topping thành công.', data);
    }
};
