import apiClient from '@/core/api/apiClient';
import type { PaginationMeta } from '@/shared/types/api.types';

export type SaleStatus = 'COMPLETED' | 'CANCELLED' | 'PARTIALLY_RETURNED' | 'FULLY_RETURNED';
export type AfipInvoiceStatus = 'AUTHORIZED' | 'REJECTED' | 'ERROR';

export interface AfipInvoiceSummary {
  id: string;
  status: AfipInvoiceStatus;
  invoiceNumber: number;
  pointOfSale: number;
  cae: string | null;
  caeExpiry: string | null;
}

export interface AfipInvoiceFull extends AfipInvoiceSummary {
  tenantId: string;
  saleId: string;
  invoiceType: number;
  concept: number;
  invoiceDate: string;
  docType: number;
  docNumber: string;
  totalAmount: string;
  observations?: unknown;
  errorMessage?: string | null;
  qrCode?: string; // base64 PNG
  createdAt: string;
  updatedAt: string;
  sale?: {
    saleNumber: string;
    totalAmount: string;
    createdAt: string;
    seller: { firstName: string; lastName: string };
    customer?: { name: string; taxId?: string | null; type: string; phone?: string | null; email?: string | null; address?: string | null } | null;
    details?: Array<{
      quantity: number;
      unitPrice: string;
      subtotal: string;
      product: { name: string; internalCode: string };
    }>;
  };
}

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
  afipInvoice?: AfipInvoiceSummary | null;
  returns?: { id: string; details: { saleDetailId: string; quantityReturned: number }[] }[];
}

export interface SalesPage {
  data: Sale[];
  meta: PaginationMeta;
}

export async function getSales(params?: {
  page?: number;
  limit?: number;
  saleNumber?: string;
  dateFrom?: string;
  dateTo?: string;
  customerName?: string;
  sellerSearch?: string;
  pendingInvoice?: boolean;
}): Promise<SalesPage> {
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

// ─── AFIP invoice ─────────────────────────────────────────────────────────────

export async function createInvoice(saleId: string): Promise<AfipInvoiceFull> {
  const res = await apiClient.post(`/api/sales/${saleId}/invoice`);
  return res.data.data;
}

export async function getInvoice(saleId: string): Promise<AfipInvoiceFull> {
  const res = await apiClient.get(`/api/sales/${saleId}/invoice`);
  return res.data.data;
}

// ─── AFIP settings ────────────────────────────────────────────────────────────

export interface AfipConfig {
  cuit: string;
  businessName: string;
  address: string;
  city: string;
  pointOfSale: number;
  production: boolean;
  hasCert: boolean;
  hasKey: boolean;
  csr?: string | null;
}

export async function getAfipSettings(): Promise<AfipConfig> {
  const res = await apiClient.get('/api/afip/settings');
  return res.data.data;
}

export async function saveAfipSettings(data: {
  cuit?: string;
  businessName?: string;
  address?: string;
  city?: string;
  cert?: string;
  key?: string;
  pointOfSale?: number;
  production?: boolean;
}): Promise<AfipConfig & { message: string }> {
  const res = await apiClient.put('/api/afip/settings', data);
  return res.data.data;
}

export async function generateCsr(data: {
  cuit: string;
  businessName?: string;
}): Promise<{ csr: string; message: string }> {
  const res = await apiClient.post('/api/afip/generate-csr', data);
  return res.data.data;
}

export async function testAfipConnection(): Promise<unknown> {
  const res = await apiClient.get('/api/afip/status');
  return res.data.data;
}
