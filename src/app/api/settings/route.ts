import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getAuthenticatedManager,
  unauthorizedResponse,
  badRequestResponse,
} from '@/lib/auth-helpers';
import { DEFAULT_LOW_STOCK_THRESHOLDS } from '@/lib/constants';
import type { LowStockThresholds } from '@/lib/types';

import { isSuperAdmin } from '@/lib/city-scope';

export async function GET() {
  const { manager, error } = await getAuthenticatedManager();
  if (!manager) return unauthorizedResponse(error ?? undefined);

  const admin = createAdminClient();

  let managersQuery = admin
    .from('managers')
    .select('id, name, email, created_at, role, city_id, cities(id, name)')
    .order('created_at');

  if (!isSuperAdmin(manager)) {
    managersQuery = managersQuery.eq('id', manager.id);
  }

  const [pricesRes, settingsRes, managersRes, productsRes, citiesRes] = await Promise.all([
    admin
      .from('price_history')
      .select('*, product_types(name)')
      .order('effective_from', { ascending: false }),
    admin.from('app_settings').select('*'),
    managersQuery,
    admin.from('product_types').select('*').order('name'),
    admin.from('cities').select('id, name').order('name'),
  ]);

  const thresholdsSetting = settingsRes.data?.find(
    (s) => s.setting_key === 'low_stock_thresholds'
  );

  return NextResponse.json({
    prices: pricesRes.data ?? [],
    thresholds:
      (thresholdsSetting?.setting_value as LowStockThresholds) ??
      DEFAULT_LOW_STOCK_THRESHOLDS,
    managers: managersRes.data ?? [],
    products: productsRes.data ?? [],
    cities: citiesRes.data ?? [],
    isSuperAdmin: isSuperAdmin(manager),
  });
}

export async function POST(request: Request) {
  const { manager, error } = await getAuthenticatedManager();
  if (!manager) return unauthorizedResponse(error ?? undefined);

  const body = await request.json();
  const admin = createAdminClient();

  if (body.type === 'price') {
    const { productTypeId, price, effectiveFrom } = body;
    if (!productTypeId || price == null || price < 0) {
      return badRequestResponse('Valid product and price required');
    }

    const { data, error: dbError } = await admin
      .from('price_history')
      .insert({
        product_type_id: productTypeId,
        price,
        effective_from: effectiveFrom ?? new Date().toISOString(),
        set_by: manager.id,
      })
      .select()
      .single();

    if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
    return NextResponse.json({ price: data });
  }

  if (body.type === 'thresholds') {
    const { thresholds } = body;
    const { error: dbError } = await admin.from('app_settings').upsert(
      {
        setting_key: 'low_stock_thresholds',
        setting_value: thresholds,
        updated_by: manager.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'setting_key' }
    );

    if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (body.type === 'pack_size') {
    const { productTypeId, packSize } = body;
    if (!Number.isInteger(packSize) || packSize <= 0) {
      return badRequestResponse('Pack size must be a positive whole number');
    }

    const { error: dbError } = await admin
      .from('product_types')
      .update({ pack_size: packSize })
      .eq('id', productTypeId);

    if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  return badRequestResponse('Invalid settings type');
}
