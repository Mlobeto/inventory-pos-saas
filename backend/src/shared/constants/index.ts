// Constantes globales del sistema

export const BCRYPT_ROUNDS = 12;

export const SEQUENCE_ENTITIES = {
  PRODUCT_CODE: 'PRODUCT_CODE',
  SALE_NUMBER: 'SALE_NUMBER',
} as const;

export const PRODUCT_INTERNAL_CODE_PREFIX = 'P';
export const SALE_NUMBER_PREFIX = 'V';

/**
 * Genera el código interno de un producto a partir de su número de secuencia.
 * Ej: 42 → "P-00042"
 */
export function formatProductCode(sequence: number): string {
  return `${PRODUCT_INTERNAL_CODE_PREFIX}-${String(sequence).padStart(5, '0')}`;
}

/**
 * Genera el número de venta a partir de su secuencia.
 * Ej: 1 → "V-000001"
 */
export function formatSaleNumber(sequence: number): string {
  return `${SALE_NUMBER_PREFIX}-${String(sequence).padStart(6, '0')}`;
}
