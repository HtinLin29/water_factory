import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { ManagerRecord } from '@/lib/city-scope';

export async function getAuthenticatedManager() {
  const supabase = createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { user: null, manager: null as ManagerRecord | null, error: 'Unauthorized' };
  }

  const { createAdminClient } = await import('@/lib/supabase/admin');
  const admin = createAdminClient();
  const { data: manager, error: managerError } = await admin
    .from('managers')
    .select('id, name, email, city_id, role, cities(id, name)')
    .eq('id', user.id)
    .single();

  if (managerError || !manager) {
    return { user, manager: null, error: 'Not a manager account' };
  }

  const cityJoin = manager.cities as { id: string; name: string } | { id: string; name: string }[] | null;
  const normalizedManager: ManagerRecord = {
    id: manager.id,
    name: manager.name,
    email: manager.email,
    city_id: manager.city_id,
    role: manager.role,
    cities: Array.isArray(cityJoin) ? cityJoin[0] ?? null : cityJoin,
  };

  return { user, manager: normalizedManager, error: null };
}

export function unauthorizedResponse(message = 'Unauthorized') {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function badRequestResponse(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function forbiddenResponse(message: string) {
  return NextResponse.json({ error: message }, { status: 403 });
}

export function serverErrorResponse(message: string) {
  return NextResponse.json({ error: message }, { status: 500 });
}
