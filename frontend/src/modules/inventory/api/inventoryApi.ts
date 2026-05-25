import { apiClient } from '@/core/api/apiClient';
import type { PaginationResponse } from '@/shared/types/api.types';

export interface StockItem {
  id: string;
  internalCode: string;
  name: string;
  type: string;
  unit: string;
  currentStock: number;
  minStock: number;
}

export interface StockMovement {
  id: string;
  productId: string;
  product: {
    id: string;
    name: string;
    internalCode: string;
  };
  type: string;
  quantity: number;
  stockBefore: number;
  stockAfter: number;
  notes?: string;
  createdAt: string;
  createdBy?: {
    firstName: string;
    lastName: string;
  };
}

export async function getStock(params?: {
  page?: number;
  limit?: number;
  search?: string;
  lowStock?: boolean;
}): Promise<PaginationResponse<StockItem>> {
  const queryParams = new URLSearchParams();
  if (params?.page) queryParams.append('page', params.page.toString());
  if (params?.limit) queryParams.append('limit', params.limit.toString());
  if (params?.search) queryParams.append('search', params.search);
  if (params?.lowStock) queryParams.append('lowStock', 'true');

  const res = await apiClient.get(
    `/inventory/stock?${queryParams.toString()}`,
  );
  return res.data;
}

export async function getStockMovements(params?: {
  page?: number;
  limit?: number;
  productId?: string;
  type?: string;
}): Promise<PaginationResponse<StockMovement>> {
  const queryParams = new URLSearchParams();
  if (params?.page) queryParams.append('page', params.page.toString());
  if (params?.limit) queryParams.append('limit', params.limit.toString());
  if (params?.productId) queryParams.append('productId', params.productId);
  if (params?.type) queryParams.append('type', params.type);

  const res = await apiClient.get(
    `/inventory/movements?${queryParams.toString()}`,
  );
  return res.data;
}

export async function adjustStock(dto: {
  productId: string;
  type: 'AJUSTE_POSITIVO' | 'AJUSTE_NEGATIVO';
  quantity: number;
  notes?: string;
}): Promise<StockMovement> {
  const res = await apiClient.post('/inventory/adjustments', dto);
  return res.data;
}
