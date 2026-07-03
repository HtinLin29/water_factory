export interface FactorySaleItemLine {
  productName: string;
  quantity: number;
  unitLabel: string;
  priceAtSale: number;
  subtotal: number;
}

export interface FactorySaleReceiptInput {
  saleTime: string;
  items: FactorySaleItemLine[];
  total: number;
  paymentMethod: 'cash' | 'transfer';
}

export function formatSaleTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function buildFactorySaleReceiptText(sale: FactorySaleReceiptInput): string {
  const lines: string[] = [];
  lines.push(`Factory Sale - ${formatSaleTime(sale.saleTime)}`);
  for (const item of sale.items) {
    lines.push(
      `${item.productName}: ${item.quantity} ${item.unitLabel} × $${item.priceAtSale.toFixed(2)} = $${item.subtotal.toFixed(2)}`
    );
  }
  lines.push(`Total: $${sale.total.toFixed(2)}`);
  lines.push(`Payment: ${sale.paymentMethod === 'cash' ? 'Cash' : 'Transfer'}`);
  return lines.join('\n');
}

export function summarizeSaleItems(
  items: {
    quantity: number;
    product_types: { name: string; unit_type: string } | { name: string; unit_type: string }[];
  }[]
): string {
  return items
    .map((item) => {
      const pt = Array.isArray(item.product_types) ? item.product_types[0] : item.product_types;
      const unit = pt.unit_type === 'pack' ? 'pk' : 'btl';
      return `${item.quantity}${unit} ${pt.name}`;
    })
    .join(', ');
}

export function summarizeUseItems(
  items: {
    quantity: number;
    product_types: { name: string; unit_type: string } | { name: string; unit_type: string }[];
  }[]
): string {
  return summarizeSaleItems(items);
}
