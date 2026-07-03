import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { badRequestResponse, serverErrorResponse } from '@/lib/auth-helpers';

/** One-time setup route to create the first manager. Disable after use by setting SETUP_ENABLED=false */
export async function POST(request: Request) {
  if (process.env.SETUP_ENABLED !== 'true') {
    return NextResponse.json(
      { error: 'Setup is disabled. Use Settings to add managers.' },
      { status: 403 }
    );
  }

  const { email, password, name } = await request.json();
  if (!email || !password || !name) {
    return badRequestResponse('Email, password, and name are required');
  }

  const admin = createAdminClient();

  const { count } = await admin
    .from('managers')
    .select('*', { count: 'exact', head: true });

  if (count && count > 0) {
    return badRequestResponse('Managers already exist. Use Settings to add more.');
  }

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
    role: 'super_admin',
    city_id: null,
  });

  if (managerError) {
    await admin.auth.admin.deleteUser(authUser.user.id);
    return serverErrorResponse(managerError.message);
  }

  return NextResponse.json({
    success: true,
    message: 'First manager created. Set SETUP_ENABLED=false in your environment.',
    manager: { id: authUser.user.id, name, email },
  });
}
