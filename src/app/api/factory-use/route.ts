import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getAuthenticatedManager,
  unauthorizedResponse,
  badRequestResponse,
} from '@/lib/auth-helpers';
import {
  applyCityFilter,
  getCityFilterFromRequest,
  writeCityFromBody,
  CityAccessDeniedError,
} from '@/lib/city-scope';
import { ensureStockLedgerForCity } from '@/lib/ensure-stock-ledger';
import { todayISO } from '@/lib/date-utils';
import { summarizeUseItems } from '@/lib/factory-sales-summary';

function cityScopeError(e: unknown) {
  if (e instanceof CityAccessDeniedError) {
    return NextResponse.json({ error: e.message }, { status: 403 });
  }
  return badRequestResponse(e instanceof Error ? e.message : 'City required');
}

async function fetchUseById(admin: ReturnType<typeof createAdminClient>, useId: string) {
  const { data: use, error } = await admin
    .from('factory_use')
    .select('*, cities(name), managers(name)')
    .eq('id', useId)
    .single();

  if (error || !use) return null;

  const { data: items } = await admin
    .from('factory_use_items')
    .select('*, product_types(name, unit_type)')
    .eq('factory_use_id', useId);

  return { ...use, items: items ?? [] };
}

export async function GET(request: Request) {
  const { manager, error } = await getAuthenticatedManager();
  if (!manager) return unauthorizedResponse(error ?? undefined);

  let cityIds;
  try {
    ({ cityIds } = getCityFilterFromRequest(request, manager));
  } catch (e) {
    return cityScopeError(e);
  }

  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date') ?? todayISO();

  const admin = createAdminClient();

  let useQuery = admin
    .from('factory_use')
    .select('*, factory_use_items(quantity, product_types(name, unit_type))')
    .eq('use_date', date)
    .order('use_time', { ascending: false });
  useQuery = applyCityFilter(useQuery, cityIds);

  const { data: uses } = await useQuery;

  const entries = (uses ?? []).map((entry) => ({
    id: entry.id,
    use_time: entry.use_time,
    use_date: entry.use_date,
    note: entry.note,
    itemsSummary: summarizeUseItems(
      (entry.factory_use_items ?? []) as {
        quantity: number;
        product_types: { name: string; unit_type: string };
      }[]
    ),
  }));

  return NextResponse.json({ entries, date });
}

export async function POST(request: Request) {
  const { manager, error } = await getAuthenticatedManager();
  if (!manager) return unauthorizedResponse(error ?? undefined);

  const body = await request.json();
  const { items, note, cityId: bodyCityId } = body;

  if (!Array.isArray(items) || items.length === 0) {
    return badRequestResponse('At least one item is required');
  }

  let cityId: string;
  try {
    cityId = writeCityFromBody(manager, bodyCityId ?? new URL(request.url).searchParams.get('cityId'));
  } catch (e) {
    return cityScopeError(e);
  }

  const admin = createAdminClient();
  await ensureStockLedgerForCity(admin, cityId);

  const rpcItems = items.map((item: { product_type_id: string; quantity: number }) => ({
    product_type_id: item.product_type_id,
    quantity: item.quantity,
  }));

  const { data: rpcResult, error: rpcError } = await admin.rpc('record_factory_use', {
    p_items: rpcItems,
    p_note: note ?? null,
    p_manager_id: manager.id,
    p_city_id: cityId,
  });

  if (rpcError) return badRequestResponse(rpcError.message);

  const useId = (rpcResult as { use_id: string }).use_id;
  const useRecord = await fetchUseById(admin, useId);
  if (!useRecord) {
    return NextResponse.json({ success: true, useId });
  }

  return NextResponse.json({ success: true, use: useRecord });
}
