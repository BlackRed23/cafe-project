
import { apiClient } from "./client";

import type {
  LotList, LotTrace, LotTransitionPayload, LotTransitionResult, LotReturnPayload, LotReturnResult,
  ApiEnvelope,
  IngredientBatch,
  IngredientBatchQuery,
  ExpiringBatchQuery,
  IngredientBatchTransaction,
} from "../types/ingredient-batch.types";

const BASE = "/ingredient-batches";

function unwrap<T>(response: ApiEnvelope<T>): T {
  if (!response.success || response.data === null) {
    throw new Error(
      response.message || "Không nhận được dữ liệu từ máy chủ."
    );
  }

  return response.data;
}

const lotBase = (ingredientId: string) => `/ingredients/${encodeURIComponent(ingredientId)}`;
export const ingredientBatchesApi = {
  async listLots(ingredientId: string): Promise<LotList> {
    const response = await apiClient.get<ApiEnvelope<LotList>>(`${lotBase(ingredientId)}/batches`);
    const data = unwrap(response.data);
    if (!data || !Array.isArray(data.batches) || !data.ingredient || !Number.isFinite(data.warningDays) || !Number.isFinite(Date.parse(data.evaluatedAt))) {
      throw new Error('Định dạng dữ liệu lô không hợp lệ.');
    }
    return data;
  },
  async traceLot(ingredientId: string, batchId: string): Promise<LotTrace> {
    const response = await apiClient.get<ApiEnvelope<LotTrace>>(`${lotBase(ingredientId)}/batches/${encodeURIComponent(batchId)}/trace`);
    const data = unwrap(response.data);
    if (!data || !data.batch || ![data.events, data.outbound, data.orders, data.orderItems, data.returns].every(Array.isArray)) throw new Error('Định dạng truy xuất lô không hợp lệ.');
    return data;
  },
  async transitionLot(ingredientId: string, batchId: string, action: 'quarantine' | 'recall', payload: LotTransitionPayload): Promise<LotTransitionResult> {
    const response = await apiClient.post<ApiEnvelope<LotTransitionResult>>(`${lotBase(ingredientId)}/batches/${encodeURIComponent(batchId)}/${action}`, payload);
    return unwrap(response.data);
  },
  async returnLot(ingredientId: string, payload: LotReturnPayload): Promise<LotReturnResult> {
    const response = await apiClient.post<ApiEnvelope<LotReturnResult>>(`${lotBase(ingredientId)}/returns`, payload);
    return unwrap(response.data);
  },
  async getAll(
    query: IngredientBatchQuery = {}
  ): Promise<IngredientBatch[]> {
    const response = await apiClient.get<
      ApiEnvelope<IngredientBatch[]>
    >(BASE, { params: query });

    const data = unwrap(response.data);

    if (!Array.isArray(data)) {
      throw new Error("Định dạng danh sách lô không hợp lệ.");
    }

    return data;
  },

  async getExpiring(
    query: ExpiringBatchQuery = {}
  ): Promise<IngredientBatch[]> {
    const response = await apiClient.get<
      ApiEnvelope<IngredientBatch[]>
    >(`${BASE}/expiring`, { params: query });

    const data = unwrap(response.data);

    if (!Array.isArray(data)) {
      throw new Error("Định dạng danh sách lô sắp hết hạn không hợp lệ.");
    }

    return data;
  },

    getById: async (id: string): Promise<IngredientBatch> => {
    const response = await apiClient.get<
        ApiEnvelope<IngredientBatch>
    >(`${BASE}/${encodeURIComponent(id)}`);

    return unwrap(response.data);
    },



    async getTransactions(
        id: string
    ): Promise<IngredientBatchTransaction[]> {
        const response = await apiClient.get<
            ApiEnvelope<unknown>
        >(
            `${BASE}/${encodeURIComponent(id)}/transactions`
        );

        const data = unwrap(response.data);

        if (!Array.isArray(data)) {
            throw new Error(
            "Định dạng lịch sử giao dịch của lô không hợp lệ."
            );
        }

        return data as IngredientBatchTransaction[];
    },

};
