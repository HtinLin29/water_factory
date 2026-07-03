'use client';

import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import LoadingSpinner from '@/components/LoadingSpinner';
import { DEFAULT_LOW_STOCK_THRESHOLDS } from '@/lib/constants';
import type { City, LowStockThresholds, ProductType } from '@/lib/types';

interface Manager {
  id: string;
  name: string;
  email: string;
  role?: string;
  city_id?: string | null;
  cities?: { id: string; name: string } | null;
}

import { useAppPreferences } from '@/contexts/AppPreferencesContext';

export default function SettingsPage() {
  const { t } = useAppPreferences();
  const [products, setProducts] = useState<ProductType[]>([]);
  const [prices, setPrices] = useState<Record<string, { price: number; effective_from: string }[]>>({});
  const [thresholds, setThresholds] = useState<LowStockThresholds>(DEFAULT_LOW_STOCK_THRESHOLDS);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const [newPrice, setNewPrice] = useState({ productId: '', price: '', effectiveFrom: '' });
  const [newManager, setNewManager] = useState({ name: '', email: '', password: '', cityId: '' });

  async function loadSettings() {
    const res = await fetch('/api/settings');
    const data = await res.json();
    setProducts(data.products ?? []);
    setThresholds(data.thresholds);
    setManagers(data.managers ?? []);
    setCities(data.cities ?? []);
    setIsSuperAdmin(data.isSuperAdmin ?? false);

    if (data.cities?.length && !newManager.cityId) {
      setNewManager((prev) => ({ ...prev, cityId: data.cities[0].id }));
    }

    const priceMap: Record<string, { price: number; effective_from: string }[]> = {};
    for (const p of data.prices ?? []) {
      if (!priceMap[p.product_type_id]) priceMap[p.product_type_id] = [];
      priceMap[p.product_type_id].push({
        price: Number(p.price),
        effective_from: p.effective_from,
      });
    }
    setPrices(priceMap);

    if (data.products?.length && !newPrice.productId) {
      setNewPrice((prev) => ({ ...prev, productId: data.products[0].id }));
    }
  }

  useEffect(() => {
    loadSettings().finally(() => setLoading(false));
  }, []);

  async function addPrice(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'price',
        productTypeId: newPrice.productId,
        price: parseFloat(newPrice.price),
        effectiveFrom: newPrice.effectiveFrom || undefined,
      }),
    });
    if (res.ok) {
      setMessage(t('settings_priceAdded'));
      setNewPrice((prev) => ({ ...prev, price: '', effectiveFrom: '' }));
      await loadSettings();
    }
  }

  async function saveThresholds(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'thresholds', thresholds }),
    });
    if (res.ok) {
      setMessage(t('settings_thresholdsSaved'));
    }
  }

  async function updatePackSize(productId: string, packSize: number) {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'pack_size', productTypeId: productId, packSize }),
    });
    setMessage(t('settings_packSizeUpdated'));
    await loadSettings();
  }

  async function addManager(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/managers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newManager.name,
        email: newManager.email,
        password: newManager.password,
        cityId: newManager.cityId,
        role: 'manager',
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setMessage(t('settings_managerAdded'));
      setNewManager({ name: '', email: '', password: '', cityId: cities[0]?.id ?? '' });
      await loadSettings();
    } else {
      setMessage(data.error);
    }
  }

  async function removeManager(id: string) {
    if (!confirm(t('settings_removeManagerConfirm'))) return;
    const res = await fetch(`/api/managers?id=${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) {
      setMessage(t('settings_managerRemoved'));
      await loadSettings();
    } else {
      setMessage(data.error);
    }
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
      <h2 className="page-title mb-6">{t('settings_title')}</h2>
      {message && (
        <div className="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-sm p-3 rounded-lg mb-4">{message}</div>
      )}

      <div className="space-y-8 max-w-2xl">
        <section className="card">
          <h3 className="font-semibold mb-4">{t('settings_prices')}</h3>
          <p className="text-xs text-muted mb-3">
            {t('settings_pricesHint')}
          </p>
          {products.map((p) => (
            <div key={p.id} className="mb-3 text-sm">
              <strong>{p.name}</strong>: $
              {prices[p.id]?.[0]?.price.toFixed(2) ?? '0.00'} ({t('settings_current')})
              {prices[p.id]?.length > 1 && (
                <span className="text-muted ml-2">
                  ({prices[p.id].length} {t('settings_priceRecords')})
                </span>
              )}
            </div>
          ))}
          <form onSubmit={addPrice} className="flex flex-wrap gap-2 mt-4">
            <select
              value={newPrice.productId}
              onChange={(e) => setNewPrice({ ...newPrice, productId: e.target.value })}
              className="input-field max-w-[120px]"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder={t('settings_newPrice')}
              value={newPrice.price}
              onChange={(e) => setNewPrice({ ...newPrice, price: e.target.value })}
              className="input-field max-w-[120px]"
              required
            />
            <input
              type="datetime-local"
              value={newPrice.effectiveFrom}
              onChange={(e) => setNewPrice({ ...newPrice, effectiveFrom: e.target.value })}
              className="input-field max-w-[200px]"
            />
            <button type="submit" className="btn-primary text-sm">{t('settings_addPrice')}</button>
          </form>
        </section>

        <section className="card">
          <h3 className="font-semibold mb-4">{t('settings_packSizes')}</h3>
          {products
            .filter((p) => p.unit_type === 'pack')
            .map((p) => (
              <div key={p.id} className="flex items-center gap-3 mb-3">
                <span className="text-sm w-16">{p.name}</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  defaultValue={p.pack_size ?? 10}
                  onBlur={(e) => updatePackSize(p.id, parseInt(e.target.value, 10))}
                  className="input-field max-w-[100px]"
                />
                <span className="text-xs text-muted">{t('settings_bottlesPerPack')}</span>
              </div>
            ))}
        </section>

        <section className="card">
          <h3 className="font-semibold mb-4">{t('settings_lowStock')}</h3>
          <form onSubmit={saveThresholds} className="space-y-3">
            {(['20L', '350ml', '1L'] as const).map((key) => (
              <div key={key} className="flex items-center gap-3">
                <span className="text-sm w-16">{key}</span>
                <input
                  type="number"
                  min="0"
                  value={thresholds[key]}
                  onChange={(e) =>
                    setThresholds({ ...thresholds, [key]: parseInt(e.target.value, 10) })
                  }
                  className="input-field max-w-[100px]"
                />
              </div>
            ))}
            <button type="submit" className="btn-primary text-sm">{t('settings_saveThresholds')}</button>
          </form>
        </section>

        <section className="card">
          <h3 className="font-semibold mb-4">{t('settings_managers')}</h3>
          <ul className="mb-4 space-y-2">
            {managers.map((m) => (
              <li key={m.id} className="flex items-center justify-between text-sm gap-2">
                <span>
                  {m.name} ({m.email})
                  {m.cities?.name && (
                    <span className="text-muted ml-1">— {m.cities.name}</span>
                  )}
                  {m.role === 'super_admin' && (
                    <span className="text-muted ml-1">— Super Admin</span>
                  )}
                </span>
                {isSuperAdmin && (
                  <button onClick={() => removeManager(m.id)} className="text-red-600 text-xs hover:underline shrink-0">
                    {t('remove')}
                  </button>
                )}
              </li>
            ))}
          </ul>
          {isSuperAdmin ? (
          <form onSubmit={addManager} className="space-y-2">
            <input
              type="text"
              placeholder={t('name')}
              value={newManager.name}
              onChange={(e) => setNewManager({ ...newManager, name: e.target.value })}
              className="input-field"
              required
            />
            <input
              type="email"
              placeholder={t('settings_email')}
              value={newManager.email}
              onChange={(e) => setNewManager({ ...newManager, email: e.target.value })}
              className="input-field"
              required
            />
            <input
              type="password"
              placeholder={t('settings_password')}
              value={newManager.password}
              onChange={(e) => setNewManager({ ...newManager, password: e.target.value })}
              className="input-field"
              required
              minLength={6}
            />
            <select
              value={newManager.cityId}
              onChange={(e) => setNewManager({ ...newManager, cityId: e.target.value })}
              className="input-field"
              required
            >
              {cities.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button type="submit" className="btn-primary text-sm">{t('settings_addManager')}</button>
          </form>
          ) : (
            <p className="text-sm text-muted">{t('settings_superAdminOnly')}</p>
          )}
        </section>
      </div>
    </AppShell>
  );
}
