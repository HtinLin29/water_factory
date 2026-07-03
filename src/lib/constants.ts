/** Pack sizes per product — read from DB at runtime; these are fallbacks only */
export const DEFAULT_PACK_SIZES = {
  '350ml': 10,
  '1L': 10,
} as const;

export const DEFAULT_LOW_STOCK_THRESHOLDS = {
  '20L': 10,
  '350ml': 3,
  '1L': 3,
} as const;

export const PRODUCT_NAMES = ['20L', '350ml', '1L'] as const;

export type ProductName = (typeof PRODUCT_NAMES)[number];
