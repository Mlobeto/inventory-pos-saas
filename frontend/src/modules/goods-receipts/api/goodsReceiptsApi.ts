import apiClient from '@/core/api/apiClient';
import type { PaginationMeta } from '@/shared/types/api.types';

export type GoodsReceiptStatus = 'COMPLETE' | 'PARTIAL';

export interface GoodsReceiptItem {
  purchaseDetailId: string;
  productId: string;
  quantityExpected: number;
  quantityReceived: number;
  unitCost: number;
  notes?: string;
}

export interface GoodsReceipt {
  id: string;
  purchaseId: string;
  status: GoodsReceiptStatus;
  notes?: string;
  receivedAt: string;
  purchase: { id: string; invoiceNumber?: string };
  receivedBy: { firstName: string; lastName: string };
  details: Array<{
    id: string;
    productId: string;
    quantityExpected: number;
    quantityReceived: number;
    difference: number;
    unitCost: string;
    product: { id: string; name: string; internalCode: string };
    purchaseDetail: { quantityOrdered: number };
  }>;
  _count?: { details: number };
}

export interface GoodsReceiptsPage {
  data: GoodsReceipt[];
  meta: PaginationMeta;
}

export async function getGoodsReceipts(params?: { page?: number; limit?: number }): Promise<GoodsReceiptsPage> {
  const res = await apiClient.get('/api/goods-receipts', { params });
  return res.data;
}

export async function getGoodsReceipt(id: string): Promise<GoodsReceipt> {
  const res = await apiClient.get(`/api/goods-receipts/${id}`);
  return res.data.data;
}

export async function createGoodsReceipt(dto: {
  purchaseId: string;
  notes?: string;
  items: GoodsReceiptItem[];
}): Promise<GoodsReceipt> {
  const res = await apiClient.post('/api/goods-receipts', dto);
  return res.data.data;
}
