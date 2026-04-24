import apiClient from '@/core/api/apiClient';
import type { PaginationMeta } from '@/shared/types/api.types';

export interface Supplier {
  id: string;
  name: string;
  taxId?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  isGeneric: boolean;
  createdAt: string;
}

export interface SuppliersPage {
  data: Supplier[];
  meta: PaginationMeta;
}

export interface CreateSupplierDto {
  name: string;
  taxId?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}

export async function getSuppliers(params?: { search?: string; page?: number; limit?: number }): Promise<SuppliersPage> {
  const res = await apiClient.get('/api/suppliers', { params });
  return res.data;
}

export async function getSupplier(id: string): Promise<Supplier> {
  const res = await apiClient.get(`/api/suppliers/${id}`);
  return res.data.data;
}

export async function createSupplier(dto: CreateSupplierDto): Promise<Supplier> {
  const res = await apiClient.post('/api/suppliers', dto);
  return res.data.data;
}

export async function updateSupplier(id: string, dto: Partial<CreateSupplierDto>): Promise<Supplier> {
  const res = await apiClient.patch(`/api/suppliers/${id}`, dto);
  return res.data.data;
}
