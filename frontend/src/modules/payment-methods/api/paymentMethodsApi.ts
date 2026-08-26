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

/** No sirven para cobrar: son la deuda misma o un crédito virtual */
const NON_COLLECTABLE_CODES = new Set(['CREDIT_ACCOUNT', 'EXCHANGE_CREDIT']);

/** Métodos con los que se puede cobrar una cuenta corriente */
export async function getCollectionMethods(): Promise<PaymentMethod[]> {
  const all = await getPaymentMethods();
  return all
    .filter((m) => m.isActive)
    .filter((m) => m.code === 'CASH' || !m.isPriceTier)
    .filter((m) => !NON_COLLECTABLE_CODES.has(m.code))
    .sort((a, b) => a.sortOrder - b.sortOrder);
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
