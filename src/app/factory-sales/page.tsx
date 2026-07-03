'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppShell from '@/components/AppShell';
import LoadingSpinner from '@/components/LoadingSpinner';
import { useAppPreferences } from '@/contexts/AppPreferencesContext';
import { useAuth } from '@/contexts/AuthContext';
import { DEFAULT_LOW_STOCK_THRESHOLDS } from '@/lib/constants';
import { formatSaleTime } from '@/lib/factory-sales-summary';
import type { ProductType } from '@/lib/types';
import type { TranslationKey } from '@/lib/i18n/translations';

type TabId = 'sale' | 'use' | 'history';

interface SaleListItem {
  id: string;
  sale_time: string;
  payment_method: 'cash' | 'transfer';
  amount_paid: number;
  itemsSummary: string;
}

interface UseListItem {
  id: string;
  use_time: string;
  note: string | null;
  itemsSummary: string;
}

interface ReceiptSale {
  sale_time: string;
  amount_paid: number;
  payment_method: 'cash' | 'transfer';
  whatsappSummary: string;
  items: {
    quantity: number;
    price_at_sale: number;
    subtotal: number;
    product_types: { name: string; unit_type: string };
  }[];
}

type HistoryRow =
  | { kind: 'sale'; id: string; time: string; itemsSummary: string; amount_paid: number; payment_method: 'cash' | 'transfer' }
  | { kind: 'use'; id: string; time: string; itemsSummary: string; note: string | null };

const PRODUCT_ORDER = ['20L', '350ml', '1L'] as const;

function productLabel(name: string, t: (k: TranslationKey) => string) {
  if (name === '20L') return `20L ${t('factorySales_bottle')}`;
  if (name === '350ml') return `350ml ${t('factorySales_pack')}`;
  if (name === '1L') return `1L ${t('factorySales_pack')}`;
  return name;
}

function unitLabel(product: ProductType, qty: number, t: (k: TranslationKey) => string) {
  if (product.unit_type === 'pack') return qty === 1 ? t('factorySales_pack') : t('factorySales_packs');
  return qty === 1 ? t('factorySales_bottle') : t('factorySales_bottles');
}

function stockBarWidth(product: ProductType, stock: Record<string, number>) {
  const qty = stock[product.id] ?? 0;
  const threshold =
    DEFAULT_LOW_STOCK_THRESHOLDS[product.name as keyof typeof DEFAULT_LOW_STOCK_THRESHOLDS] ?? 10;
  const max = Math.max(qty, threshold * 4, 1);
  return Math.min(100, (qty / max) * 100);
}

export default function FactorySalesPage() {
  const { t } = useAppPreferences();
  const { apiQuery, writeCityId, requiresCitySelection, cityFilter } = useAuth();

  const [activeTab, setActiveTab] = useState<TabId>('sale');
  const [products, setProducts] = useState<ProductType[]>([]);
  const [stock, setStock] = useState<Record<string, number>>({});
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [sales, setSales] = useState<SaleListItem[]>([]);
  const [uses, setUses] = useState<UseListItem[]>([]);
  const [saleCart, setSaleCart] = useState<Record<string, number>>({});
  const [useCart, setUseCart] = useState<Record<string, number>>({});
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer'>('cash');
  const [amountPaid, setAmountPaid] = useState('');
  const [useNote, setUseNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [useSuccess, setUseSuccess] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptSale | null>(null);
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const useToastRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const orderedProducts = PRODUCT_ORDER.map((name) => products.find((p) => p.name === name)).filter(
    Boolean
  ) as ProductType[];

  const activeCart = activeTab === 'use' ? useCart : saleCart;
  const setActiveCart = activeTab === 'use' ? setUseCart : setSaleCart;

  const cartLines = orderedProducts
    .filter((p) => (activeCart[p.id] ?? 0) > 0)
    .map((p) => ({
      product: p,
      quantity: activeCart[p.id],
      price: prices[p.id] ?? 0,
      subtotal: (activeCart[p.id] ?? 0) * (prices[p.id] ?? 0),
    }));

  const saleCartLines = orderedProducts
    .filter((p) => (saleCart[p.id] ?? 0) > 0)
    .map((p) => ({
      product: p,
      quantity: saleCart[p.id],
      price: prices[p.id] ?? 0,
      subtotal: (saleCart[p.id] ?? 0) * (prices[p.id] ?? 0),
    }));

  const totalDue = saleCartLines.reduce((sum, line) => sum + line.subtotal, 0);
  const hasSaleItems = saleCartLines.length > 0;
  const hasUseItems = Object.values(useCart).some((q) => q > 0);

  const history = useMemo<HistoryRow[]>(() => {
    const rows: HistoryRow[] = [
      ...sales.map((s) => ({
        kind: 'sale' as const,
        id: s.id,
        time: s.sale_time,
        itemsSummary: s.itemsSummary,
        amount_paid: s.amount_paid,
        payment_method: s.payment_method,
      })),
      ...uses.map((u) => ({
        kind: 'use' as const,
        id: u.id,
        time: u.use_time,
        itemsSummary: u.itemsSummary,
        note: u.note,
      })),
    ];
    return rows.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  }, [sales, uses]);

  const loadData = useCallback(async () => {
    const [salesRes, useRes] = await Promise.all([
      fetch(apiQuery('/api/factory-sales')),
      fetch(apiQuery('/api/factory-use')),
    ]);
    const salesData = await salesRes.json();
    const useData = await useRes.json();
    setProducts(salesData.products ?? []);
    setStock(salesData.stock ?? {});
    setPrices(salesData.prices ?? {});
    setSales(salesData.sales ?? []);
    setUses(useData.entries ?? []);
  }, [apiQuery]);

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, [loadData, cityFilter]);

  useEffect(() => {
    if (hasSaleItems) setAmountPaid(totalDue.toFixed(2));
  }, [totalDue, hasSaleItems]);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      if (useToastRef.current) clearTimeout(useToastRef.current);
    };
  }, []);

  function addProduct(productId: string) {
    setActiveCart((prev) => ({ ...prev, [productId]: (prev[productId] ?? 0) + 1 }));
    setError('');
  }

  function changeQty(productId: string, delta: number) {
    setActiveCart((prev) => {
      const next = (prev[productId] ?? 0) + delta;
      if (next <= 0) {
        const copy = { ...prev };
        delete copy[productId];
        return copy;
      }
      return { ...prev, [productId]: next };
    });
    setError('');
  }

  function resetSale() {
    setSaleCart({});
    setPaymentMethod('cash');
    setAmountPaid('');
    setError('');
    setReceipt(null);
    setCopied(false);
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
  }

  async function completeSale() {
    if (!hasSaleItems) return;
    if (requiresCitySelection) {
      setError(t('factorySales_selectCity'));
      return;
    }

    setSubmitting(true);
    setError('');

    const items = saleCartLines.map((line) => ({
      product_type_id: line.product.id,
      quantity: line.quantity,
    }));

    const res = await fetch(apiQuery('/api/factory-sales'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items,
        payment_method: paymentMethod,
        amount_paid: parseFloat(amountPaid),
        ...(writeCityId ? { cityId: writeCityId } : {}),
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? 'Sale failed');
      setSubmitting(false);
      return;
    }

    setReceipt(data.sale);
    setSaleCart({});
    setAmountPaid('');
    await loadData();
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(resetSale, 10000);
    setSubmitting(false);
  }

  async function recordUse() {
    if (!hasUseItems) return;
    if (requiresCitySelection) {
      setError(t('factorySales_selectCity'));
      return;
    }

    setSubmitting(true);
    setError('');

    const items = orderedProducts
      .filter((p) => (useCart[p.id] ?? 0) > 0)
      .map((p) => ({ product_type_id: p.id, quantity: useCart[p.id] }));

    const res = await fetch(apiQuery('/api/factory-use'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items,
        note: useNote || undefined,
        ...(writeCityId ? { cityId: writeCityId } : {}),
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? 'Failed to record use');
      setSubmitting(false);
      return;
    }

    setUseCart({});
    setUseNote('');
    setUseSuccess(true);
    await loadData();
    if (useToastRef.current) clearTimeout(useToastRef.current);
    useToastRef.current = setTimeout(() => setUseSuccess(false), 3000);
    setSubmitting(false);
  }

  async function copyReceipt() {
    if (!receipt?.whatsappSummary) return;
    await navigator.clipboard.writeText(receipt.whatsappSummary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function renderProductButtons(showPrice: boolean) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        {orderedProducts.map((product) => {
          const qty = stock[product.id] ?? 0;
          const unit =
            product.unit_type === 'pack' ? t('factorySales_packs') : t('factorySales_bottles');
          return (
            <button
              key={product.id}
              type="button"
              onClick={() => addProduct(product.id)}
              className="rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50 p-4 text-left hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition active:scale-[0.98]"
            >
              <p className="font-bold text-lg text-slate-900 dark:text-slate-100">
                {productLabel(product.name, t)}
              </p>
              <p className="text-sm text-muted mt-1">
                {t('factorySales_stock')}: {qty} {unit}
              </p>
              <div className="mt-2 h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    qty <=
                    (DEFAULT_LOW_STOCK_THRESHOLDS[
                      product.name as keyof typeof DEFAULT_LOW_STOCK_THRESHOLDS
                    ] ?? 0)
                      ? 'bg-red-500'
                      : 'bg-emerald-500'
                  }`}
                  style={{ width: `${stockBarWidth(product, stock)}%` }}
                />
              </div>
              {showPrice && (
                <p className="text-xs text-muted mt-1">${(prices[product.id] ?? 0).toFixed(2)} each</p>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  function renderSteppers() {
    return (
      <div className="mb-4">
        <h4 className="text-sm font-semibold text-muted uppercase tracking-wide mb-2">
          {t('factorySales_inCart')}
        </h4>
        {cartLines.length === 0 ? (
          <p className="text-sm text-muted py-4 text-center border border-dashed border-slate-200 dark:border-slate-700 rounded-lg">
            {t('factorySales_emptyCart')}
          </p>
        ) : (
          <div className="space-y-3">
            {cartLines.map((line) => (
              <div
                key={line.product.id}
                className="flex items-center justify-between gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg"
              >
                <div className="min-w-0">
                  <p className="font-semibold">{line.product.name}</p>
                  {activeTab === 'sale' && (
                    <p className="text-xs text-muted">
                      ${line.price.toFixed(2)} × {line.quantity} = ${line.subtotal.toFixed(2)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => changeQty(line.product.id, -1)}
                    className="min-w-[48px] min-h-[48px] rounded-lg bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-xl font-bold"
                  >
                    −
                  </button>
                  <span className="min-w-[2rem] text-center font-mono text-lg font-bold">
                    {line.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => changeQty(line.product.id, 1)}
                    className="min-w-[48px] min-h-[48px] rounded-lg bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-xl font-bold"
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <AppShell>
        <LoadingSpinner />
      </AppShell>
    );
  }

  const tabs: { id: TabId; label: TranslationKey }[] = [
    { id: 'sale', label: 'factorySales_tabSale' },
    { id: 'use', label: 'factorySales_tabUse' },
    { id: 'history', label: 'factorySales_tabHistory' },
  ];

  return (
    <AppShell>
      <h2 className="page-title mb-4">{t('factorySales_title')}</h2>

      <div className="flex gap-1 mb-6 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl max-w-lg">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setActiveTab(tab.id);
              setError('');
            }}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition ${
              activeTab === tab.id
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-muted hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {t(tab.label)}
          </button>
        ))}
      </div>

      {useSuccess && (
        <div className="mb-4 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200 text-sm p-3 rounded-lg border border-emerald-200 dark:border-emerald-800">
          {t('factorySales_useSuccess')}
        </div>
      )}

      {activeTab === 'history' ? (
        <section className="card max-w-2xl">
          <h3 className="text-lg font-bold mb-4">{t('factorySales_todayHistory')}</h3>
          {history.length === 0 ? (
            <p className="text-sm text-muted">{t('factorySales_noHistoryToday')}</p>
          ) : (
            <ul className="space-y-3">
              {history.map((row) => (
                <li
                  key={`${row.kind}-${row.id}`}
                  className="flex flex-wrap items-start justify-between gap-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg text-sm"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono font-semibold">{formatSaleTime(row.time)}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-semibold ${
                          row.kind === 'sale'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                            : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {row.kind === 'sale' ? t('factorySales_badgeSale') : t('factorySales_badgeUse')}
                      </span>
                    </div>
                    <p className="text-muted truncate">{row.itemsSummary}</p>
                    {row.kind === 'use' && row.note && (
                      <p className="text-xs text-muted mt-1 italic">{row.note}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    {row.kind === 'sale' ? (
                      <>
                        <p className="font-mono font-bold">${row.amount_paid.toFixed(2)}</p>
                        <span className="text-xs text-muted">
                          {row.payment_method === 'cash'
                            ? t('factorySales_cash')
                            : t('factorySales_transfer')}
                        </span>
                      </>
                    ) : (
                      <p className="font-mono text-muted">—</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <section className="card max-w-2xl">
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4">
            {activeTab === 'sale' ? t('factorySales_quickSale') : t('factorySales_useTitle')}
          </h3>

          {renderProductButtons(activeTab === 'sale')}
          {renderSteppers()}

          {activeTab === 'sale' && (
            <>
              <div className="text-center py-4 mb-4 border-y border-slate-200 dark:border-slate-700">
                <p className="text-sm text-muted uppercase tracking-wide">{t('factorySales_total')}</p>
                <p className="text-4xl font-mono font-bold">${totalDue.toFixed(2)}</p>
              </div>
              <div className="mb-4">
                <p className="text-sm font-medium mb-2">{t('factorySales_payment')}</p>
                <div className="grid grid-cols-2 gap-2">
                  {(['cash', 'transfer'] as const).map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setPaymentMethod(method)}
                      className={`min-h-[48px] rounded-xl font-semibold text-sm ${
                        paymentMethod === method
                          ? method === 'cash'
                            ? 'bg-emerald-600 text-white'
                            : 'bg-blue-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700'
                      }`}
                    >
                      {method === 'cash' ? t('factorySales_cash') : t('factorySales_transfer')}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">{t('factorySales_amountPaid')}</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(e.target.value)}
                  className="input-field font-mono text-lg"
                />
              </div>
              <button
                type="button"
                onClick={completeSale}
                disabled={!hasSaleItems || submitting}
                className="w-full min-h-[56px] rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-lg"
              >
                {submitting ? t('factorySales_processing') : t('factorySales_complete')}
              </button>
            </>
          )}

          {activeTab === 'use' && (
            <>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">{t('factorySales_useNote')}</label>
                <input
                  type="text"
                  value={useNote}
                  onChange={(e) => setUseNote(e.target.value)}
                  placeholder={t('factorySales_useNotePlaceholder')}
                  className="input-field"
                />
              </div>
              <button
                type="button"
                onClick={recordUse}
                disabled={!hasUseItems || submitting}
                className="w-full min-h-[56px] rounded-xl bg-slate-600 hover:bg-slate-700 disabled:opacity-50 text-white font-bold text-lg"
              >
                {submitting ? t('factorySales_processing') : t('factorySales_recordUse')}
              </button>
            </>
          )}

          {error && (
            <div className="mt-4 bg-red-50 dark:bg-red-900/20 text-red-700 text-sm p-3 rounded-lg">
              {error}
            </div>
          )}
        </section>
      )}

      {receipt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-xl font-bold mb-1">{t('factorySales_receipt')}</h3>
            <p className="font-mono text-lg text-muted mb-4">{formatSaleTime(receipt.sale_time)}</p>
            <ul className="space-y-2 mb-4 text-sm">
              {receipt.items.map((item, idx) => {
                const pt = item.product_types;
                return (
                  <li key={idx} className="flex justify-between gap-2">
                    <span>
                      {pt.name} × {item.quantity}{' '}
                      {unitLabel({ unit_type: pt.unit_type } as ProductType, item.quantity, t)}
                    </span>
                    <span className="font-mono">${Number(item.subtotal).toFixed(2)}</span>
                  </li>
                );
              })}
            </ul>
            <div className="flex justify-between py-3 border-t mb-4">
              <span className="font-semibold">{t('factorySales_total')}</span>
              <span className="font-mono text-2xl font-bold">
                ${Number(receipt.amount_paid).toFixed(2)}
              </span>
            </div>
            <pre className="text-xs bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg whitespace-pre-wrap mb-4 max-h-32 overflow-y-auto">
              {receipt.whatsappSummary}
            </pre>
            <div className="flex gap-2">
              <button type="button" onClick={copyReceipt} className="btn-primary flex-1">
                {copied ? t('factorySales_copied') : t('factorySales_copyWhatsapp')}
              </button>
              <button type="button" onClick={resetSale} className="btn-secondary flex-1">
                {t('factorySales_newSale')}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
