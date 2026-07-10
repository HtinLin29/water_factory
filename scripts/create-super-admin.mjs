import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const envPath = new URL('../.env.local', import.meta.url);
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const idx = line.indexOf('=');
      return [line.slice(0, idx), line.slice(idx + 1)];
    })
);

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const email = process.argv[2] ?? 'admin@water.com';
const password = process.argv[3] ?? 'admin1234';
const name = process.argv[4] ?? 'Admin';

const { data: managers, error: listError } = await admin
  .from('managers')
  .select('id, name, email, role');

if (listError) {
  console.error('Failed to list managers:', listError.message);
  process.exit(1);
}

console.log('Existing managers:', managers);

const existing = managers?.find((m) => m.email?.toLowerCase() === email.toLowerCase());
if (existing) {
  if (existing.role === 'super_admin') {
    const { error: updateError } = await admin.auth.admin.updateUserById(existing.id, {
      password,
    });
    if (updateError) {
      console.error('Failed to update password:', updateError.message);
      process.exit(1);
    }
    console.log(JSON.stringify({ success: true, action: 'updated_password', manager: existing }, null, 2));
    process.exit(0);
  }

  const { error: roleError } = await admin
    .from('managers')
    .update({ role: 'super_admin', city_id: null })
    .eq('id', existing.id);
  if (roleError) {
    console.error('Failed to promote manager:', roleError.message);
    process.exit(1);
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(existing.id, {
    password,
  });
  if (updateError) {
    console.error('Failed to update password:', updateError.message);
    process.exit(1);
  }

  console.log(JSON.stringify({ success: true, action: 'promoted_to_super_admin', manager: existing }, null, 2));
  process.exit(0);
}

let authUserId;

const { data: createdUser, error: authError } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});

if (authError) {
  if (!authError.message.includes('already been registered')) {
    console.error('Failed to create auth user:', authError.message);
    process.exit(1);
  }

  const { data: listed, error: listUsersError } = await admin.auth.admin.listUsers();
  if (listUsersError) {
    console.error('Failed to list auth users:', listUsersError.message);
    process.exit(1);
  }

  const existingAuthUser = listed.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!existingAuthUser) {
    console.error('Auth user exists but could not be found by email');
    process.exit(1);
  }

  authUserId = existingAuthUser.id;
  const { error: updateError } = await admin.auth.admin.updateUserById(authUserId, {
    password,
    email_confirm: true,
  });
  if (updateError) {
    console.error('Failed to update existing auth user:', updateError.message);
    process.exit(1);
  }
} else {
  authUserId = createdUser.user.id;
}

const { error: managerError } = await admin.from('managers').insert({
  id: authUserId,
  name,
  email,
  role: 'super_admin',
  city_id: null,
});

if (managerError) {
  if (createdUser) {
    await admin.auth.admin.deleteUser(authUserId);
  }
  console.error('Failed to create manager row:', managerError.message);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      success: true,
      action: createdUser ? 'created_super_admin' : 'linked_existing_auth_user',
      manager: { id: authUserId, name, email, role: 'super_admin' },
    },
    null,
    2
  )
);
