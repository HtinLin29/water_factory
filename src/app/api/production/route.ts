import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getAuthenticatedManager,
  unauthorizedResponse,
  badRequestResponse,
  forbiddenResponse,
} from '@/lib/auth-helpers';
import {
  applyCityFilter,
  getCityFilterFromRequest,
  writeCityFromBody,
  CityAccessDeniedError,
} from '@/lib/city-scope';
import { ensureStockLedgerForCity } from '@/lib/ensure-stock-ledger';
import { todayISO } from '@/lib/date-utils';

function cityScopeErrorResponse(e: unknown) {
  if (e instanceof CityAccessDeniedError) {
    return forbiddenResponse(e.message);
  }
  return badRequestResponse(e instanceof Error ? e.message : 'City required');
}

export async function GET(request: Request) {
  const { manager, error } = await getAuthenticatedManager();
  if (!manager) return unauthorizedResponse(error ?? undefined);

  let cityIds;
  try {
    ({ cityIds } = getCityFilterFromRequest(request, manager));
  } catch (e) {
    return cityScopeErrorResponse(e);
  }
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date') ?? todayISO();

  const admin = createAdminClient();

  let stockQuery = admin.from('stock_ledger').select('*, product_types(*)');
  stockQuery = applyCityFilter(stockQuery, cityIds);

  let productionQuery = admin
    .from('daily_production')
    .select('*')
    .eq('date', date)
    .order('created_at', { ascending: true });
  productionQuery = applyCityFilter(productionQuery, cityIds);

  const [stockRes, productsRes, productionRes] = await Promise.all([
    stockQuery,
    admin.from('product_types').select('*').order('name'),
    productionQuery,
  ]);

  return NextResponse.json({
    stock: stockRes.data ?? [],
    products: productsRes.data ?? [],
    production: productionRes.data ?? [],
    date,
  });
}

export async function POST(request: Request) {
  const { manager, error } = await getAuthenticatedManager();
  if (!manager) return unauthorizedResponse(error ?? undefined);

  const body = await request.json();
  const { type, productTypeId, quantity, date, cityId: bodyCityId } = body;

  let cityId: string;
  try {
    cityId = writeCityFromBody(manager, bodyCityId ?? new URL(request.url).searchParams.get('cityId'));
  } catch (e) {
    return cityScopeErrorResponse(e);
  }

  const admin = createAdminClient();
  await ensureStockLedgerForCity(admin, cityId);

  if (type === 'daily_production') {
    const prodDate = date ?? todayISO();
    const { data, error: rpcError } = await admin.rpc('record_daily_production', {
      p_date: prodDate,
      p_product_type_id: productTypeId,
      p_quantity_produced: quantity,
      p_manager_id: manager.id,
      p_city_id: cityId,
    });

    if (rpcError) return badRequestResponse(rpcError.message);
    return NextResponse.json({ success: true, data });
  }

  if (type === 'pack_restock') {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return badRequestResponse('Packs must be a positive whole number');
    }

    const { data, error: rpcError } = await admin.rpc('record_pack_restock', {
      p_product_type_id: productTypeId,
      p_packs_added: quantity,
      p_manager_id: manager.id,
      p_city_id: cityId,
    });

    if (rpcError) return badRequestResponse(rpcError.message);
    return NextResponse.json({ success: true, data });
  }

  return badRequestResponse('Invalid production type');
}

export async function PATCH(request: Request) {
  const { manager, error } = await getAuthenticatedManager();
  if (!manager) return unauthorizedResponse(error ?? undefined);

  const body = await request.json();
  const { id, quantityProduced, reason } = body;

  if (!reason?.trim()) {
    return badRequestResponse('Reason is required for edits');
  }

  const admin = createAdminClient();
  const { error: rpcError } = await admin.rpc('edit_daily_production', {
    p_id: id,
    p_quantity_produced: quantityProduced,
    p_reason: reason,
    p_manager_id: manager.id,
  });

  if (rpcError) return badRequestResponse(rpcError.message);
  return NextResponse.json({ success: true });
}
