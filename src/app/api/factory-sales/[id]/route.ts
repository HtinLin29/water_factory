import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getAuthenticatedManager,
  unauthorizedResponse,
  badRequestResponse,
} from '@/lib/auth-helpers';
import {
  buildFactorySaleReceiptText,
  type FactorySaleItemLine,
} from '@/lib/factory-sales-summary';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const { manager, error } = await getAuthenticatedManager();
  if (!manager) return unauthorizedResponse(error ?? undefined);

  const admin = createAdminClient();
  const { data: sale, error: saleError } = await admin
    .from('factory_sales')
    .select('*, cities(name)')
    .eq('id', params.id)
    .single();

  if (saleError || !sale) {
    return badRequestResponse('Sale not found');
  }

  const { data: items } = await admin
    .from('factory_sale_items')
    .select('*, product_types(name, unit_type)')
    .eq('factory_sale_id', params.id);

  const itemLines: FactorySaleItemLine[] = (items ?? []).map((item) => {
    const pt = item.product_types as { name: string; unit_type: string };
    return {
      productName: pt.name,
      quantity: item.quantity,
      unitLabel: pt.unit_type === 'pack' ? 'packs' : 'bottles',
      priceAtSale: Number(item.price_at_sale),
      subtotal: Number(item.subtotal),
    };
  });

  const whatsappSummary = buildFactorySaleReceiptText({
    saleTime: sale.sale_time,
    items: itemLines,
    total: Number(sale.amount_paid),
    paymentMethod: sale.payment_method as 'cash' | 'transfer',
  });

  return NextResponse.json({
    sale: { ...sale, items: items ?? [], whatsappSummary },
  });
}
