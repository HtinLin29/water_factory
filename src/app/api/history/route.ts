import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getAuthenticatedManager,
  unauthorizedResponse,
  badRequestResponse,
} from '@/lib/auth-helpers';
import { applyCityFilter, getCityFilterFromRequest } from '@/lib/city-scope';

export async function GET(request: Request) {
  const { manager, error } = await getAuthenticatedManager();
  if (!manager) return unauthorizedResponse(error ?? undefined);

  const { cityIds } = getCityFilterFromRequest(request, manager);
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  if (!date) return badRequestResponse('Date parameter required');

  const admin = createAdminClient();

  const [production, restocks, dispatches, settlements] = await Promise.all([
    applyCityFilter(
      admin.from('daily_production').select('*, product_types(name)').eq('date', date),
      cityIds
    ),
    applyCityFilter(
      admin
        .from('pack_restocks')
        .select('*, product_types(name)')
        .gte('created_at', `${date}T00:00:00`)
        .lte('created_at', `${date}T23:59:59`),
      cityIds
    ),
    applyCityFilter(
      admin
        .from('dispatches')
        .select('*, drivers(name), product_types(name), settlements(*)')
        .gte('dispatched_at', `${date}T00:00:00`)
        .lte('dispatched_at', `${date}T23:59:59`),
      cityIds
    ),
    applyCityFilter(
      admin
        .from('settlements')
        .select('*, dispatches(dispatched_at, drivers(name), product_types(name))')
        .gte('settled_at', `${date}T00:00:00`)
        .lte('settled_at', `${date}T23:59:59`),
      cityIds
    ),
  ]);

  return NextResponse.json({
    date,
    production: production.data ?? [],
    restocks: restocks.data ?? [],
    dispatches: dispatches.data ?? [],
    settlements: settlements.data ?? [],
  });
}

export async function POST(request: Request) {
  const { manager, error } = await getAuthenticatedManager();
  if (!manager) return unauthorizedResponse(error ?? undefined);

  const { cityIds } = getCityFilterFromRequest(request, manager);
  const admin = createAdminClient();
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const cutoff = threeMonthsAgo.toISOString().split('T')[0];

  const { data: dates } = await applyCityFilter(
    admin.from('daily_production').select('date').gte('date', cutoff).order('date', { ascending: false }),
    cityIds
  );

  const uniqueDates: string[] = Array.from(new Set((dates ?? []).map((d: { date: string }) => d.date)));

  const { data: dispatchDates } = await applyCityFilter(
    admin.from('dispatches').select('dispatched_at').gte('dispatched_at', `${cutoff}T00:00:00`),
    cityIds
  );

  for (const d of dispatchDates ?? []) {
    const day = d.dispatched_at.split('T')[0];
    if (!uniqueDates.includes(day)) uniqueDates.push(day);
  }

  uniqueDates.sort((a, b) => b.localeCompare(a));

  return NextResponse.json({ dates: uniqueDates });
}
