import type { createAdminClient } from '@/lib/supabase/admin';

type AdminClient = ReturnType<typeof createAdminClient>;

/** Create zero-quantity stock_ledger rows for any missing city × product combinations. */
export async function ensureStockLedgerForCity(admin: AdminClient, cityId: string) {
  const { data: products } = await admin.from('product_types').select('id');
  if (!products?.length) return;

  const rows = products.map((p) => ({
    product_type_id: p.id,
    city_id: cityId,
    current_quantity: 0,
  }));

  await admin
    .from('stock_ledger')
    .upsert(rows, { onConflict: 'city_id,product_type_id', ignoreDuplicates: true });
}
