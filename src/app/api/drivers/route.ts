import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getAuthenticatedManager,
  unauthorizedResponse,
  badRequestResponse,
  forbiddenResponse,
} from '@/lib/auth-helpers';
import { todayISO } from '@/lib/date-utils';
import { verifyManagerPassword } from '@/lib/verify-password';

import { applyCityFilter, getCityFilterFromRequest, writeCityFromBody, isSuperAdmin } from '@/lib/city-scope';

export async function GET(request: Request) {
  const { manager, error } = await getAuthenticatedManager();
  if (!manager) return unauthorizedResponse(error ?? undefined);

  const { cityIds } = getCityFilterFromRequest(request, manager);

  const { searchParams } = new URL(request.url);
  const driverId = searchParams.get('driverId');
  const date = searchParams.get('date') ?? todayISO();

  const admin = createAdminClient();

  if (driverId) {
    return getDriverDetail(admin, driverId, date);
  }

  const { data: drivers, error: dbError } = await applyCityFilter(
    admin.from('drivers').select('*').eq('status', 'active').order('name'),
    cityIds
  );

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  const summaries = await Promise.all(
    (drivers ?? []).map((driver: Parameters<typeof buildDriverSummary>[1]) =>
      buildDriverSummary(admin, driver, date, false)
    )
  );

  return NextResponse.json({ drivers: summaries, date });
}

async function buildDriverSummary(
  admin: ReturnType<typeof createAdminClient>,
  driver: {
    id: string;
    name: string;
    status: string;
    phone?: string | null;
    salary?: number | null;
    license_front_url?: string | null;
    license_back_url?: string | null;
    created_at: string;
    created_by: string | null;
  },
  date: string,
  includeTodayDispatches = true
) {
  const balancePromise = admin
    .from('driver_account_balance')
    .select('balance_owed')
    .eq('driver_id', driver.id)
    .maybeSingle();

  let todayDispatches: Record<string, unknown>[] = [];

  if (includeTodayDispatches) {
    const [dispatchesRes, balanceRes] = await Promise.all([
      admin
        .from('dispatches')
        .select('*, product_types(name), settlements(*)')
        .eq('driver_id', driver.id)
        .gte('dispatched_at', `${date}T00:00:00`)
        .lte('dispatched_at', `${date}T23:59:59`)
        .order('dispatched_at', { ascending: true }),
      balancePromise,
    ]);
    todayDispatches = dispatchesRes.data ?? [];
    const balanceOwed = Number(balanceRes.data?.balance_owed ?? 0);
    return {
      ...driver,
      todayDispatchCount: todayDispatches.length,
      balanceOwed,
      owesShop: balanceOwed > 0 ? balanceOwed : 0,
      creditBalance: balanceOwed < 0 ? Math.abs(balanceOwed) : 0,
      todayDispatches,
      cashTransactions: [],
    };
  }

  const { data: balanceData } = await balancePromise;
  const balanceOwed = Number(balanceData?.balance_owed ?? 0);

  return {
    ...driver,
    todayDispatchCount: 0,
    balanceOwed,
    owesShop: balanceOwed > 0 ? balanceOwed : 0,
    creditBalance: balanceOwed < 0 ? Math.abs(balanceOwed) : 0,
    todayDispatches: [],
    cashTransactions: [],
  };
}

async function getDriverDetail(
  admin: ReturnType<typeof createAdminClient>,
  driverId: string,
  date: string
) {
  const { data: driver } = await admin
    .from('drivers')
    .select('*')
    .eq('id', driverId)
    .single();

  if (!driver) return badRequestResponse('Driver not found');

  const summary = await buildDriverSummary(admin, driver, date);

  const { count: totalDispatchCount } = await admin
    .from('dispatches')
    .select('id', { count: 'exact', head: true })
    .eq('driver_id', driverId);

  const { data: allTransactions } = await admin
    .from('driver_cash_transactions')
    .select('*')
    .eq('driver_id', driverId)
    .order('created_at', { ascending: false })
    .limit(50);

  return NextResponse.json({
    ...summary,
    totalDispatchCount: totalDispatchCount ?? 0,
    cashTransactions: allTransactions ?? summary.cashTransactions,
    date,
  });
}

export async function POST(request: Request) {
  const { manager, error } = await getAuthenticatedManager();
  if (!manager) return unauthorizedResponse(error ?? undefined);

  const body = await request.json();

  if (body.type === 'payment') {
    const { driverId, amount, notes } = body;
    if (!driverId || !amount || amount <= 0) {
      return badRequestResponse('Driver and positive payment amount required');
    }

    const admin = createAdminClient();
    const { data: txId, error: rpcError } = await admin.rpc('record_driver_payment', {
      p_driver_id: driverId,
      p_amount: amount,
      p_notes: notes ?? null,
      p_manager_id: manager.id,
    });

    if (rpcError) return badRequestResponse(rpcError.message);

    const { data: balance } = await admin
      .from('driver_account_balance')
      .select('balance_owed')
      .eq('driver_id', driverId)
      .single();

    return NextResponse.json({
      success: true,
      transactionId: txId,
      balanceOwed: Number(balance?.balance_owed ?? 0),
    });
  }

  const { name, cityId: bodyCityId } = body;
  if (!name?.trim()) return badRequestResponse('Driver name is required');

  let cityId: string;
  try {
    cityId = writeCityFromBody(
      manager,
      bodyCityId ?? new URL(request.url).searchParams.get('cityId')
    );
  } catch (e) {
    return badRequestResponse(e instanceof Error ? e.message : 'City required');
  }

  const admin = createAdminClient();
  const { data, error: dbError } = await admin
    .from('drivers')
    .insert({ name: name.trim(), created_by: manager.id, city_id: cityId })
    .select()
    .single();

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json({ driver: data });
}

export async function DELETE(request: Request) {
  const { manager, error } = await getAuthenticatedManager();
  if (!manager) return unauthorizedResponse(error ?? undefined);

  if (!isSuperAdmin(manager)) {
    return forbiddenResponse('Only super admin can deactivate drivers');
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return badRequestResponse('Driver ID required');

  let password: string | undefined;
  try {
    const body = await request.json();
    password = body.password;
  } catch {
    return badRequestResponse('Password required to deactivate driver');
  }

  if (!password) {
    return badRequestResponse('Password required to deactivate driver');
  }

  const valid = await verifyManagerPassword(manager.email, password);
  if (!valid) {
    return forbiddenResponse('Incorrect password');
  }

  const admin = createAdminClient();

  const { data: outDispatch } = await admin
    .from('dispatches')
    .select('id')
    .eq('driver_id', id)
    .eq('status', 'out')
    .limit(1);

  if (outDispatch?.length) {
    return badRequestResponse('Cannot deactivate driver with outstanding dispatches');
  }

  const { error: dbError } = await admin
    .from('drivers')
    .update({ status: 'inactive' })
    .eq('id', id);

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
