import type { createAdminClient } from '@/lib/supabase/admin';

type AdminClient = ReturnType<typeof createAdminClient>;

async function nullifyColumn(
  admin: AdminClient,
  table: string,
  column: string,
  managerId: string
) {
  const { error } = await admin.from(table).update({ [column]: null }).eq(column, managerId);
  if (error) {
    console.warn(`clearManagerReferences: ${table}.${column}`, error.message);
  }
}

async function deleteRows(admin: AdminClient, table: string, column: string, managerId: string) {
  const { error } = await admin.from(table).delete().eq(column, managerId);
  if (error) {
    console.warn(`clearManagerReferences delete: ${table}.${column}`, error.message);
  }
}

/** Clear or remove rows that reference a manager so the account can be deleted. */
export async function clearManagerReferences(admin: AdminClient, managerId: string) {
  const nullifyTargets: { table: string; column: string }[] = [
    { table: 'daily_production', column: 'recorded_by' },
    { table: 'pack_restocks', column: 'recorded_by' },
    { table: 'dispatches', column: 'dispatched_by' },
    { table: 'settlements', column: 'settled_by' },
    { table: 'price_history', column: 'set_by' },
    { table: 'drivers', column: 'created_by' },
    { table: 'app_settings', column: 'updated_by' },
    { table: 'factory_sale_payments', column: 'recorded_by' },
    { table: 'factory_use', column: 'recorded_by' },
    { table: 'driver_cash_transactions', column: 'recorded_by' },
  ];

  for (const { table, column } of nullifyTargets) {
    await nullifyColumn(admin, table, column, managerId);
  }

  // Audit log — changed_by is NOT NULL in practice; remove rows for this manager
  await deleteRows(admin, 'edit_log', 'changed_by', managerId);
}
