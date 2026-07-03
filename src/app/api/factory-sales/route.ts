import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getAuthenticatedManager,
  unauthorizedResponse,
  badRequestResponse,
} from '@/lib/auth-helpers';
import {
  applyCityFilter,
  getCityFilterFromRequest,
  writeCityFromBody,
  CityAccessDeniedError,
} from '@/lib/city-scope';
import { ensureStockLedgerForCity } from '@/lib/ensure-stock-ledger';
import { todayISO } from '@/lib/date-utils';
import {
  buildFactorySaleReceiptText,
  summarizeSaleItems,
  type FactorySaleItemLine,
} from '@/lib/factory-sales-summary';
import type { ProductType } from '@/lib/types';

function cityScopeError(e: unknown) {
  if (e instanceof CityAccessDeniedError) {
    return NextResponse.json({ error: e.message }, { status: 403 });
  }
  return badRequestResponse(e instanceof Error ? e.message : 'City required');
}

async function fetchSaleById(admin: ReturnType<typeof createAdminClient>, saleId: string) {
  const { data: sale, error } = await admin
    .from('factory_sales')
    .select('*, cities(name)')
    .eq('id', saleId)
    .single();

  if (error || !sale) return null;

  const { data: items } = await admin
    .from('factory_sale_items')
    .select('*, product_types(name, unit_type)')
    .eq('factory_sale_id', saleId);

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

  return {
    ...sale,
    items: items ?? [],
    whatsappSummary,
  };
}

export async function GET(request: Request) {
  const { manager, error } = await getAuthenticatedManager();
  if (!manager) return unauthorizedResponse(error ?? undefined);

  let cityIds;
  try {
    ({ cityIds } = getCityFilterFromRequest(request, manager));
  } catch (e) {
    return cityScopeError(e);
  }

  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date') ?? todayISO();

  const admin = createAdminClient();

  let salesQuery = admin
    .from('factory_sales')
    .select('*, factory_sale_items(quantity, product_types(name, unit_type))')
    .eq('sale_date', date)
    .order('sale_time', { ascending: false });
  salesQuery = applyCityFilter(salesQuery, cityIds);

  let stockQuery = admin.from('stock_ledger').select('product_type_id, current_quantity');
  stockQuery = applyCityFilter(stockQuery, cityIds);

  const [salesRes, productsRes, stockRes, pricesRes] = await Promise.all([
    salesQuery,
    admin.from('product_types').select('*').order('name'),
    stockQuery,
    admin.from('price_history').select('product_type_id, price, effective_from').order('effective_from', { ascending: false }),
  ]);

  const products = (productsRes.data ?? []) as ProductType[];
  const stockMap: Record<string, number> = {};
  for (const row of stockRes.data ?? []) {
    stockMap[row.product_type_id] = (stockMap[row.product_type_id] ?? 0) + row.current_quantity;
  }

  const priceMap: Record<string, number> = {};
  const seen = new Set<string>();
  for (const p of pricesRes.data ?? []) {
    if (!seen.has(p.product_type_id)) {
      priceMap[p.product_type_id] = Number(p.price);
      seen.add(p.product_type_id);
    }
  }

  const sales = (salesRes.data ?? []).map((sale) => ({
    id: sale.id,
    sale_time: sale.sale_time,
    sale_date: sale.sale_date,
    payment_method: sale.payment_method,
    amount_paid: Number(sale.amount_paid),
    notes: sale.notes,
    itemsSummary: summarizeSaleItems(
      (sale.factory_sale_items ?? []) as {
        quantity: number;
        product_types: { name: string; unit_type: string };
      }[]
    ),
  }));

  return NextResponse.json({
    sales,
    products,
    stock: stockMap,
    prices: priceMap,
    date,
  });
}

export async function POST(request: Request) {
  const { manager, error } = await getAuthenticatedManager();
  if (!manager) return unauthorizedResponse(error ?? undefined);

  const body = await request.json();
  const { items, payment_method, amount_paid, notes, cityId: bodyCityId } = body;

  if (!Array.isArray(items) || items.length === 0) {
    return badRequestResponse('At least one item is required');
  }
  if (payment_method !== 'cash' && payment_method !== 'transfer') {
    return badRequestResponse('Payment method must be cash or transfer');
  }
  if (amount_paid == null || Number(amount_paid) < 0) {
    return badRequestResponse('Valid amount_paid is required');
  }

  let cityId: string;
  try {
    cityId = writeCityFromBody(manager, bodyCityId ?? new URL(request.url).searchParams.get('cityId'));
  } catch (e) {
    return cityScopeError(e);
  }

  const admin = createAdminClient();
  await ensureStockLedgerForCity(admin, cityId);

  const rpcItems = items.map((item: { product_type_id: string; quantity: number }) => ({
    product_type_id: item.product_type_id,
    quantity: item.quantity,
  }));

  const { data: rpcResult, error: rpcError } = await admin.rpc('record_factory_sale', {
    p_items: rpcItems,
    p_payment_method: payment_method,
    p_amount_paid: amount_paid,
    p_notes: notes ?? null,
    p_manager_id: manager.id,
    p_city_id: cityId,
  });

  if (rpcError) return badRequestResponse(rpcError.message);

  const saleId = (rpcResult as { sale_id: string }).sale_id;
  const sale = await fetchSaleById(admin, saleId);
  if (!sale) {
    return NextResponse.json({ success: true, saleId });
  }

  return NextResponse.json({ success: true, sale });
}
