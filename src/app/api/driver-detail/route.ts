import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getAuthenticatedManager,
  unauthorizedResponse,
  badRequestResponse,
} from '@/lib/auth-helpers';
import { todayISO } from '@/lib/date-utils';

interface DaySales {
  date: string;
  dispatchCount: number;
  totalTaken: number;
  totalSold: number;
  totalReturned: number;
  totalExpectedCash: number;
  totalCashReceived: number;
  totalDiscrepancy: number;
  dispatches: Record<string, unknown>[];
}

import { applyCityFilter, getCityFilterFromRequest } from '@/lib/city-scope';

export async function GET(request: Request) {
  const { manager, error } = await getAuthenticatedManager();
  if (!manager) return unauthorizedResponse(error ?? undefined);

  const { cityIds } = getCityFilterFromRequest(request, manager);

  const { searchParams } = new URL(request.url);
  const driverId = searchParams.get('driverId');
  const startDate =
    searchParams.get('startDate') ??
    (() => {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      return d.toISOString().split('T')[0];
    })();
  const endDate = searchParams.get('endDate') ?? todayISO();

  const admin = createAdminClient();

  if (!driverId) {
    const { data: drivers } = await applyCityFilter(
      admin.from('drivers').select('*').eq('status', 'active').order('name'),
      cityIds
    );
    return NextResponse.json({ drivers: drivers ?? [] });
  }

  const { data: driver } = await admin
    .from('drivers')
    .select('*')
    .eq('id', driverId)
    .single();

  if (!driver) return badRequestResponse('Driver not found');

  const [dispatchesRes, balanceRes, transactionsRes, totalCountRes] = await Promise.all([
    admin
      .from('dispatches')
      .select('*, product_types(name, unit_type), settlements(*)')
      .eq('driver_id', driverId)
      .gte('dispatched_at', `${startDate}T00:00:00`)
      .lte('dispatched_at', `${endDate}T23:59:59`)
      .order('dispatched_at', { ascending: false }),
    admin
      .from('driver_account_balance')
      .select('balance_owed')
      .eq('driver_id', driverId)
      .maybeSingle(),
    admin
      .from('driver_cash_transactions')
      .select('*')
      .eq('driver_id', driverId)
      .order('created_at', { ascending: false })
      .limit(100),
    admin
      .from('dispatches')
      .select('id', { count: 'exact', head: true })
      .eq('driver_id', driverId),
  ]);

  const dispatches = dispatchesRes.data ?? [];
  const balanceOwed = Number(balanceRes.data?.balance_owed ?? 0);

  const dayMap = new Map<string, DaySales>();

  for (const d of dispatches) {
    const date = d.dispatched_at.split('T')[0];
    if (!dayMap.has(date)) {
      dayMap.set(date, {
        date,
        dispatchCount: 0,
        totalTaken: 0,
        totalSold: 0,
        totalReturned: 0,
        totalExpectedCash: 0,
        totalCashReceived: 0,
        totalDiscrepancy: 0,
        dispatches: [],
      });
    }
    const day = dayMap.get(date)!;
    day.dispatchCount += 1;
    day.totalTaken += d.quantity_taken;
    day.dispatches.push(d);

    const settlement = Array.isArray(d.settlements)
      ? d.settlements[0]
      : d.settlements;
    if (settlement) {
      day.totalSold += settlement.quantity_sold;
      day.totalReturned += settlement.quantity_returned;
      day.totalExpectedCash += Number(settlement.expected_cash);
      day.totalCashReceived += Number(settlement.cash_received);
      day.totalDiscrepancy += Number(settlement.cash_discrepancy);
    }
  }

  const dailySales = Array.from(dayMap.values()).sort((a, b) =>
    b.date.localeCompare(a.date)
  );

  const periodTotals = dailySales.reduce(
    (acc, day) => ({
      dispatchCount: acc.dispatchCount + day.dispatchCount,
      totalSold: acc.totalSold + day.totalSold,
      totalRevenue: acc.totalRevenue + day.totalExpectedCash,
      totalDiscrepancy: acc.totalDiscrepancy + day.totalDiscrepancy,
    }),
    { dispatchCount: 0, totalSold: 0, totalRevenue: 0, totalDiscrepancy: 0 }
  );

  return NextResponse.json({
    driver,
    balanceOwed,
    owesShop: balanceOwed > 0 ? balanceOwed : 0,
    creditBalance: balanceOwed < 0 ? Math.abs(balanceOwed) : 0,
    totalDispatchCount: totalCountRes.count ?? 0,
    dailySales,
    cashTransactions: transactionsRes.data ?? [],
    periodTotals,
    dateRange: { startDate, endDate },
  });
}
