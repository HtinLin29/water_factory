import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getAuthenticatedManager,
  unauthorizedResponse,
  badRequestResponse,
} from '@/lib/auth-helpers';

export async function POST(request: Request) {
  const { manager, error } = await getAuthenticatedManager();
  if (!manager) return unauthorizedResponse(error ?? undefined);

  const { dispatchId, quantitySold, cashReceived, notes } = await request.json();

  if (!Number.isInteger(quantitySold) || quantitySold < 0) {
    return badRequestResponse('Quantity sold must be a non-negative whole number');
  }

  const admin = createAdminClient();

  const { data: dispatch } = await admin
    .from('dispatches')
    .select('quantity_taken, status')
    .eq('id', dispatchId)
    .single();

  if (!dispatch) return badRequestResponse('Dispatch not found');
  if (dispatch.status !== 'out') return badRequestResponse('Dispatch already settled');

  if (quantitySold > dispatch.quantity_taken) {
    return badRequestResponse(
      `Cannot sell more than taken. Driver took ${dispatch.quantity_taken}, but ${quantitySold} was entered.`
    );
  }

  const returned = dispatch.quantity_taken - quantitySold;
  if (returned < 0) {
    return badRequestResponse('Returned quantity cannot be negative');
  }

  const { data: settlementId, error: rpcError } = await admin.rpc('create_settlement', {
    p_dispatch_id: dispatchId,
    p_quantity_sold: quantitySold,
    p_cash_received: cashReceived,
    p_manager_id: manager.id,
    p_notes: notes ?? null,
  });

  if (rpcError) return badRequestResponse(rpcError.message);

  const { data: settlement } = await admin
    .from('settlements')
    .select('*, dispatches(*, drivers(*), product_types(*))')
    .eq('id', settlementId)
    .single();

  return NextResponse.json({ settlement });
}

export async function PATCH(request: Request) {
  const { manager, error } = await getAuthenticatedManager();
  if (!manager) return unauthorizedResponse(error ?? undefined);

  const { id, quantitySold, cashReceived, reason } = await request.json();
  if (!reason?.trim()) return badRequestResponse('Reason is required for edits');

  if (!Number.isInteger(quantitySold) || quantitySold < 0) {
    return badRequestResponse('Quantity sold must be a non-negative whole number');
  }

  const admin = createAdminClient();

  const { data: settlement } = await admin
    .from('settlements')
    .select('dispatch_id, dispatches(quantity_taken)')
    .eq('id', id)
    .single();

  if (!settlement) return badRequestResponse('Settlement not found');

  const dispatch = settlement.dispatches as unknown as { quantity_taken: number };
  if (quantitySold > dispatch.quantity_taken) {
    return badRequestResponse(
      `Cannot sell more than taken. Driver took ${dispatch.quantity_taken}, but ${quantitySold} was entered.`
    );
  }

  const { error: rpcError } = await admin.rpc('edit_settlement', {
    p_id: id,
    p_quantity_sold: quantitySold,
    p_cash_received: cashReceived,
    p_reason: reason,
    p_manager_id: manager.id,
  });

  if (rpcError) return badRequestResponse(rpcError.message);
  return NextResponse.json({ success: true });
}
