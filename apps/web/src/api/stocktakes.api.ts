import { apiClient, unwrapApiData } from './client';
import type { StocktakeCreate, StocktakeCount, StocktakeData } from '../types/stocktake.types';
const path = (id: string) => `/stocktakes/${encodeURIComponent(id)}`;
const verified = (response: { data: unknown }): StocktakeData => {
  const data = unwrapApiData<StocktakeData>(response.data as Parameters<typeof unwrapApiData<StocktakeData>>[0]);
  if (!data?.session?.id || !Array.isArray(data.entries) || !Array.isArray(data.current) ||
      data.current.some(i => !/^\d+$/.test(i.cursor)) ||
      data.entries.some(e => !/^\d+$/.test(e.openingCursor))) throw new Error('Invalid stocktake response');
  return data;
};
export const stocktakesApi = {
  create: async (body: StocktakeCreate) => verified(await apiClient.post('/stocktakes', body)),
  get: async (id: string) => verified(await apiClient.get(path(id))),
  save: async (id: string, body: StocktakeCount) => verified(await apiClient.post(`${path(id)}/entries`, body)),
  submit: async (id: string, requestId: string) => verified(await apiClient.post(`${path(id)}/submit`, {requestId})),
  approve: async (id: string, requestId: string) => verified(await apiClient.post(`${path(id)}/approve`, {requestId})),
  reject: async (id: string, body: {requestId:string;reason:string}) => verified(await apiClient.post(`${path(id)}/reject`, body)),
  reopen: async (id: string, body: {requestId:string;reason:string}) => verified(await apiClient.post(`${path(id)}/reopen`, body)),
};
