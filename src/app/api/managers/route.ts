import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getAuthenticatedManager,
  unauthorizedResponse,
  badRequestResponse,
  forbiddenResponse,
} from '@/lib/auth-helpers';
import { isSuperAdmin } from '@/lib/city-scope';

export async function GET() {
  const { manager, error } = await getAuthenticatedManager();
  if (!manager) return unauthorizedResponse(error ?? undefined);

  const admin = createAdminClient();

  let query = admin
    .from('managers')
    .select('id, name, email, created_at, role, city_id, cities(id, name)')
    .order('name');

  if (!isSuperAdmin(manager)) {
    query = query.eq('id', manager.id);
  }

  const { data } = await query;
  return NextResponse.json({ managers: data });
}

export async function POST(request: Request) {
  const { manager, error } = await getAuthenticatedManager();
  if (!manager) return unauthorizedResponse(error ?? undefined);

  if (!isSuperAdmin(manager)) {
    return forbiddenResponse('Only super admin can create managers');
  }

  const { email, password, name, cityId, role = 'manager' } = await request.json();
  if (!email || !password || !name) {
    return badRequestResponse('Email, password, and name are required');
  }

  if (role === 'manager' && !cityId) {
    return badRequestResponse('City is required for branch managers');
  }
  if (role === 'super_admin' && cityId) {
    return badRequestResponse('Super admin cannot be assigned to a city');
  }

  const admin = createAdminClient();

  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError) return badRequestResponse(authError.message);

  const { error: managerError } = await admin.from('managers').insert({
    id: authUser.user.id,
    name,
    email,
    role,
    city_id: role === 'super_admin' ? null : cityId,
  });

  if (managerError) {
    await admin.auth.admin.deleteUser(authUser.user.id);
    return NextResponse.json({ error: managerError.message }, { status: 500 });
  }

  return NextResponse.json({
    manager: { id: authUser.user.id, name, email, role, city_id: cityId ?? null },
  });
}

export async function DELETE(request: Request) {
  const { manager, error } = await getAuthenticatedManager();
  if (!manager) return unauthorizedResponse(error ?? undefined);

  if (!isSuperAdmin(manager)) {
    return forbiddenResponse('Only super admin can remove managers');
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return badRequestResponse('Manager ID required');
  if (id === manager.id) return badRequestResponse('Cannot remove your own account');

  const admin = createAdminClient();
  const { error: deleteError } = await admin.from('managers').delete().eq('id', id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  await admin.auth.admin.deleteUser(id);
  return NextResponse.json({ success: true });
}
