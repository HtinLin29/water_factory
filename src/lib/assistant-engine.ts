import { createAdminClient } from '@/lib/supabase/admin';
import { todayISO, getWeekRange, getMonthRange } from '@/lib/date-utils';

import { applyCityFilter } from '@/lib/city-scope';

interface AssistantResult {
  answer: string;
  data?: unknown;
}

export async function processAssistantQuery(
  query: string,
  cityIds: string[] | null = null
): Promise<AssistantResult> {
  const q = query.toLowerCase().trim();
  if (!q) {
    return {
      answer:
        "I can answer questions about sales, production, and driver performance. Try: 'how much sold this week'",
    };
  }

  const admin = createAdminClient();

  const { data: driversRaw } = await applyCityFilter(
    admin.from('drivers').select('id, name, city_id'),
    cityIds
  );
  const drivers: { id: string; name: string; city_id?: string }[] = driversRaw ?? [];
  const { data: products } = await admin.from('product_types').select('id, name');

  let dateStart = todayISO();
  let dateEnd = todayISO();
  let periodLabel = 'today';

  if (q.includes('week')) {
    const range = getWeekRange();
    dateStart = range.start;
    dateEnd = range.end;
    periodLabel = 'this week';
  } else if (q.includes('month')) {
    const range = getMonthRange();
    dateStart = range.start;
    dateEnd = range.end;
    periodLabel = 'this month';
  } else if (q.includes('yesterday')) {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    dateStart = d.toISOString().split('T')[0];
    dateEnd = dateStart;
    periodLabel = 'yesterday';
  }

  const matchedDriver = drivers.find((d) => q.includes(d.name.toLowerCase()));
  const matchedProduct = products?.find((p) => q.includes(p.name.toLowerCase()));

  const isFactoryUseQuery =
    q.includes('internal use') ||
    q.includes('factory use') ||
    q.includes('used internally') ||
    q.includes('internal cost') ||
    q.includes('how much used internally');

  const isFactorySalesQuery =
    q.includes('factory sales') ||
    q.includes('factory revenue') ||
    q.includes('factory today') ||
    (q.includes('factory') && (q.includes('sale') || q.includes('revenue') || q.includes('today')));

  if (isFactoryUseQuery) {
    let useDateStart = dateStart;
    let useDateEnd = dateEnd;
    if (q.includes('today')) {
      useDateStart = todayISO();
      useDateEnd = todayISO();
      periodLabel = 'today';
    }

    let useQuery = admin
      .from('factory_use')
      .select('id, use_date')
      .gte('use_date', useDateStart)
      .lte('use_date', useDateEnd);
    useQuery = applyCityFilter(useQuery, cityIds);

    const { data: uses } = await useQuery;
    const useIds = (uses ?? []).map((u) => u.id);

    let useItems: { product_type_id: string; quantity: number }[] = [];
    if (useIds.length > 0) {
      const { data: items } = await admin
        .from('factory_use_items')
        .select('product_type_id, quantity')
        .in('factory_use_id', useIds);
      useItems = items ?? [];
    }

    const totalQty = useItems.reduce((s, r) => s + r.quantity, 0);
    const useCount = useIds.length;

    if (q.includes('internal cost')) {
      const { data: priceRows } = await admin
        .from('price_history')
        .select('product_type_id, price, effective_from')
        .order('effective_from', { ascending: false });
      const priceMap: Record<string, number> = {};
      const seen = new Set<string>();
      for (const p of priceRows ?? []) {
        if (!seen.has(p.product_type_id)) {
          priceMap[p.product_type_id] = Number(p.price);
          seen.add(p.product_type_id);
        }
      }
      const equivalent = useItems.reduce(
        (sum, item) => sum + item.quantity * (priceMap[item.product_type_id] ?? 0),
        0
      );
      return {
        answer: `Internal use cost ${periodLabel}: $${equivalent.toFixed(2)} equivalent (${useCount} entries, ${totalQty} units).`,
        data: { useCount, totalQty, equivalent },
      };
    }

    const productLines = (products ?? [])
      .map((p) => {
        const qty = useItems.filter((i) => i.product_type_id === p.id).reduce((s, r) => s + r.quantity, 0);
        if (qty === 0) return null;
        const unit = p.name === '20L' ? 'bottles' : 'packs';
        return `${p.name}: ${qty} ${unit}`;
      })
      .filter(Boolean);

    return {
      answer: `Internal factory use ${periodLabel}: ${useCount} entries, ${totalQty} units total.${
        productLines.length ? `\n${productLines.join('\n')}` : ''
      }`,
      data: { useCount, totalQty, useItems },
    };
  }

  if (isFactorySalesQuery) {
    let factoryDateStart = dateStart;
    let factoryDateEnd = dateEnd;
    if (q.includes('factory today') || (q.includes('factory') && q.includes('today'))) {
      factoryDateStart = todayISO();
      factoryDateEnd = todayISO();
      periodLabel = 'today';
    }

    let salesQuery = admin
      .from('factory_sales')
      .select('id, amount_paid, sale_date')
      .gte('sale_date', factoryDateStart)
      .lte('sale_date', factoryDateEnd);
    salesQuery = applyCityFilter(salesQuery, cityIds);

    const { data: factorySales } = await salesQuery;
    const saleIds = (factorySales ?? []).map((s) => s.id);

    let factoryItems: { product_type_id: string; quantity: number; subtotal: number | string }[] =
      [];
    if (saleIds.length > 0) {
      const { data: items } = await admin
        .from('factory_sale_items')
        .select('product_type_id, quantity, subtotal')
        .in('factory_sale_id', saleIds);
      factoryItems = items ?? [];
    }

    const salesCount = saleIds.length;
    const totalRevenue = (factorySales ?? []).reduce((sum, s) => sum + Number(s.amount_paid), 0);

    if (q.includes('factory revenue') || q.includes('revenue')) {
      return {
        answer: `Factory revenue ${periodLabel}: $${totalRevenue.toFixed(2)} (${salesCount} sales).`,
        data: { salesCount, totalRevenue },
      };
    }

    const productLines = (products ?? [])
      .map((p) => {
        const rows = factoryItems.filter((i) => i.product_type_id === p.id);
        const qty = rows.reduce((s, r) => s + r.quantity, 0);
        const rev = rows.reduce((s, r) => s + Number(r.subtotal), 0);
        if (qty === 0) return null;
        const unit = p.name === '20L' ? 'bottles' : 'packs';
        return `${p.name}: ${qty} ${unit}, $${rev.toFixed(2)}`;
      })
      .filter(Boolean);

    return {
      answer: `Factory sales ${periodLabel}: ${salesCount} sales, $${totalRevenue.toFixed(2)} total.${
        productLines.length ? `\n${productLines.join('\n')}` : ''
      }`,
      data: { salesCount, totalRevenue, factoryItems },
    };
  }

  const isSalesQuery =
    q.includes('sell') || q.includes('sold') || q.includes('sales') || q.includes('revenue');
  const isProductionQuery = q.includes('produc') || q.includes('made') || q.includes('stock');
  const isDriverQuery =
    q.includes('driver') || q.includes('best') || q.includes('top') || !!matchedDriver;

  if (isSalesQuery || q.includes('revenue') || q.includes('cash')) {
    const { data: settlementsRaw } = await applyCityFilter(
      admin
        .from('settlements')
        .select('*, dispatches!inner(dispatched_at, driver_id, product_type_id, product_types(name))')
        .gte('settled_at', `${dateStart}T00:00:00`)
        .lte('settled_at', `${dateEnd}T23:59:59`),
      cityIds
    );

    let filtered: Record<string, unknown>[] = settlementsRaw ?? [];
    if (matchedDriver) {
      filtered = filtered.filter((s) => {
        const d = s.dispatches as unknown as { driver_id: string };
        return d.driver_id === matchedDriver.id;
      });
    }
    if (matchedProduct) {
      filtered = filtered.filter((s) => {
        const d = s.dispatches as unknown as { product_type_id: string };
        return d.product_type_id === matchedProduct.id;
      });
    }

    const totalSold = filtered.reduce((sum, s) => sum + (s.quantity_sold as number), 0);
    const totalRevenue = filtered.reduce(
      (sum, s) => sum + Number(s.expected_cash),
      0
    );
    const totalDiscrepancy = filtered.reduce(
      (sum, s) => sum + Number(s.cash_discrepancy),
      0
    );

    if (q.includes('revenue') || q.includes('cash')) {
      return {
        answer: `Total revenue ${periodLabel}: $${totalRevenue.toFixed(2)}. Cash discrepancy: $${totalDiscrepancy.toFixed(2)}.`,
        data: { totalRevenue, totalDiscrepancy },
      };
    }

    const productLabel = matchedProduct ? ` (${matchedProduct.name})` : '';
    const driverLabel = matchedDriver ? ` for ${matchedDriver.name}` : '';
    return {
      answer: `Total sold${productLabel}${driverLabel} ${periodLabel}: ${totalSold} units. Revenue: $${totalRevenue.toFixed(2)}.`,
      data: { totalSold, totalRevenue },
    };
  }

  if (isDriverQuery && (q.includes('best') || q.includes('top'))) {
    const { data: settlementsRaw } = await applyCityFilter(
      admin
        .from('settlements')
        .select('quantity_sold, dispatches!inner(driver_id, drivers(name))')
        .gte('settled_at', `${dateStart}T00:00:00`)
        .lte('settled_at', `${dateEnd}T23:59:59`),
      cityIds
    );

    const totals: Record<string, { name: string; sold: number }> = {};
    for (const s of settlementsRaw ?? []) {
      const d = s.dispatches as unknown as { driver_id: string; drivers: { name: string } };
      if (!totals[d.driver_id]) {
        totals[d.driver_id] = { name: d.drivers.name, sold: 0 };
      }
      totals[d.driver_id].sold += s.quantity_sold;
    }

    const ranked = Object.values(totals).sort((a, b) => b.sold - a.sold);
    if (ranked.length === 0) {
      return { answer: `No driver sales recorded ${periodLabel}.` };
    }

    const top = ranked[0];
    return {
      answer: `Best driver ${periodLabel}: ${top.name} with ${top.sold} units sold.`,
      data: ranked,
    };
  }

  if (isProductionQuery || q.includes('stock') || q.includes('how much')) {
    const { data: stockRaw } = await applyCityFilter(
      admin.from('stock_ledger').select('current_quantity, city_id, product_types(name, unit_type)'),
      cityIds
    );
    const stock: Record<string, unknown>[] = stockRaw ?? [];

    if (matchedProduct) {
      const item = stock.find((s) => {
        const pt = s.product_types as unknown as { name: string };
        return pt.name === matchedProduct.name;
      });
      const pt = item?.product_types as unknown as { name: string; unit_type: string } | undefined;
      const unit = pt?.unit_type === 'pack' ? 'packs' : 'bottles';
      return {
        answer: `Current ${matchedProduct.name} stock: ${item?.current_quantity ?? 0} ${unit}.`,
      };
    }

    const lines = stock.map((s) => {
      const pt = s.product_types as unknown as { name: string; unit_type: string };
      const unit = pt.unit_type === 'pack' ? 'packs' : 'bottles';
      return `${pt.name}: ${s.current_quantity} ${unit}`;
    });

    return { answer: `Current stock:\n${lines.join('\n')}` };
  }

  if (q.includes('dispatch') || q.includes('out')) {
    const { data: outDispatches } = await applyCityFilter(
      admin
        .from('dispatches')
        .select('*, drivers(name), product_types(name)')
        .eq('status', 'out'),
      cityIds
    );

    if (!outDispatches?.length) {
      return { answer: 'No drivers currently out with stock.' };
    }

    const lines = (outDispatches ?? []).map((d: Record<string, unknown>) => {
      const driver = d.drivers as unknown as { name: string };
      const product = d.product_types as unknown as { name: string };
      return `${driver.name}: ${d.quantity_taken} ${product.name}`;
    });

    return { answer: `Drivers still out:\n${lines.join('\n')}` };
  }

  return {
    answer:
      "I can answer questions about sales, production, factory sales, and driver performance. Try:\n• 'how much sold this week'\n• 'factory sales today'\n• 'factory revenue'\n• 'best driver this month'\n• 'current stock'",
  };
}
