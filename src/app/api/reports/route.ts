import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getAuthenticatedManager,
  unauthorizedResponse,
} from '@/lib/auth-helpers';
import {
  applyCityFilter,
  getCityFilterFromRequest,
  isSuperAdmin,
} from '@/lib/city-scope';
import { todayISO, getWeekRange, getMonthRange } from '@/lib/date-utils';
import type { ReportSummary, DriverLeaderboardEntry, ProductType, FactorySalesSummary, FactorySalesTotals, FactoryUseSummary, FactoryUseTotals } from '@/lib/types';

function buildFactorySummaries(
  products: ProductType[],
  factoryItems: {
    product_type_id: string;
    quantity: number;
    subtotal: number | string;
    factory_sales?: { city_id?: string };
  }[],
  cityId?: string,
  cityName?: string
): FactorySalesSummary[] {
  return products.map((pt) => {
    const rows = factoryItems.filter((item) => {
      if (item.product_type_id !== pt.id) return false;
      if (!cityId) return true;
      const sale = item.factory_sales as { city_id?: string } | undefined;
      return sale?.city_id === cityId;
    });
    return {
      productType: pt,
      cityId,
      cityName,
      quantitySold: rows.reduce((s, r) => s + r.quantity, 0),
      revenue: rows.reduce((s, r) => s + Number(r.subtotal), 0),
    };
  });
}

function buildFactoryUseSummaries(
  products: ProductType[],
  useItems: {
    product_type_id: string;
    quantity: number;
    factory_use?: { city_id?: string };
  }[],
  priceMap: Record<string, number>,
  cityId?: string,
  cityName?: string
): FactoryUseSummary[] {
  return products.map((pt) => {
    const rows = useItems.filter((item) => {
      if (item.product_type_id !== pt.id) return false;
      if (!cityId) return true;
      const use = item.factory_use as { city_id?: string } | undefined;
      return use?.city_id === cityId;
    });
    const quantityUsed = rows.reduce((s, r) => s + r.quantity, 0);
    const price = priceMap[pt.id] ?? 0;
    return {
      productType: pt,
      cityId,
      cityName,
      quantityUsed,
      equivalentValue: quantityUsed * price,
    };
  });
}

function buildFactoryUseTotals(
  products: ProductType[],
  useItems: {
    product_type_id: string;
    quantity: number;
    factory_use_id: string;
  }[],
  priceMap: Record<string, number>
): FactoryUseTotals {
  const useIds = new Set(useItems.map((i) => i.factory_use_id));
  const byProduct = products.map((pt) => {
    const rows = useItems.filter((i) => i.product_type_id === pt.id);
    const quantity = rows.reduce((s, r) => s + r.quantity, 0);
    const price = priceMap[pt.id] ?? 0;
    return {
      product: pt.name,
      quantity,
      equivalentValue: quantity * price,
    };
  });
  return {
    useCount: useIds.size,
    totalEquivalentValue: byProduct.reduce((s, r) => s + r.equivalentValue, 0),
    byProduct,
  };
}

function buildFactoryTotals(
  products: ProductType[],
  factoryItems: {
    product_type_id: string;
    quantity: number;
    subtotal: number | string;
    factory_sale_id: string;
  }[]
): FactorySalesTotals {
  const saleIds = new Set(factoryItems.map((i) => i.factory_sale_id));
  return {
    salesCount: saleIds.size,
    totalRevenue: factoryItems.reduce((s, r) => s + Number(r.subtotal), 0),
    byProduct: products.map((pt) => {
      const rows = factoryItems.filter((i) => i.product_type_id === pt.id);
      return {
        product: pt.name,
        quantity: rows.reduce((s, r) => s + r.quantity, 0),
        revenue: rows.reduce((s, r) => s + Number(r.subtotal), 0),
      };
    }),
  };
}

function buildSummaries(
  products: ProductType[],
  productionData: Record<string, unknown>[],
  restockData: Record<string, unknown>[],
  dispatchesData: Record<string, unknown>[],
  settlementsData: Record<string, unknown>[],
  cityId?: string,
  cityName?: string
): ReportSummary[] {
  return products.map((pt) => {
    const produced = productionData
      .filter((p) => p.product_type_id === pt.id)
      .reduce((s, p) => s + (p.quantity_produced as number), 0);

    const restocked = restockData
      .filter((r) => r.product_type_id === pt.id)
      .reduce((s, r) => s + (r.packs_added as number), 0);

    const dispatched = dispatchesData
      .filter((d) => d.product_type_id === pt.id)
      .reduce((s, d) => s + (d.quantity_taken as number), 0);

    const productSettlements = settlementsData.filter((s) => {
      const d = s.dispatches as { product_type_id: string };
      return d.product_type_id === pt.id;
    });

    const sold = productSettlements.reduce((s, st) => s + (st.quantity_sold as number), 0);
    const returned = productSettlements.reduce((s, st) => s + (st.quantity_returned as number), 0);
    const revenue = productSettlements.reduce((s, st) => s + Number(st.expected_cash), 0);
    const discrepancy = productSettlements.reduce((s, st) => s + Number(st.cash_discrepancy), 0);

    return {
      productType: pt,
      cityId,
      cityName,
      totalProduced: pt.is_daily_cycle ? produced : restocked,
      totalDispatched: dispatched,
      totalSold: sold,
      totalReturned: returned,
      totalRevenue: revenue,
      totalCashDiscrepancy: discrepancy,
    };
  });
}

export async function GET(request: Request) {
  const { manager, error } = await getAuthenticatedManager();
  if (!manager) return unauthorizedResponse(error ?? undefined);

  const { cityIds, cityIdParam } = getCityFilterFromRequest(request, manager);
  const { searchParams } = new URL(request.url);
  let startDate = searchParams.get('startDate') ?? todayISO();
  let endDate = searchParams.get('endDate') ?? todayISO();
  const leaderboardPeriod = searchParams.get('leaderboard') ?? 'week';

  if (searchParams.get('period') === 'week') {
    const range = getWeekRange();
    startDate = range.start;
    endDate = range.end;
  } else if (searchParams.get('period') === 'month') {
    const range = getMonthRange();
    startDate = range.start;
    endDate = range.end;
  }

  const admin = createAdminClient();
  const { data: products } = await admin.from('product_types').select('*');
  const productList = (products ?? []) as ProductType[];
  const productMap = new Map(productList.map((p) => [p.id, p]));

  const { data: priceRows } = await admin
    .from('price_history')
    .select('product_type_id, price, effective_from')
    .order('effective_from', { ascending: false });
  const priceMap: Record<string, number> = {};
  const seenPrices = new Set<string>();
  for (const p of priceRows ?? []) {
    if (!seenPrices.has(p.product_type_id)) {
      priceMap[p.product_type_id] = Number(p.price);
      seenPrices.add(p.product_type_id);
    }
  }

  const fetchRangeData = async (filterCityIds: string[] | null) => {
    let productionQuery = admin
      .from('daily_production')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate);
    productionQuery = applyCityFilter(productionQuery, filterCityIds);

    let restockQuery = admin
      .from('pack_restocks')
      .select('*')
      .gte('created_at', `${startDate}T00:00:00`)
      .lte('created_at', `${endDate}T23:59:59`);
    restockQuery = applyCityFilter(restockQuery, filterCityIds);

    let dispatchesQuery = admin
      .from('dispatches')
      .select('*, settlements(*)')
      .gte('dispatched_at', `${startDate}T00:00:00`)
      .lte('dispatched_at', `${endDate}T23:59:59`);
    dispatchesQuery = applyCityFilter(dispatchesQuery, filterCityIds);

    let settlementsQuery = admin
      .from('settlements')
      .select('*, dispatches!inner(dispatched_at, driver_id, product_type_id, city_id)')
      .gte('settled_at', `${startDate}T00:00:00`)
      .lte('settled_at', `${endDate}T23:59:59`);
    settlementsQuery = applyCityFilter(settlementsQuery, filterCityIds);

    let factorySalesQuery = admin
      .from('factory_sales')
      .select('id, city_id, sale_date')
      .gte('sale_date', startDate)
      .lte('sale_date', endDate);
    factorySalesQuery = applyCityFilter(factorySalesQuery, filterCityIds);

    let factoryUseQuery = admin
      .from('factory_use')
      .select('id, city_id, use_date')
      .gte('use_date', startDate)
      .lte('use_date', endDate);
    factoryUseQuery = applyCityFilter(factoryUseQuery, filterCityIds);

    const [productionRes, restockRes, dispatchesRes, settlementsRes, factorySalesRes, factoryUseRes] =
      await Promise.all([
        productionQuery,
        restockQuery,
        dispatchesQuery,
        settlementsQuery,
        factorySalesQuery,
        factoryUseQuery,
      ]);

    const saleIds = (factorySalesRes.data ?? []).map((s) => s.id);
    const useIds = (factoryUseRes.data ?? []).map((u) => u.id);
    let factoryItems: {
      product_type_id: string;
      quantity: number;
      subtotal: number | string;
      factory_sale_id: string;
      factory_sales?: { city_id?: string };
    }[] = [];

    if (saleIds.length > 0) {
      const { data: items } = await admin
        .from('factory_sale_items')
        .select('product_type_id, quantity, subtotal, factory_sale_id, factory_sales(city_id)')
        .in('factory_sale_id', saleIds);
      factoryItems = (items ?? []).map((item) => {
        const saleJoin = item.factory_sales as { city_id?: string } | { city_id?: string }[] | null;
        return {
          product_type_id: item.product_type_id as string,
          quantity: item.quantity as number,
          subtotal: item.subtotal as number | string,
          factory_sale_id: item.factory_sale_id as string,
          factory_sales: Array.isArray(saleJoin) ? saleJoin[0] : saleJoin ?? undefined,
        };
      });
    }

    let factoryUseItems: {
      product_type_id: string;
      quantity: number;
      factory_use_id: string;
      factory_use?: { city_id?: string };
    }[] = [];

    if (useIds.length > 0) {
      const { data: useItemRows } = await admin
        .from('factory_use_items')
        .select('product_type_id, quantity, factory_use_id, factory_use(city_id)')
        .in('factory_use_id', useIds);
      factoryUseItems = (useItemRows ?? []).map((item) => {
        const useJoin = item.factory_use as { city_id?: string } | { city_id?: string }[] | null;
        return {
          product_type_id: item.product_type_id as string,
          quantity: item.quantity as number,
          factory_use_id: item.factory_use_id as string,
          factory_use: Array.isArray(useJoin) ? useJoin[0] : useJoin ?? undefined,
        };
      });
    }

    return {
      production: productionRes.data ?? [],
      restocks: restockRes.data ?? [],
      dispatches: dispatchesRes.data ?? [],
      settlements: settlementsRes.data ?? [],
      factoryItems,
      factoryUseItems,
    };
  };

  let summaries: ReportSummary[];
  let summariesByCity: ReportSummary[] | undefined;
  let factorySummaries: FactorySalesSummary[];
  let factorySummariesByCity: FactorySalesSummary[] | undefined;
  let factoryTotals: FactorySalesTotals;
  let factoryUseSummaries: FactoryUseSummary[];
  let factoryUseTotals: FactoryUseTotals;

  if (isSuperAdmin(manager) && cityIdParam === 'both') {
    const { data: cities } = await admin.from('cities').select('id, name').order('name');
    const combined = await fetchRangeData(null);
    summaries = buildSummaries(
      productList,
      combined.production,
      combined.restocks,
      combined.dispatches,
      combined.settlements
    );
    factorySummaries = buildFactorySummaries(productList, combined.factoryItems);
    factoryTotals = buildFactoryTotals(productList, combined.factoryItems);
    factoryUseSummaries = buildFactoryUseSummaries(productList, combined.factoryUseItems, priceMap);
    factoryUseTotals = buildFactoryUseTotals(productList, combined.factoryUseItems, priceMap);

    summariesByCity = [];
    factorySummariesByCity = [];
    for (const city of cities ?? []) {
      const cityData = {
        production: combined.production.filter((p) => p.city_id === city.id),
        restocks: combined.restocks.filter((r) => r.city_id === city.id),
        dispatches: combined.dispatches.filter((d) => d.city_id === city.id),
        settlements: combined.settlements.filter((s) => s.city_id === city.id),
      };
      summariesByCity.push(
        ...buildSummaries(
          productList,
          cityData.production,
          cityData.restocks,
          cityData.dispatches,
          cityData.settlements,
          city.id,
          city.name
        )
      );
      factorySummariesByCity.push(
        ...buildFactorySummaries(
          productList,
          combined.factoryItems,
          city.id,
          city.name
        )
      );
    }
  } else {
    const data = await fetchRangeData(cityIds);
    summaries = buildSummaries(
      productList,
      data.production,
      data.restocks,
      data.dispatches,
      data.settlements
    );
    factorySummaries = buildFactorySummaries(productList, data.factoryItems);
    factoryTotals = buildFactoryTotals(productList, data.factoryItems);
    factoryUseSummaries = buildFactoryUseSummaries(productList, data.factoryUseItems, priceMap);
    factoryUseTotals = buildFactoryUseTotals(productList, data.factoryUseItems, priceMap);
  }

  let lbStart = startDate;
  let lbEnd = endDate;
  if (leaderboardPeriod === 'week') {
    const range = getWeekRange();
    lbStart = range.start;
    lbEnd = range.end;
  } else if (leaderboardPeriod === 'month') {
    const range = getMonthRange();
    lbStart = range.start;
    lbEnd = range.end;
  }

  let lbQuery = admin
    .from('settlements')
    .select('quantity_sold, city_id, dispatches!inner(driver_id, product_type_id, drivers(id, name))')
    .gte('settled_at', `${lbStart}T00:00:00`)
    .lte('settled_at', `${lbEnd}T23:59:59`);
  lbQuery = applyCityFilter(lbQuery, cityIds);

  const { data: lbSettlements } = await lbQuery;

  const driverTotals: Record<string, DriverLeaderboardEntry> = {};
  for (const s of lbSettlements ?? []) {
    const d = s.dispatches as unknown as {
      driver_id: string;
      product_type_id: string;
      drivers: { id: string; name: string; status: string };
    };
    if (!driverTotals[d.driver_id]) {
      driverTotals[d.driver_id] = {
        driver: {
          id: d.drivers.id,
          name: d.drivers.name,
          status: d.drivers.status as 'active' | 'inactive',
          created_at: '',
          created_by: null,
        },
        totalSold: 0,
        byProduct: {},
      };
    }
    driverTotals[d.driver_id].totalSold += s.quantity_sold;
    const pName = productMap.get(d.product_type_id)?.name ?? 'Unknown';
    driverTotals[d.driver_id].byProduct[pName] =
      (driverTotals[d.driver_id].byProduct[pName] ?? 0) + s.quantity_sold;
  }

  const leaderboard = Object.values(driverTotals).sort((a, b) => b.totalSold - a.totalSold);

  return NextResponse.json({
    summaries,
    summariesByCity,
    factorySummaries,
    factorySummariesByCity,
    factoryTotals,
    factoryUseSummaries,
    factoryUseTotals,
    leaderboard,
    dateRange: { startDate, endDate },
    leaderboardPeriod,
    cityFilter: cityIdParam,
    combinedRevenue:
      summaries.reduce((s, r) => s + r.totalRevenue, 0) + factoryTotals.totalRevenue,
  });
}
