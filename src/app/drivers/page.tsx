'use client';

import Link from 'next/link';
import { useEffect, useState, useCallback } from 'react';
import AppShell from '@/components/AppShell';
import LoadingSpinner from '@/components/LoadingSpinner';
import LicenseCaptureField from '@/components/LicenseCaptureField';
import { useAppPreferences } from '@/contexts/AppPreferencesContext';
import { useAuth } from '@/contexts/AuthContext';
import type { DriverSummary, ProductType, Dispatch } from '@/lib/types';

type ModalType = 'dispatch' | 'settle' | 'payment' | 'addDriver';

export default function DriversPage() {
  const { t } = useAppPreferences();
  const { apiQuery, writeCityId, requiresCitySelection, cityFilter, isSuperAdmin, manager } = useAuth();
  const [driverSummaries, setDriverSummaries] = useState<DriverSummary[]>([]);
  const [products, setProducts] = useState<ProductType[]>([]);
  const [stock, setStock] = useState<Record<string, number>>({});
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [activeModal, setActiveModal] = useState<{
    type: ModalType;
    driverId: string;
    driverName: string;
    dispatch?: Dispatch;
  } | null>(null);
  const [formProduct, setFormProduct] = useState('');
  const [formQuantity, setFormQuantity] = useState('');
  const [formSold, setFormSold] = useState('');
  const [formCash, setFormCash] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formSalary, setFormSalary] = useState('');
  const [formLicenseFront, setFormLicenseFront] = useState<File | null>(null);
  const [formLicenseBack, setFormLicenseBack] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [outDispatches, setOutDispatches] = useState<Dispatch[]>([]);

  const loadData = useCallback(async () => {
    const [driversRes, prodRes, settingsRes, dispatchesRes] = await Promise.all([
      fetch(apiQuery('/api/drivers')),
      fetch(apiQuery('/api/production')),
      fetch('/api/settings'),
      fetch(apiQuery('/api/dispatches?status=out')),
    ]);

    const driversData = await driversRes.json();
    const prodData = await prodRes.json();
    const settingsData = await settingsRes.json();
    const dispatchesData = await dispatchesRes.json();

    setDriverSummaries(driversData.drivers ?? []);
    setOutDispatches(dispatchesData.dispatches ?? []);
    setProducts(prodData.products ?? []);

    const stockMap: Record<string, number> = {};
    for (const s of prodData.stock ?? []) {
      stockMap[s.product_type_id] = s.current_quantity;
    }
    setStock(stockMap);

    const priceMap: Record<string, number> = {};
    const seen = new Set<string>();
    for (const p of settingsData.prices ?? []) {
      if (!seen.has(p.product_type_id)) {
        priceMap[p.product_type_id] = Number(p.price);
        seen.add(p.product_type_id);
      }
    }
    setPrices(priceMap);

    if (prodData.products?.length && !formProduct) {
      setFormProduct(prodData.products[0].id);
    }
  }, [formProduct, apiQuery, cityFilter]);

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  async function handleAddDriver(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    if (requiresCitySelection) {
      setError(t('city_selectCity'));
      setSubmitting(false);
      return;
    }
    if (!isSuperAdmin && !manager?.city_id) {
      setError(t('city_notAssigned'));
      setSubmitting(false);
      return;
    }

    const formData = new FormData();
    formData.append('name', formName);
    formData.append('phone', formPhone);
    formData.append('salary', formSalary);
    if (writeCityId) formData.append('cityId', writeCityId);
    if (formLicenseFront) formData.append('licenseFront', formLicenseFront);
    if (formLicenseBack) formData.append('licenseBack', formLicenseBack);

    const res = await fetch(apiQuery('/api/drivers/profile'), { method: 'POST', body: formData });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? 'Failed to add driver');
    } else {
      setActiveModal(null);
      setFormName('');
      setFormPhone('');
      setFormSalary('');
      setFormLicenseFront(null);
      setFormLicenseBack(null);
      await loadData();
    }
    setSubmitting(false);
  }

  async function handleDispatch(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    if (requiresCitySelection) {
      setError(t('city_selectCity'));
      setSubmitting(false);
      return;
    }
    if (!isSuperAdmin && !manager?.city_id) {
      setError(t('city_notAssigned'));
      setSubmitting(false);
      return;
    }
    const res = await fetch(apiQuery('/api/dispatches'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        driverId: activeModal?.driverId,
        productTypeId: formProduct,
        quantity: parseInt(formQuantity, 10),
        ...(writeCityId ? { cityId: writeCityId } : {}),
      }),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error);
    else {
      setActiveModal(null);
      setFormQuantity('');
      await loadData();
    }
    setSubmitting(false);
  }

  async function handleSettle(e: React.FormEvent) {
    e.preventDefault();
    const soldQty = parseInt(formSold, 10);
    const takenQty = activeModal?.dispatch?.quantity_taken ?? 0;

    if (!Number.isInteger(soldQty) || soldQty < 0) {
      setError('Enter a valid quantity sold');
      return;
    }
    if (soldQty > takenQty) {
      setError(t('drivers_cannotSellMore', { taken: takenQty }));
      return;
    }

    setSubmitting(true);
    setError('');
    const res = await fetch('/api/settlements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dispatchId: activeModal?.dispatch?.id,
        quantitySold: soldQty,
        cashReceived: parseFloat(formCash),
        notes: formNotes || null,
      }),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error);
    else {
      setActiveModal(null);
      setFormSold('');
      setFormCash('');
      setFormNotes('');
      await loadData();
    }
    setSubmitting(false);
  }

  async function handlePayment(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    const res = await fetch('/api/drivers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'payment',
        driverId: activeModal?.driverId,
        amount: parseFloat(paymentAmount),
        notes: paymentNotes || null,
      }),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error);
    else {
      setActiveModal(null);
      setPaymentAmount('');
      setPaymentNotes('');
      await loadData();
    }
    setSubmitting(false);
  }

  function getOutDispatch(driverId: string) {
    return outDispatches.filter((d) => d.driver_id === driverId);
  }

  const selectedProduct = products.find((p) => p.id === formProduct);
  const taken = activeModal?.dispatch?.quantity_taken ?? 0;
  const soldInvalid = formSold !== '' && (parseInt(formSold, 10) > taken || parseInt(formSold, 10) < 0);
  const returned = taken - (parseInt(formSold, 10) || 0);
  const price = activeModal?.dispatch
    ? prices[activeModal.dispatch.product_type_id] ?? 0
    : 0;
  const sold = Math.min(parseInt(formSold, 10) || 0, taken);
  const expectedCash = sold * price;
  const discrepancy = (parseFloat(formCash) || 0) - expectedCash;

  if (loading) {
    return (
      <AppShell>
        <LoadingSpinner />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
        <h2 className="page-title">{t('drivers_title')}</h2>
        <button
          onClick={() => {
            setActiveModal({ type: 'addDriver', driverId: '', driverName: '' });
            setError('');
            setFormName('');
            setFormPhone('');
            setFormSalary('');
          }}
          className="btn-primary text-sm"
        >
          + {t('drivers_addDriver')}
        </button>
      </div>
      <p className="text-sm text-muted mb-6">
        {t('drivers_hint')}{' '}
        <Link href="/driver-detail" className="text-blue-600 dark:text-blue-400 hover:underline">
          {t('nav_driverDetail')}
        </Link>
        .
      </p>

      <div className="grid gap-3">
        {driverSummaries.map((driver) => {
          const outs = getOutDispatch(driver.id);
          return (
            <div
              key={driver.id}
              className="card flex flex-wrap items-center justify-between gap-3 py-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-slate-900">{driver.name}</h3>
                  {driver.phone && (
                    <span className="text-xs text-slate-400">{driver.phone}</span>
                  )}
                  <Link
                    href={`/driver-detail?driverId=${driver.id}`}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    {t('drivers_viewProfile')} →
                  </Link>
                </div>
                <div className="flex flex-wrap gap-3 mt-1 text-sm">
                  {driver.owesShop > 0 && (
                    <span className="text-red-600 dark:text-red-400 font-medium">{t('drivers_owes')}: ${driver.owesShop.toFixed(2)}</span>
                  )}
                  {driver.creditBalance > 0 && (
                    <span className="text-green-600 dark:text-green-400">{t('drivers_credit')}: ${driver.creditBalance.toFixed(2)}</span>
                  )}
                  {outs.length > 0 && (
                    <span className="text-amber-600">
                      {t('drivers_out')}: {outs.map((d) => {
                        const pt = d.product_types as ProductType;
                        return `${d.quantity_taken} ${pt?.name}`;
                      }).join(', ')}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => {
                    setActiveModal({ type: 'dispatch', driverId: driver.id, driverName: driver.name });
                    setError('');
                    setFormQuantity('');
                  }}
                  className="btn-primary text-sm"
                >
                  {t('drivers_dispatch')}
                </button>
                {outs.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => {
                      setActiveModal({
                        type: 'settle',
                        driverId: driver.id,
                        driverName: driver.name,
                        dispatch: d,
                      });
                      setError('');
                      setFormSold('');
                      setFormCash('');
                    }}
                    className="btn-secondary text-sm"
                  >
                    {t('drivers_settle')} ({(d.product_types as ProductType)?.name})
                  </button>
                ))}
                {driver.owesShop > 0 && (
                  <button
                    onClick={() => {
                      setActiveModal({ type: 'payment', driverId: driver.id, driverName: driver.name });
                      setError('');
                      setPaymentAmount(String(driver.owesShop));
                      setPaymentNotes('');
                    }}
                    className="bg-amber-500 hover:bg-amber-600 text-white font-medium px-3 py-2 rounded-lg text-sm"
                  >
                    {t('drivers_payment')}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {activeModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-lg mb-4">
              {activeModal.type === 'dispatch' && `${t('drivers_dispatch')} — ${activeModal.driverName}`}
              {activeModal.type === 'settle' && `${t('drivers_settle')} — ${activeModal.driverName}`}
              {activeModal.type === 'payment' && `${t('drivers_recordPayment')} — ${activeModal.driverName}`}
              {activeModal.type === 'addDriver' && t('drivers_addNew')}
            </h3>

            {error && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg mb-4">{error}</div>}

            {activeModal.type === 'addDriver' && (
              <form onSubmit={handleAddDriver} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('name')} *</label>
                  <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} className="input-field" required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('phone')}</label>
                  <input type="tel" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('salary')}</label>
                  <input type="number" min="0" step="0.01" value={formSalary} onChange={(e) => setFormSalary(e.target.value)} className="input-field" />
                </div>
                <LicenseCaptureField
                  label={t('drivers_licenseFront')}
                  onChange={setFormLicenseFront}
                />
                <LicenseCaptureField
                  label={t('drivers_licenseBack')}
                  onChange={setFormLicenseBack}
                />
                <div className="flex gap-2">
                  <button type="submit" disabled={submitting} className="btn-primary">{t('drivers_addDriver')}</button>
                  <button type="button" onClick={() => setActiveModal(null)} className="btn-secondary">{t('cancel')}</button>
                </div>
              </form>
            )}

            {activeModal.type === 'dispatch' && (
              <form onSubmit={handleDispatch} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('drivers_product')}</label>
                  <select value={formProduct} onChange={(e) => setFormProduct(e.target.value)} className="input-field">
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (stock: {stock[p.id] ?? 0} {p.unit_type === 'pack' ? 'packs' : 'bottles'})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {t('drivers_quantity')} ({selectedProduct?.unit_type === 'pack' ? t('packs') : t('bottles')})
                  </label>
                  <input type="number" min="1" step="1" value={formQuantity} onChange={(e) => setFormQuantity(e.target.value)} className="input-field" required />
                </div>
                <div className="flex gap-2">
                  <button type="submit" disabled={submitting} className="btn-primary">{t('drivers_dispatch')}</button>
                  <button type="button" onClick={() => setActiveModal(null)} className="btn-secondary">{t('cancel')}</button>
                </div>
              </form>
            )}

            {activeModal.type === 'settle' && (
              <form onSubmit={handleSettle} className="space-y-4">
                <p className="text-sm text-slate-600">
                  {t('drivers_taken')}: <strong>{taken}</strong> {(activeModal.dispatch?.product_types as ProductType)?.name} @ ${price.toFixed(2)}
                </p>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('drivers_quantitySold')} ({t('drivers_max')} {taken})</label>
                  <input
                    type="number"
                    min="0"
                    max={taken}
                    step="1"
                    value={formSold}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '') { setFormSold(''); return; }
                      const num = parseInt(val, 10);
                      setFormSold(String(num > taken ? taken : num < 0 ? 0 : num));
                    }}
                    className={`input-field ${soldInvalid ? 'border-red-500' : ''}`}
                    required
                  />
                </div>
                <p className="text-sm text-muted">{t('drivers_returned')}: <strong>{soldInvalid ? '—' : Math.max(0, returned)}</strong></p>
                <p className="text-sm text-muted">{t('drivers_expectedCash')}: <strong>${soldInvalid ? '0.00' : expectedCash.toFixed(2)}</strong></p>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('drivers_cashReceived')}</label>
                  <input type="number" min="0" step="0.01" value={formCash} onChange={(e) => setFormCash(e.target.value)} className="input-field" required />
                </div>
                {formCash && !soldInvalid && (
                  <p className={`text-sm font-medium ${discrepancy !== 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {t('drivers_discrepancy')}: ${discrepancy.toFixed(2)}
                  </p>
                )}
                <div>
                  <label className="block text-sm font-medium mb-1">Notes (optional)</label>
                  <input type="text" value={formNotes} onChange={(e) => setFormNotes(e.target.value)} className="input-field" />
                </div>
                <div className="flex gap-2">
                  <button type="submit" disabled={submitting || soldInvalid || formSold === ''} className="btn-primary">{t('drivers_settle')}</button>
                  <button type="button" onClick={() => setActiveModal(null)} className="btn-secondary">{t('cancel')}</button>
                </div>
              </form>
            )}

            {activeModal.type === 'payment' && (
              <form onSubmit={handlePayment} className="space-y-4">
                <p className="text-sm text-muted">{t('drivers_paymentHint')}</p>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('drivers_amountReceived')}</label>
                  <input type="number" min="0.01" step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} className="input-field" required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('notes')} ({t('optional')})</label>
                  <input type="text" value={paymentNotes} onChange={(e) => setPaymentNotes(e.target.value)} className="input-field" />
                </div>
                <div className="flex gap-2">
                  <button type="submit" disabled={submitting} className="btn-primary">{t('drivers_recordPayment')}</button>
                  <button type="button" onClick={() => setActiveModal(null)} className="btn-secondary">{t('cancel')}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
