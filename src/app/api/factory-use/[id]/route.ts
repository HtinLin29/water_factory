import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getAuthenticatedManager,
  unauthorizedResponse,
  badRequestResponse,
} from '@/lib/auth-helpers';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const { manager, error } = await getAuthenticatedManager();
  if (!manager) return unauthorizedResponse(error ?? undefined);

  const admin = createAdminClient();
  const { data: use, error: useError } = await admin
    .from('factory_use')
    .select('*, cities(name), managers(name)')
    .eq('id', params.id)
    .single();

  if (useError || !use) {
    return badRequestResponse('Factory use entry not found');
  }

  const { data: items } = await admin
    .from('factory_use_items')
    .select('*, product_types(name, unit_type)')
    .eq('factory_use_id', params.id);

  return NextResponse.json({
    use: { ...use, items: items ?? [] },
  });
}
