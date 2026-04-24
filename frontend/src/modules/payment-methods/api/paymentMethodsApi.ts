import apiClient from '@/core/api/apiClient';

export interface PaymentMethod {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  isPriceTier: boolean;
}

// Labels de display para el grid de precios (pueden diferir del nombre general)
const PRICE_TIER_DISPLAY_LABELS: Record<string, string> = {
  CASH: 'Público Efectivo',
  PUBLIC: 'Público Otros',
};

export function getPriceTierLabel(method: PaymentMethod): string {
  return PRICE_TIER_DISPLAY_LABELS[method.code] ?? method.name;
}

export async function getPaymentMethods(): Promise<PaymentMethod[]> {
  const res = await apiClient.get('/api/payment-methods');
  return res.data.data;
}

const PRICE_TIER_CODES = new Set(['WHOLESALE', 'VENDEDOR', 'CASH', 'PUBLIC']);

/** Solo los 4 que se usan como listas de precio en productos */
export async function getPriceTierMethods(): Promise<PaymentMethod[]> {
  const all = await getPaymentMethods();
  // Usa isPriceTier si el backend lo devuelve; sino, fallback por código
  const hasPriceTierField = all.some((m) => m.isPriceTier === true);
  return hasPriceTierField
    ? all.filter((m) => m.isPriceTier)
    : all.filter((m) => PRICE_TIER_CODES.has(m.code));
}
