import apiClient from '@/core/api/apiClient';
import type { PaginationMeta } from '@/shared/types/api.types';

export type SaleStatus = 'COMPLETED' | 'CANCELLED' | 'PARTIALLY_RETURNED' | 'FULLY_RETURNED';

export interface SaleItemInput {
  productId: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  discountAmount?: number;
  appliedPriceListCode: string;
}

export interface SalePaymentInput {
  paymentMethodId: string;
  amount: number;
  reference?: string;
}

export interface CreateSaleDto {
  items: SaleItemInput[];
  payments: SalePaymentInput[];
  notes?: string;
  discountAmount?: number;
  customerId?: string;
}

export interface SaleDetailItem {
  id: string;
  product: { id: string; name: string; internalCode: string };
  quantity: number;
  unitPrice: string;
  unitCost: string;
  discountAmount: string;
  subtotal: string;
  appliedPriceListCode: string;
}

export interface SalePayment {
  id: string;
  paymentMethod: { id: string; code: string; name: string };
  amount: string;
  reference?: string;
  paidAt: string;
}

export interface Sale {
  id: string;
  saleNumber: string;
  status: SaleStatus;
  subtotal: string;
  discountAmount: string;
  totalAmount: string;
  notes?: string;
  createdAt: string;
  cancelledAt?: string;
  cancelReason?: string;
  seller: { firstName: string; lastName: string };
  customer?: { id: string; name: string; type: string } | null;
  payments: SalePayment[];
  details?: SaleDetailItem[];
  _count?: { details: number };
}

export interface SalesPage {
  data: Sale[];
  meta: PaginationMeta;
}

export async function getSales(params?: { page?: number; limit?: number }): Promise<SalesPage> {
  const res = await apiClient.get('/api/sales', { params });
  return res.data;
}

export async function getSaleDetail(id: string): Promise<Sale> {
  const res = await apiClient.get(`/api/sales/${id}`);
  return res.data.data;
}

export async function createSale(dto: CreateSaleDto): Promise<Sale> {
  const res = await apiClient.post('/api/sales', dto);
  return res.data.data;
}

export async function cancelSale(id: string, reason: string): Promise<Sale> {
  const res = await apiClient.post(`/api/sales/${id}/cancel`, { reason });
  return res.data.data;
}
