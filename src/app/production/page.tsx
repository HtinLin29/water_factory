'use client';

import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import LoadingSpinner from '@/components/LoadingSpinner';
import { useAppPreferences } from '@/contexts/AppPreferencesContext';
import { useAuth } from '@/contexts/AuthContext';
import type { ProductType, StockLedger } from '@/lib/types';

export default function ProductionPage() {
  const { t } = useAppPreferences();
  const { apiQuery, writeCityId, requiresCitySelection, cityFilter, isSuperAdmin, manager } = useAuth();
  const [products, setProducts] = useState<ProductType[]>([]);
  const [stock, setStock] = useState<StockLedger[]>([]);
  const [production, setProduction] = useState<Record<string, unknown>[]>([]);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [quantity, setQuantity] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [editId, setEditId] = useState('');
  const [editReason, setEditReason] = useState('');

  const selected = products.find((p) => p.id === selectedProduct);
  const todayEntries = production.filter(
    (p) => p.product_type_id === selectedProduct
  );
  const todayTotal = todayEntries.reduce(
    (sum, p) => sum + (p.quantity_produced as number),
    0
  );
  const currentStock = stock.find((s) => s.product_type_id === selectedProduct);

  async function loadData() {
    const res = await fetch(apiQuery('/api/production'));
    const data = await res.json();
    setProducts(data.products);
    setStock(data.stock);
    setProduction(data.production);
    if (!selectedProduct && data.products.length) {
      setSelectedProduct(data.products[0].id);
    }
  }

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, [cityFilter]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (requiresCitySelection) {
      setError(t('city_selectCity'));
      return;
    }
    if (!isSuperAdmin && !manager?.city_id) {
      setError(t('city_notAssigned'));
      return;
    }
    setSubmitting(true);
    setError('');
    setSuccess('');

    const qty = parseInt(quantity, 10);
    if (!Number.isInteger(qty) || qty <= 0) {
      setError(t('production_invalidQty'));
      setSubmitting(false);
      return;
    }

    if (editMode && selected?.is_daily_cycle) {
      const res = await fetch('/api/production', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editId,
          quantityProduced: qty,
          reason: editReason,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
      } else {
        setSuccess(t('production_updated'));
        setEditMode(false);
        setEditReason('');
        await loadData();
      }
    } else {
      const res = await fetch(apiQuery('/api/production'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: selected?.is_daily_cycle ? 'daily_production' : 'pack_restock',
          productTypeId: selectedProduct,
          quantity: qty,
          ...(writeCityId ? { cityId: writeCityId } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
      } else {
        setSuccess(
          selected?.is_daily_cycle
            ? t('production_added', { qty })
            : t('production_packsAdded', { qty })
        );
        setQuantity('');
        await loadData();
      }
    }
    setSubmitting(false);
  }

  function startEdit(entry: Record<string, unknown>) {
    setEditMode(true);
    setEditId(entry.id as string);
    setQuantity(String(entry.quantity_produced));
    setEditReason('');
  }

  if (loading) {
    return (
      <AppShell>
        <LoadingSpinner />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <h2 className="page-title mb-6">{t('production_title')}</h2>

      <div className="card max-w-lg">
        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('production_productType')}</label>
          <select
            value={selectedProduct}
            onChange={(e) => {
              setSelectedProduct(e.target.value);
              setEditMode(false);
              setQuantity('');
              setEditReason('');
            }}
            className="input-field"
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.unit_type === 'pack' ? t('packs') : t('bottles')})
              </option>
            ))}
          </select>
        </div>

        {selected?.is_daily_cycle ? (
          <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 mb-4 text-sm space-y-1">
            <p>
              {t('production_todayTotal')}: <strong>{todayTotal} {t('bottles')}</strong>
            </p>
            <p>
              {t('production_currentStock')}: <strong>{currentStock?.current_quantity ?? 0} {t('bottles')}</strong>
            </p>
            {todayEntries.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                <p className="text-muted mb-2">{t('production_todayEntries')}:</p>
                <ul className="space-y-1">
                  {todayEntries.map((entry) => (
                    <li key={entry.id as string} className="flex items-center justify-between">
                      <span>
                        +{entry.quantity_produced as number} {t('bottles')}
                        <span className="text-muted ml-2">
                          ({t('production_stockAfter')}: {entry.current_stock as number})
                        </span>
                      </span>
                      <button type="button" onClick={() => startEdit(entry)} className="text-blue-600 dark:text-blue-400 text-xs hover:underline">
                        {t('edit')}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 mb-4 text-sm">
            <p>
              {t('production_currentPackStock')}: <strong>{currentStock?.current_quantity ?? 0} {t('packs')}</strong>
            </p>
            <p className="text-muted mt-1">
              {selected?.pack_size} {t('production_packSize')}
            </p>
          </div>
        )}

        {error && <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-sm p-3 rounded-lg mb-4">{error}</div>}
        {success && <div className="bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-sm p-3 rounded-lg mb-4">{success}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              {editMode ? t('production_updatedQty') : selected?.is_daily_cycle ? t('production_bottlesToAdd') : t('production_packsToAdd')}
            </label>
            <input
              type="number"
              min="1"
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="input-field"
              required
            />
          </div>
          {editMode && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t('production_reasonEdit')}
              </label>
              <input
                type="text"
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                className="input-field"
                required
              />
            </div>
          )}
          <div className="flex gap-2">
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? t('production_saving') : editMode ? t('production_saveEdit') : selected?.is_daily_cycle ? t('production_addProduction') : t('production_addPacks')}
            </button>
            {editMode && (
              <button
                type="button"
                onClick={() => {
                  setEditMode(false);
                  setQuantity('');
                  setEditReason('');
                }}
                className="btn-secondary"
              >
                {t('cancel')}
              </button>
            )}
          </div>
        </form>
      </div>
    </AppShell>
  );
}
