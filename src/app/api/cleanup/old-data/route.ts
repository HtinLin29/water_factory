import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getMonthsToArchive, formatMonth } from '@/lib/date-utils';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const monthsToArchive = getMonthsToArchive();
  const results: { month: string; archived: boolean; deleted: boolean }[] = [];

  for (const monthDate of monthsToArchive) {
    const monthStart = formatMonth(monthDate);
    const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
    const monthEndStr = monthEnd.toISOString().split('T')[0];

    const { data: products } = await admin.from('product_types').select('id, name, is_daily_cycle');
    const { data: cities } = await admin.from('cities').select('id, name');

    for (const city of cities ?? []) {
      for (const product of products ?? []) {
        const { data: existing } = await admin
          .from('monthly_archives')
          .select('id')
          .eq('month', monthStart)
          .eq('product_type_id', product.id)
          .eq('city_id', city.id)
          .single();

        if (existing) continue;

      let totalProduced = 0;
      let totalDispatched = 0;
      let totalSold = 0;
      let totalReturned = 0;
      let totalRevenue = 0;
      let totalDiscrepancy = 0;

      if (product.is_daily_cycle) {
        const { data: prod } = await admin
          .from('daily_production')
          .select('quantity_produced')
          .eq('product_type_id', product.id)
          .eq('city_id', city.id)
          .gte('date', monthStart)
          .lte('date', monthEndStr);
        totalProduced = (prod ?? []).reduce((s, p) => s + p.quantity_produced, 0);
      } else {
        const { data: restocks } = await admin
          .from('pack_restocks')
          .select('packs_added')
          .eq('product_type_id', product.id)
          .eq('city_id', city.id)
          .gte('created_at', `${monthStart}T00:00:00`)
          .lte('created_at', `${monthEndStr}T23:59:59`);
        totalProduced = (restocks ?? []).reduce((s, r) => s + r.packs_added, 0);
      }

      const { data: dispatches } = await admin
        .from('dispatches')
        .select('id, quantity_taken')
        .eq('product_type_id', product.id)
        .eq('city_id', city.id)
        .gte('dispatched_at', `${monthStart}T00:00:00`)
        .lte('dispatched_at', `${monthEndStr}T23:59:59`);

      totalDispatched = (dispatches ?? []).reduce((s, d) => s + d.quantity_taken, 0);

      const { data: settlements } = await admin
        .from('settlements')
        .select('quantity_sold, quantity_returned, expected_cash, cash_discrepancy, dispatches!inner(product_type_id)')
        .eq('dispatches.product_type_id', product.id)
        .gte('settled_at', `${monthStart}T00:00:00`)
        .lte('settled_at', `${monthEndStr}T23:59:59`);

      for (const s of settlements ?? []) {
        totalSold += s.quantity_sold;
        totalReturned += s.quantity_returned;
        totalRevenue += Number(s.expected_cash);
        totalDiscrepancy += Number(s.cash_discrepancy);
      }

      await admin.from('monthly_archives').insert({
        month: monthStart,
        product_type_id: product.id,
        city_id: city.id,
        total_produced: totalProduced,
        total_sold: totalSold,
        total_returned: totalReturned,
        total_dispatched: totalDispatched,
        total_revenue: totalRevenue,
        total_cash_discrepancy: totalDiscrepancy,
      });
      }
    }

    const dispatchIds = await admin
      .from('dispatches')
      .select('id')
      .gte('dispatched_at', `${monthStart}T00:00:00`)
      .lte('dispatched_at', `${monthEndStr}T23:59:59`);

    const ids = (dispatchIds.data ?? []).map((d) => d.id);
    if (ids.length > 0) {
      await admin.from('settlements').delete().in('dispatch_id', ids);
    }

    await admin
      .from('dispatches')
      .delete()
      .gte('dispatched_at', `${monthStart}T00:00:00`)
      .lte('dispatched_at', `${monthEndStr}T23:59:59`);

    await admin
      .from('daily_production')
      .delete()
      .gte('date', monthStart)
      .lte('date', monthEndStr);

    await admin
      .from('pack_restocks')
      .delete()
      .gte('created_at', `${monthStart}T00:00:00`)
      .lte('created_at', `${monthEndStr}T23:59:59`);

    results.push({ month: monthStart, archived: true, deleted: true });
  }

  return NextResponse.json({
    message: 'Cleanup complete',
    monthsProcessed: results.length,
    results,
  });
}
