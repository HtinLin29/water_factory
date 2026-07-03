import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getAuthenticatedManager,
  unauthorizedResponse,
} from '@/lib/auth-helpers';
import { isSuperAdmin } from '@/lib/city-scope';

export async function GET() {
  const { manager, error } = await getAuthenticatedManager();
  if (!manager) return unauthorizedResponse(error ?? undefined);

  const admin = createAdminClient();
  const { data: cities } = await admin.from('cities').select('id, name').order('name');

  const cityJoin = manager.cities as { id: string; name: string } | null | undefined;

  return NextResponse.json({
    manager: {
      id: manager.id,
      name: manager.name,
      email: manager.email,
      role: manager.role,
      city_id: manager.city_id,
      cityName: cityJoin?.name ?? null,
    },
    cities: cities ?? [],
    isSuperAdmin: isSuperAdmin(manager),
  });
}
