import apiClient from '@/core/api/apiClient';

export async function upsertProductPrice(dto: {
  productId: string;
  paymentMethodId: string;
  price: number;
}): Promise<void> {
  await apiClient.post('/api/product-prices', dto);
}

export async function upsertProductPrices(
  productId: string,
  prices: Array<{ paymentMethodId: string; price: number }>,
): Promise<void> {
  await Promise.all(
    prices
      .filter((p) => p.price > 0)
      .map((p) => upsertProductPrice({ productId, ...p })),
  );
}
