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
import { todayISO, formatDisplayDate } from '@/lib/date-utils';

export async function GET(request: Request) {
  const { manager, error } = await getAuthenticatedManager();
  if (!manager) return unauthorizedResponse(error ?? undefined);

  const { cityIds, cityIdParam } = getCityFilterFromRequest(request, manager);
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date') ?? todayISO();

  const admin = createAdminClient();
  const { data: products } = await admin.from('product_types').select('*').order('name');
  const { data: cities } = await admin.from('cities').select('id, name').order('name');

  let productionQuery = admin.from('daily_production').select('*').eq('date', date);
  productionQuery = applyCityFilter(productionQuery, cityIds);

  let settlementsQuery = admin
    .from('settlements')
    .select('*, dispatches!inner(dispatched_at, driver_id, product_type_id, quantity_taken, city_id, drivers(name), product_types(name))')
    .gte('settled_at', `${date}T00:00:00`)
    .lte('settled_at', `${date}T23:59:59`);
  settlementsQuery = applyCityFilter(settlementsQuery, cityIds);

  let stockQuery = admin.from('stock_ledger').select('*, product_types(name), city_id');
  stockQuery = applyCityFilter(stockQuery, cityIds);

  let factorySalesQuery = admin
    .from('factory_sales')
    .select('id, city_id, amount_paid')
    .eq('sale_date', date);
  factorySalesQuery = applyCityFilter(factorySalesQuery, cityIds);

  let factoryUseQuery = admin
    .from('factory_use')
    .select('id, city_id')
    .eq('use_date', date);
  factoryUseQuery = applyCityFilter(factoryUseQuery, cityIds);

  const [productionRes, settlementsRes, stockRes, factorySalesRes, factoryUseRes] = await Promise.all([
    productionQuery,
    settlementsQuery,
    stockQuery,
    factorySalesQuery,
    factoryUseQuery,
  ]);

  const factorySaleIds = (factorySalesRes.data ?? []).map((s) => s.id);
  const factoryUseIds = (factoryUseRes.data ?? []).map((u) => u.id);
  let factoryItems: { product_type_id: string; quantity: number; subtotal: number | string }[] = [];
  if (factorySaleIds.length > 0) {
    const { data } = await admin
      .from('factory_sale_items')
      .select('product_type_id, quantity, subtotal')
      .in('factory_sale_id', factorySaleIds);
    factoryItems = (data ?? []) as { product_type_id: string; quantity: number; subtotal: number | string }[];
  }

  const factorySalesCount = factorySaleIds.length;
  const factorySalesRevenue = (factorySalesRes.data ?? []).reduce(
    (sum, s) => sum + Number(s.amount_paid),
    0
  );
  const factorySalesByProduct = (products ?? []).map((product) => {
    const rows = factoryItems.filter((i) => i.product_type_id === product.id);
    return {
      product: product.name,
      quantity: rows.reduce((s, r) => s + r.quantity, 0),
      revenue: rows.reduce((s, r) => s + Number(r.subtotal), 0),
    };
  });

  let factoryUseItems: { product_type_id: string; quantity: number }[] = [];
  if (factoryUseIds.length > 0) {
    const { data } = await admin
      .from('factory_use_items')
      .select('product_type_id, quantity')
      .in('factory_use_id', factoryUseIds);
    factoryUseItems = (data ?? []) as { product_type_id: string; quantity: number }[];
  }

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

  const factoryUseCount = factoryUseIds.length;
  const factoryUseByProduct = (products ?? []).map((product) => {
    const rows = factoryUseItems.filter((i) => i.product_type_id === product.id);
    const quantity = rows.reduce((s, r) => s + r.quantity, 0);
    const price = priceMap[product.id] ?? 0;
    return {
      product: product.name,
      quantity,
      equivalent_value: quantity * price,
    };
  });
  const totalEquivalentValue = factoryUseByProduct.reduce((s, r) => s + r.equivalent_value, 0);

  const lines: string[] = [];
  lines.push(`Today's Summary - ${formatDisplayDate(date)}`);
  if (isSuperAdmin(manager) && cityIdParam === 'both') {
    lines.push('(All cities combined)');
  }
  lines.push('');

  const buildProductLines = (
    cityFilter: string | null,
    cityLabel: string
  ) => {
    if (cityLabel) lines.push(`--- ${cityLabel} ---`);
    for (const product of products ?? []) {
      if (product.is_daily_cycle) {
        const totalProduced = (productionRes.data ?? [])
          .filter((p) => p.product_type_id === product.id && (!cityFilter || p.city_id === cityFilter))
          .reduce((sum, p) => sum + p.quantity_produced, 0);
        const sold = (settlementsRes.data ?? [])
          .filter((s) => {
            const d = s.dispatches as { product_type_id: string; city_id?: string };
            return d.product_type_id === product.id && (!cityFilter || d.city_id === cityFilter);
          })
          .reduce((sum, s) => sum + s.quantity_sold, 0);
        const stock = stockRes.data?.find(
          (s) => s.product_type_id === product.id && (!cityFilter || s.city_id === cityFilter)
        );
        lines.push(
          ` ${product.name}: Produced ${totalProduced}, Sold ${sold}, Remaining ${stock?.current_quantity ?? 0}`
        );
      } else {
        const sold = (settlementsRes.data ?? [])
          .filter((s) => {
            const d = s.dispatches as { product_type_id: string; city_id?: string };
            return d.product_type_id === product.id && (!cityFilter || d.city_id === cityFilter);
          })
          .reduce((sum, s) => sum + s.quantity_sold, 0);
        lines.push(` ${product.name}: ${sold} packs sold`);
      }
    }
    lines.push('');
  };

  if (isSuperAdmin(manager) && cityIdParam === 'both') {
    for (const city of cities ?? []) {
      buildProductLines(city.id, city.name);
    }
  } else {
    buildProductLines(null, '');
  }

  lines.push(' ---');

  const driverSettlements: Record<
    string,
    { name: string; sold: number; taken: number; product: string }
  > = {};

  for (const s of settlementsRes.data ?? []) {
    const d = s.dispatches as {
      driver_id: string;
      quantity_taken: number;
      drivers: { name: string };
      product_types: { name: string };
    };
    const key = `${d.driver_id}-${d.product_types.name}`;
    if (!driverSettlements[key]) {
      driverSettlements[key] = {
        name: d.drivers.name,
        sold: 0,
        taken: d.quantity_taken,
        product: d.product_types.name,
      };
    }
    driverSettlements[key].sold += s.quantity_sold;
  }

  for (const entry of Object.values(driverSettlements)) {
    const unit = entry.product === '20L' ? '' : ' packs';
    lines.push(` Driver ${entry.name}: Sold ${entry.sold}/${entry.taken} (${entry.product}${unit})`);
  }

  lines.push('');
  lines.push(
    `Factory Sales: ${factorySalesCount} sales, $${factorySalesRevenue.toFixed(2)} total`
  );
  for (const row of factorySalesByProduct) {
    if (row.quantity > 0) {
      const unit = row.product === '20L' ? 'bottles' : 'packs';
      lines.push(` ${row.product}: ${row.quantity} ${unit}, $${row.revenue.toFixed(2)}`);
    }
  }

  if (factoryUseCount > 0) {
    lines.push('');
    lines.push('Internal Use:');
    for (const row of factoryUseByProduct) {
      if (row.quantity > 0) {
        const unit = row.product === '20L' ? 'bottles' : 'packs';
        lines.push(` ${row.product}: ${row.quantity} ${unit}`);
      }
    }
  }

  const text = lines.join('\n');
  return NextResponse.json({
    text,
    date,
    factory_sales_count: factorySalesCount,
    factory_sales_revenue: factorySalesRevenue,
    factory_sales_by_product: factorySalesByProduct,
    factory_use_count: factoryUseCount,
    factory_use_by_product: factoryUseByProduct,
    total_equivalent_value: totalEquivalentValue,
  });
}
