import apiClient from '@/core/api/apiClient';
import type { PaginationMeta } from '@/shared/types/api.types';

export type CustomerType = 'CONSUMIDOR_FINAL' | 'MAYORISTA' | 'VENDEDOR' | 'FACTURABLE';

export const CUSTOMER_TYPE_LABELS: Record<CustomerType, string> = {
  CONSUMIDOR_FINAL: 'Consumidor Final',
  MAYORISTA: 'Mayorista',
  VENDEDOR: 'Vendedor',
  FACTURABLE: 'Facturable',
};

export interface Customer {
  id: string;
  type: CustomerType;
  name: string;
  taxId?: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
  creditLimit?: string;
  isActive: boolean;
  createdAt: string;
}

export interface CustomersPage {
  data: Customer[];
  meta: PaginationMeta;
}

export interface CreateCustomerDto {
  type: CustomerType;
  name: string;
  taxId?: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
  creditLimit?: number;
}

export async function getCustomers(params?: {
  search?: string;
  type?: CustomerType;
  page?: number;
  limit?: number;
}): Promise<CustomersPage> {
  const res = await apiClient.get('/api/customers', { params });
  return res.data;
}

export async function getCustomer(id: string): Promise<Customer> {
  const res = await apiClient.get(`/api/customers/${id}`);
  return res.data.data;
}

export async function createCustomer(dto: CreateCustomerDto): Promise<Customer> {
  const res = await apiClient.post('/api/customers', dto);
  return res.data.data;
}

export async function updateCustomer(id: string, dto: Partial<CreateCustomerDto>): Promise<Customer> {
  const res = await apiClient.patch(`/api/customers/${id}`, dto);
  return res.data.data;
}

export async function deleteCustomer(id: string): Promise<void> {
  await apiClient.delete(`/api/customers/${id}`);
}

export async function searchCustomers(search: string, type?: CustomerType): Promise<Customer[]> {
  const res = await apiClient.get('/api/customers', {
    params: { search, type, limit: 20 },
  });
  return res.data.data ?? [];
}

// ── Cuenta Corriente ──────────────────────────────────────────────────────────

export type ReceivableStatus = 'PENDING' | 'PARTIAL' | 'PAID';

export interface SaleDetail {
  quantity: number;
  unitPrice: string;
  discountAmount: string;
  subtotal: string;
  appliedPriceListCode: string;
  product: { id: string; name: string; internalCode: string };
}

export interface CustomerReceivable {
  id: string;
  saleId: string;
  originalAmount: string;
  paidAmount: string;
  remainingAmount: string;
  status: ReceivableStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  sale: {
    id: string;
    saleNumber: string;
    totalAmount: string;
    createdAt: string;
    details?: SaleDetail[];
  };
  payments?: CustomerPayment[];
}

export interface CustomerPayment {
  id: string;
  amount: string;
  paymentMethod: string;
  reference?: string;
  notes?: string;
  paidAt: string;
  createdBy?: { firstName: string; lastName: string };
}

export interface CustomerStatement {
  customer: Pick<Customer, 'id' | 'name' | 'type' | 'phone' | 'email'>;
  receivables: CustomerReceivable[];
  summary: {
    totalDebt: string;
    totalPaid: string;
    balance: string;
    pendingCount: number;
  };
}

export async function getCustomerStatement(id: string): Promise<CustomerStatement> {
  const res = await apiClient.get(`/api/customers/${id}/statement`);
  return res.data.data;
}

export async function getCustomerReceivables(id: string): Promise<CustomerReceivable[]> {
  const res = await apiClient.get(`/api/customers/${id}/receivables`);
  return res.data.data ?? [];
}

export interface CreatePaymentDto {
  receivableId: string;
  amount: number;
  paymentMethod: string;
  reference?: string;
  notes?: string;
}

export async function createCustomerPayment(
  customerId: string,
  dto: CreatePaymentDto,
): Promise<CustomerPayment> {
  const res = await apiClient.post(`/api/customers/${customerId}/payments`, dto);
  return res.data.data;
}
