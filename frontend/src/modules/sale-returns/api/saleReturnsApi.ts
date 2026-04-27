import apiClient from '@/core/api/apiClient';
import type { PaginationMeta } from '@/shared/types/api.types';

export type ReturnItemCondition = 'GOOD' | 'DAMAGED' | 'UNUSABLE';

export const CONDITION_LABELS: Record<ReturnItemCondition, string> = {
  GOOD: 'Buen estado',
  DAMAGED: 'Dañado',
  UNUSABLE: 'Inutilizable',
};

export interface SaleReturnDetailItem {
  id: string;
  productId: string;
  product: { id: string; name: string; internalCode: string };
  quantityReturned: number;
  unitPrice: string;
  subtotal: string;
  condition: ReturnItemCondition;
  restockable: boolean;
  notes?: string;
}

export interface SaleReturn {
  id: string;
  saleId: string;
  type: 'REFUND' | 'EXCHANGE';
  reason: string;
  totalAmount: string;
  createdAt: string;
  sale: { saleNumber: string };
  processedBy: { firstName: string; lastName: string };
  details?: SaleReturnDetailItem[];
  _count?: { details: number };
}

export interface SaleReturnsPage {
  data: SaleReturn[];
  meta: PaginationMeta;
}

export interface CreateReturnItemDto {
  saleDetailId: string;
  productId: string;
  quantityReturned: number;
  unitPrice: number;
  condition: ReturnItemCondition;
  restockable: boolean;
  notes?: string;
}

export interface CreateSaleReturnDto {
  saleId: string;
  type: 'EXCHANGE';
  reason: string;
  items: CreateReturnItemDto[];
}

export async function getSaleReturns(params?: {
  page?: number;
  limit?: number;
}): Promise<SaleReturnsPage> {
  const res = await apiClient.get('/api/sale-returns', { params });
  return res.data;
}

export async function createSaleReturn(dto: CreateSaleReturnDto): Promise<SaleReturn> {
  const res = await apiClient.post('/api/sale-returns', dto);
  return res.data.data;
}
