import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getAuthenticatedManager,
  unauthorizedResponse,
  serverErrorResponse,
} from '@/lib/auth-helpers';
import {
  applyCityFilter,
  getCityFilterFromRequest,
  isSuperAdmin,
} from '@/lib/city-scope';
import { todayISO } from '@/lib/date-utils';
import { DEFAULT_LOW_STOCK_THRESHOLDS } from '@/lib/constants';
import type { CityDashboardSnapshot, DriverStatus, LowStockThresholds } from '@/lib/types';

async function buildCitySnapshot(
  admin: ReturnType<typeof createAdminClient>,
  cityId: string,
  cityName: string,
  today: string
): Promise<CityDashboardSnapshot> {
  const { data: products } = await admin.from('product_types').select('id, name');
  const product20L = products?.find((p) => p.name === '20L');

  let stock20L = 0;
  if (product20L) {
    const { data: stock } = await admin
      .from('stock_ledger')
      .select('current_quantity')
      .eq('city_id', cityId)
      .eq('product_type_id', product20L.id)
      .single();
    stock20L = stock?.current_quantity ?? 0;
  }

  const { data: settlements } = await admin
    .from('settlements')
    .select('quantity_sold')
    .eq('city_id', cityId)
    .gte('settled_at', `${today}T00:00:00`)
    .lte('settled_at', `${today}T23:59:59`);

  const soldToday = (settlements ?? []).reduce((s, r) => s + r.quantity_sold, 0);

  const { data: outDispatches } = await admin
    .from('dispatches')
    .select('driver_id')
    .eq('city_id', cityId)
    .eq('status', 'out')
    .gte('dispatched_at', `${today}T00:00:00`)
    .lte('dispatched_at', `${today}T23:59:59`);

  const driversStillOut = new Set((outDispatches ?? []).map((d) => d.driver_id)).size;

  return { cityId, cityName, stock20L, soldToday, driversStillOut };
}

export async function GET(request: Request) {
  const { manager, error } = await getAuthenticatedManager();
  if (!manager) return unauthorizedResponse(error ?? undefined);

  const { cityIds } = getCityFilterFromRequest(request, manager);
  const admin = createAdminClient();
  const today = todayISO();

  const { data: allCities } = await admin.from('cities').select('id, name').order('name');

  let cityComparison: CityDashboardSnapshot[] | undefined;
  if (isSuperAdmin(manager)) {
    cityComparison = await Promise.all(
      (allCities ?? []).map((c) => buildCitySnapshot(admin, c.id, c.name, today))
    );
  }

  let stockQuery = admin.from('stock_ledger').select('*, product_types(*)');
  stockQuery = applyCityFilter(stockQuery, cityIds);

  let driversQuery = admin.from('drivers').select('*').eq('status', 'active').order('name');
  driversQuery = applyCityFilter(driversQuery, cityIds);

  let dispatchesQuery = admin
    .from('dispatches')
    .select('*, product_types(*)')
    .gte('dispatched_at', `${today}T00:00:00`)
    .lte('dispatched_at', `${today}T23:59:59`);
  dispatchesQuery = applyCityFilter(dispatchesQuery, cityIds);

  let productionQuery = admin.from('daily_production').select('*').eq('date', today);
  productionQuery = applyCityFilter(productionQuery, cityIds);

  let factorySalesQuery = admin
    .from('factory_sales')
    .select('id')
    .eq('sale_date', today);
  factorySalesQuery = applyCityFilter(factorySalesQuery, cityIds);

  let factoryUseQuery = admin
    .from('factory_use')
    .select('id')
    .eq('use_date', today);
  factoryUseQuery = applyCityFilter(factoryUseQuery, cityIds);

  const [stockRes, driversRes, dispatchesRes, settingsRes, productionRes, factorySalesRes, factoryUseRes] =
    await Promise.all([
      stockQuery,
      driversQuery,
      dispatchesQuery,
      admin
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', 'low_stock_thresholds')
        .single(),
      productionQuery,
      factorySalesQuery,
      factoryUseQuery,
    ]);

  if (stockRes.error) return serverErrorResponse(stockRes.error.message);

  const todayDispatches = dispatchesRes.data ?? [];
  const saleIds = (factorySalesRes.data ?? []).map((s) => s.id);
  const useIds = (factoryUseRes.data ?? []).map((u) => u.id);

  const soldFactoryMap: Record<string, number> = {};
  const usedInternallyMap: Record<string, number> = {};
  const dispatchedMap: Record<string, number> = {};

  if (saleIds.length > 0) {
    const { data: saleItems } = await admin
      .from('factory_sale_items')
      .select('product_type_id, quantity')
      .in('factory_sale_id', saleIds);
    for (const row of saleItems ?? []) {
      soldFactoryMap[row.product_type_id] =
        (soldFactoryMap[row.product_type_id] ?? 0) + row.quantity;
    }
  }

  if (useIds.length > 0) {
    const { data: useItems } = await admin
      .from('factory_use_items')
      .select('product_type_id, quantity')
      .in('factory_use_id', useIds);
    for (const row of useItems ?? []) {
      usedInternallyMap[row.product_type_id] =
        (usedInternallyMap[row.product_type_id] ?? 0) + row.quantity;
    }
  }

  for (const d of todayDispatches) {
    dispatchedMap[d.product_type_id] =
      (dispatchedMap[d.product_type_id] ?? 0) + (d.quantity_taken as number);
  }

  const thresholds: LowStockThresholds =
    (settingsRes.data?.setting_value as LowStockThresholds) ?? DEFAULT_LOW_STOCK_THRESHOLDS;

  const stockCards = (stockRes.data ?? []).map((item) => {
    const product = item.product_types as { name: string; unit_type: string };
    const threshold = thresholds[product.name as keyof LowStockThresholds] ?? 0;
    const productId = item.product_type_id as string;
    return {
      productName: product.name,
      unitType: product.unit_type,
      quantity: item.current_quantity,
      threshold,
      isLow: item.current_quantity < threshold,
      breakdown: {
        usedInternallyToday: usedInternallyMap[productId] ?? 0,
        soldFactoryToday: soldFactoryMap[productId] ?? 0,
        dispatchedToday: dispatchedMap[productId] ?? 0,
      },
    };
  });

  const driverStatuses: DriverStatus[] = (driversRes.data ?? []).map((driver) => {
    const driverDispatches = todayDispatches.filter((d) => d.driver_id === driver.id);
    const outDispatches = driverDispatches.filter((d) => d.status === 'out');

    let status: DriverStatus['status'] = 'did_not_go';
    if (driverDispatches.length > 0) {
      status = outDispatches.length > 0 ? 'still_out' : 'settled';
    }

    return {
      driver,
      status,
      outDispatches: outDispatches as DriverStatus['outDispatches'],
    };
  });

  return NextResponse.json({
    stockCards,
    driverStatuses,
    todayProduction: productionRes.data ?? [],
    isSuperAdmin: isSuperAdmin(manager),
    cityComparison,
  });
}
