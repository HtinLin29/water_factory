import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getAuthenticatedManager,
  unauthorizedResponse,
} from '@/lib/auth-helpers';
import { todayISO } from '@/lib/date-utils';
import Papa from 'papaparse';

import { applyCityFilter, getCityFilterFromRequest } from '@/lib/city-scope';

export async function GET(request: Request) {
  const { manager, error } = await getAuthenticatedManager();
  if (!manager) return unauthorizedResponse(error ?? undefined);

  const { cityIds } = getCityFilterFromRequest(request, manager);
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('startDate') ?? todayISO();
  const endDate = searchParams.get('endDate') ?? todayISO();

  const admin = createAdminClient();

  const [stock, production, restocks, dispatches, settlements] =
    await Promise.all([
      applyCityFilter(admin.from('stock_ledger').select('*, product_types(name), cities(name)'), cityIds),
      applyCityFilter(
        admin
          .from('daily_production')
          .select('*, product_types(name), cities(name)')
          .gte('date', startDate)
          .lte('date', endDate),
        cityIds
      ),
      applyCityFilter(
        admin
          .from('pack_restocks')
          .select('*, product_types(name), cities(name)')
          .gte('created_at', `${startDate}T00:00:00`)
          .lte('created_at', `${endDate}T23:59:59`),
        cityIds
      ),
      applyCityFilter(
        admin
          .from('dispatches')
          .select('*, drivers(name), product_types(name), cities(name)')
          .gte('dispatched_at', `${startDate}T00:00:00`)
          .lte('dispatched_at', `${endDate}T23:59:59`),
        cityIds
      ),
      applyCityFilter(
        admin
          .from('settlements')
          .select('*, dispatches(dispatched_at, drivers(name), product_types(name)), cities(name)')
          .gte('settled_at', `${startDate}T00:00:00`)
          .lte('settled_at', `${endDate}T23:59:59`),
        cityIds
      ),
    ]);

  const rows: Record<string, string | number>[] = [];

  for (const p of production.data ?? []) {
    const pt = p.product_types as { name: string };
    const city = (p as { cities?: { name: string } }).cities?.name ?? '';
    rows.push({
      type: 'production',
      date: p.date,
      city,
      product: pt.name,
      quantity: p.quantity_produced,
      details: `Previous: ${p.previous_stock}, Current: ${p.current_stock}`,
    });
  }

  for (const r of restocks.data ?? []) {
    const pt = r.product_types as { name: string };
    rows.push({
      type: 'restock',
      date: r.created_at.split('T')[0],
      product: pt.name,
      quantity: r.packs_added,
      details: 'packs added',
    });
  }

  for (const d of dispatches.data ?? []) {
    const driver = d.drivers as { name: string };
    const pt = d.product_types as { name: string };
    rows.push({
      type: 'dispatch',
      date: d.dispatched_at.split('T')[0],
      product: pt.name,
      quantity: d.quantity_taken,
      details: `Driver: ${driver.name}, Status: ${d.status}`,
    });
  }

  for (const s of settlements.data ?? []) {
    const d = s.dispatches as {
      dispatched_at: string;
      drivers: { name: string };
      product_types: { name: string };
    };
    rows.push({
      type: 'settlement',
      date: s.settled_at.split('T')[0],
      product: d.product_types.name,
      quantity: s.quantity_sold,
      details: `Driver: ${d.drivers.name}, Sold: ${s.quantity_sold}, Returned: ${s.quantity_returned}, Cash: $${s.cash_received}, Discrepancy: $${s.cash_discrepancy}`,
    });
  }

  for (const s of stock.data ?? []) {
    const pt = s.product_types as { name: string };
    rows.push({
      type: 'current_stock',
      date: todayISO(),
      product: pt.name,
      quantity: s.current_quantity,
      details: 'current inventory',
    });
  }

  const csv = Papa.unparse(rows);

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="water-factory-export-${startDate}-to-${endDate}.csv"`,
    },
  });
}
