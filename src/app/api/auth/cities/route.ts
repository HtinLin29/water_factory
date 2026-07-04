import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/** Public city list for the login page (names + ids only). */
export async function GET() {
  const admin = createAdminClient();
  const { data: cities, error } = await admin.from('cities').select('id, name').order('name');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cities: cities ?? [] });
}
