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

export async function GET(request: Request) {
  const { manager, error } = await getAuthenticatedManager();
  if (!manager) return unauthorizedResponse(error ?? undefined);

  const { cityIds } = getCityFilterFromRequest(request, manager);
  const { searchParams } = new URL(request.url);
  const driverId = searchParams.get('driverId');
  const status = searchParams.get('status');

  const admin = createAdminClient();
  let query = admin
    .from('dispatches')
    .select('*, drivers(*), product_types(*)')
    .order('dispatched_at', { ascending: false });

  query = applyCityFilter(query, cityIds);
  if (driverId) query = query.eq('driver_id', driverId);
  if (status) query = query.eq('status', status);

  const { data, error: dbError } = await query;
  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json({ dispatches: data });
}

export async function POST(request: Request) {
  const { manager, error } = await getAuthenticatedManager();
  if (!manager) return unauthorizedResponse(error ?? undefined);

  const { driverId, productTypeId, quantity, cityId: bodyCityId } = await request.json();

  if (!Number.isInteger(quantity) || quantity <= 0) {
    return badRequestResponse('Quantity must be a positive whole number');
  }

  let cityId: string;
  try {
    cityId = writeCityFromBody(
      manager,
      bodyCityId ?? new URL(request.url).searchParams.get('cityId')
    );
  } catch (e) {
    if (e instanceof CityAccessDeniedError) return forbiddenResponse(e.message);
    return badRequestResponse(e instanceof Error ? e.message : 'City required');
  }

  const admin = createAdminClient();
  await ensureStockLedgerForCity(admin, cityId);
  const { data: dispatchId, error: rpcError } = await admin.rpc('create_dispatch', {
    p_driver_id: driverId,
    p_product_type_id: productTypeId,
    p_quantity: quantity,
    p_manager_id: manager.id,
    p_city_id: cityId,
  });

  if (rpcError) return badRequestResponse(rpcError.message);

  const { data: dispatch } = await admin
    .from('dispatches')
    .select('*, drivers(*), product_types(*)')
    .eq('id', dispatchId)
    .single();

  return NextResponse.json({ dispatch });
}

export async function PATCH(request: Request) {
  const { manager, error } = await getAuthenticatedManager();
  if (!manager) return unauthorizedResponse(error ?? undefined);

  const { id, quantityTaken, reason } = await request.json();
  if (!reason?.trim()) return badRequestResponse('Reason is required for edits');

  const admin = createAdminClient();
  const { error: rpcError } = await admin.rpc('edit_dispatch', {
    p_id: id,
    p_quantity_taken: quantityTaken,
    p_reason: reason,
    p_manager_id: manager.id,
  });

  if (rpcError) return badRequestResponse(rpcError.message);
  return NextResponse.json({ success: true });
}
