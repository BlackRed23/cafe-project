import type { Request, Response } from 'express';
import { sendSuccess } from '../../common/response';
import type { AuthenticatedRequest } from '../auth/auth.middleware';
import { ingredientService } from './ingredient.service';
import type {
    CreateIngredientInput,
    ImportIngredientInput,
    IngredientFiltersInput,
    UpdateIngredientInput,
    WasteIngredientInput
} from './ingredient.validator';

export const ingredientController = {
    async list(req: Request, res: Response) {
        const data = await ingredientService.list(req.query as IngredientFiltersInput);
        sendSuccess(res, 200, 'Lấy danh sách nguyên liệu thành công.', data);
    },

    async getById(req: Request, res: Response) {
        const data = await ingredientService.getById(req.params.id!);
        sendSuccess(res, 200, 'Lấy chi tiết nguyên liệu thành công.', data);
    },

    async create(req: Request, res: Response) {
        const data = await ingredientService.create(req.body as CreateIngredientInput);
        sendSuccess(res, 201, 'Tạo nguyên liệu thành công.', data);
    },

    async update(req: Request, res: Response) {
        const data = await ingredientService.update(req.params.id!, req.body as UpdateIngredientInput);
        sendSuccess(res, 200, 'Cập nhật nguyên liệu thành công.', data);
    },

    async remove(req: Request, res: Response) {
        const data = await ingredientService.softDelete(req.params.id!);
        sendSuccess(res, 200, 'Đã ngừng hoạt động nguyên liệu.', data);
    },

    async importStock(req: AuthenticatedRequest, res: Response) {
        const data = await ingredientService.importStock(req.params.id!, req.body as ImportIngredientInput, req.user!.id);
        sendSuccess(res, 200, 'Nhập kho nguyên liệu thành công.', data);
    },

    async recordWaste(req: AuthenticatedRequest, res: Response) {
        const data = await ingredientService.recordWaste(req.params.id!, req.body as WasteIngredientInput, req.user!.id);
        sendSuccess(res, 200, 'Ghi nhận hao hụt nguyên liệu thành công.', data);
    },

    async getTransactions(req: Request, res: Response) {
        const data = await ingredientService.getTransactions(req.params.id!);
        sendSuccess(res, 200, 'Lấy lịch sử giao dịch nguyên liệu thành công.', data);
    }
};
