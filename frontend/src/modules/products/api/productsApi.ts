import apiClient from '@/core/api/apiClient';
import type { PaginationMeta } from '@/shared/types/api.types';

export type ProductType = 'REVENTA' | 'PERSONALIZADO';

export interface Product {
  id: string;
  internalCode: string;
  name: string;
  description?: string;
  type: ProductType;
  unit: string;
  currentStock: number;
  minStock: number;
  isActive: boolean;
  createdAt: string;
  productCodes: Array<{ id: string; code: string; isPrimary: boolean }>;
  productPrices: Array<{
    id: string;
    price: string;
    paymentMethod: { id: string; code: string; name: string };
  }>;
}

export interface ProductsPage {
  data: Product[];
  meta: PaginationMeta;
}

export interface CreateProductDto {
  name: string;
  description?: string;
  type?: ProductType;
  unit?: string;
  minStock?: number;
  barcode?: string;
}

export async function getProducts(params?: {
  search?: string;
  page?: number;
  limit?: number;
  type?: ProductType;
}): Promise<ProductsPage> {
  const res = await apiClient.get('/api/products', { params });
  return res.data;
}

export async function searchProducts(q: string): Promise<Product[]> {
  const res = await apiClient.get('/api/products/search', { params: { q } });
  return res.data.data;
}

export async function getProduct(id: string): Promise<Product> {
  const res = await apiClient.get(`/api/products/${id}`);
  return res.data.data;
}

export async function createProduct(dto: CreateProductDto): Promise<Product> {
  const res = await apiClient.post('/api/products', dto);
  return res.data.data;
}

export async function updateProduct(id: string, dto: Partial<CreateProductDto & { isActive: boolean }>): Promise<Product> {
  const res = await apiClient.patch(`/api/products/${id}`, dto);
  return res.data.data;
}

export async function deleteProduct(id: string): Promise<void> {
  await apiClient.delete(`/api/products/${id}`);
}

export async function upsertProductPrice(
  productId: string,
  paymentMethodId: string,
  price: number,
): Promise<void> {
  await apiClient.post('/api/product-prices', { productId, paymentMethodId, price });
}
