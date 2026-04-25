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
