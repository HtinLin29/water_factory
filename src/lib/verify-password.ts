import { createClient } from '@supabase/supabase-js';

/** Verify a manager password without affecting the current browser session. */
export async function verifyManagerPassword(email: string, password: string): Promise<boolean> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return !error;
}
