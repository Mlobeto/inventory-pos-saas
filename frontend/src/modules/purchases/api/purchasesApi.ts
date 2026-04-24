import apiClient from '@/core/api/apiClient';
import type { PaginationMeta } from '@/shared/types/api.types';

export type PurchaseStatus = 'DRAFT' | 'CONFIRMED' | 'PARTIALLY_RECEIVED' | 'FULLY_RECEIVED' | 'CANCELLED';

export interface PurchaseDetail {
  id: string;
  productId: string;
  quantityOrdered: number;
  unitCost: string;
  subtotal: string;
  product: { id: string; name: string; internalCode: string };
}

export interface Purchase {
  id: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  status: PurchaseStatus;
  subtotal: string;
  totalAmount: string;
  notes?: string;
  createdAt: string;
  supplier: { id: string; name: string };
  details: PurchaseDetail[];
  goodsReceipts?: Array<{ id: string; status: string; receivedAt: string }>;
  _count?: { details: number; goodsReceipts: number };
}

export interface PurchasesPage {
  data: Purchase[];
  meta: PaginationMeta;
}

export interface CreatePurchaseDto {
  supplierId: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  notes?: string;
  items: Array<{ productId: string; quantityOrdered: number; unitCost: number }>;
}

export async function getPurchases(params?: {
  page?: number;
  limit?: number;
  status?: PurchaseStatus;
}): Promise<PurchasesPage> {
  const res = await apiClient.get('/api/purchases', { params });
  return res.data;
}

export async function getPurchase(id: string): Promise<Purchase> {
  const res = await apiClient.get(`/api/purchases/${id}`);
  return res.data.data;
}

export async function createPurchase(dto: CreatePurchaseDto): Promise<Purchase> {
  const res = await apiClient.post('/api/purchases', dto);
  return res.data.data;
}

export async function confirmPurchase(id: string): Promise<Purchase> {
  const res = await apiClient.post(`/api/purchases/${id}/confirm`);
  return res.data.data;
}
