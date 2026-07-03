'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import AppShell from '@/components/AppShell';
import LoadingSpinner from '@/components/LoadingSpinner';
import LicenseCaptureField from '@/components/LicenseCaptureField';
import { todayISO, formatDisplayDate } from '@/lib/date-utils';
import { useAppPreferences } from '@/contexts/AppPreferencesContext';
import { useAuth } from '@/contexts/AuthContext';
import type { Driver, ProductType, Settlement } from '@/lib/types';

interface DaySales {
  date: string;
  dispatchCount: number;
  totalTaken: number;
  totalSold: number;
  totalReturned: number;
  totalExpectedCash: number;
  totalCashReceived: number;
  totalDiscrepancy: number;
  dispatches: Record<string, unknown>[];
}

interface DriverDetailData {
  driver: Driver;
  balanceOwed: number;
  owesShop: number;
  creditBalance: number;
  totalDispatchCount: number;
  dailySales: DaySales[];
  cashTransactions: Record<string, unknown>[];
  periodTotals: {
    dispatchCount: number;
    totalSold: number;
    totalRevenue: number;
    totalDiscrepancy: number;
  };
  dateRange: { startDate: string; endDate: string };
}

function DriverDetailContent() {
  const { t } = useAppPreferences();
  const { apiQuery, writeCityId, requiresCitySelection, cityFilter, isSuperAdmin, manager } = useAuth();
  const searchParams = useSearchParams();
  const initialDriverId = searchParams.get('driverId');

  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState(initialDriverId ?? '');
  const [detail, setDetail] = useState<DriverDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(todayISO());
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formSalary, setFormSalary] = useState('');
  const [formLicenseFront, setFormLicenseFront] = useState<File | null>(null);
  const [formLicenseBack, setFormLicenseBack] = useState<File | null>(null);
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [deactivatePassword, setDeactivatePassword] = useState('');
  const [deactivateError, setDeactivateError] = useState('');
  const [deactivating, setDeactivating] = useState(false);

  const loadDrivers = useCallback(async () => {
    const res = await fetch(apiQuery('/api/driver-detail'));
    const data = await res.json();
    setDrivers(data.drivers ?? []);
    if (!selectedDriverId && data.drivers?.length) {
      setSelectedDriverId(data.drivers[0].id);
    }
  }, [selectedDriverId]);

  const loadDetail = useCallback(async () => {
    if (!selectedDriverId) {
      setDetail(null);
      return;
    }
    setLoadingDetail(true);
    const params = new URLSearchParams({
      driverId: selectedDriverId,
      startDate,
      endDate,
    });
    const res = await fetch(apiQuery(`/api/driver-detail?${params}`));
    const data = await res.json();
    if (res.ok) setDetail(data);
    setLoadingDetail(false);
  }, [selectedDriverId, startDate, endDate, apiQuery, cityFilter]);

  useEffect(() => {
    loadDrivers().finally(() => setLoading(false));
  }, [loadDrivers]);

  useEffect(() => {
    if (initialDriverId) setSelectedDriverId(initialDriverId);
  }, [initialDriverId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  function resetForm() {
    setFormName('');
    setFormPhone('');
    setFormSalary('');
    setFormLicenseFront(null);
    setFormLicenseBack(null);
    setFormError('');
  }

  function populateEditForm() {
    if (!detail?.driver) return;
    setFormName(detail.driver.name);
    setFormPhone(detail.driver.phone ?? '');
    setFormSalary(detail.driver.salary != null ? String(detail.driver.salary) : '');
    setFormLicenseFront(null);
    setFormLicenseBack(null);
    setFormError('');
  }

  async function submitDriverForm(isEdit: boolean) {
    setSubmitting(true);
    setFormError('');

    const formData = new FormData();
    formData.append('name', formName);
    formData.append('phone', formPhone);
    formData.append('salary', formSalary);
    if (formLicenseFront) formData.append('licenseFront', formLicenseFront);
    if (formLicenseBack) formData.append('licenseBack', formLicenseBack);
    if (writeCityId) formData.append('cityId', writeCityId);

    if (isEdit && detail?.driver) {
      formData.append('driverId', detail.driver.id);
    }

    if (!isEdit && requiresCitySelection) {
      setFormError(t('city_selectCity'));
      setSubmitting(false);
      return;
    }
    if (!isEdit && !isSuperAdmin && !manager?.city_id) {
      setFormError(t('city_notAssigned'));
      setSubmitting(false);
      return;
    }

    const res = await fetch(apiQuery('/api/drivers/profile'), {
      method: isEdit ? 'PATCH' : 'POST',
      body: formData,
    });
    const data = await res.json();

    if (!res.ok) {
      setFormError(data.error ?? 'Failed to save driver');
      setSubmitting(false);
      return;
    }

    resetForm();
    setShowAddForm(false);
    setShowEditForm(false);
    await loadDrivers();
    if (data.driver?.id) setSelectedDriverId(data.driver.id);
    await loadDetail();
    setSubmitting(false);
  }

  async function handleDeactivateDriver() {
    if (!selectedDriverId) return;
    setDeactivating(true);
    setDeactivateError('');

    const res = await fetch(`/api/drivers?id=${selectedDriverId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: deactivatePassword }),
    });
    const data = await res.json();

    if (!res.ok) {
      setDeactivateError(
        res.status === 403 && data.error === 'Incorrect password'
          ? t('driverDetail_wrongPassword')
          : (data.error ?? 'Failed to deactivate driver')
      );
      setDeactivating(false);
      return;
    }

    setShowDeactivateModal(false);
    setDeactivatePassword('');
    setDetail(null);
    const resDrivers = await fetch(apiQuery('/api/driver-detail'));
    const driversData = await resDrivers.json();
    const remaining = (driversData.drivers ?? []) as Driver[];
    setDrivers(remaining);
    setSelectedDriverId(remaining[0]?.id ?? '');
    setDeactivating(false);
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
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h2 className="page-title">{t('driverDetail_title')}</h2>
        <button
          onClick={() => {
            resetForm();
            setShowAddForm(true);
            setShowEditForm(false);
          }}
          className="btn-primary text-sm"
        >
          + {t('drivers_addDriver')}
        </button>
      </div>

      {showAddForm && (
        <div className="card mb-6 border-blue-200 dark:border-blue-800 bg-blue-50/30 dark:bg-blue-900/20">
          <h3 className="font-semibold mb-4">{t('driverDetail_register')}</h3>
          <DriverProfileForm
            formName={formName}
            formPhone={formPhone}
            formSalary={formSalary}
            onNameChange={setFormName}
            onPhoneChange={setFormPhone}
            onSalaryChange={setFormSalary}
            onFrontChange={setFormLicenseFront}
            onBackChange={setFormLicenseBack}
            error={formError}
            submitting={submitting}
            onSubmit={() => submitDriverForm(false)}
            onCancel={() => {
              setShowAddForm(false);
              resetForm();
            }}
            submitLabel={t('drivers_addDriver')}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <aside className="lg:col-span-1">
          <div className="card">
            <h3 className="text-sm font-semibold text-muted uppercase mb-3">{t('driverDetail_drivers')}</h3>
            {drivers.length === 0 ? (
              <p className="text-sm text-muted">{t('driverDetail_noDrivers')}</p>
            ) : (
              <ul className="space-y-1">
                {drivers.map((d) => (
                  <li key={d.id}>
                    <button
                      onClick={() => {
                        setSelectedDriverId(d.id);
                        setShowEditForm(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition ${
                        selectedDriverId === d.id
                          ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 font-medium'
                          : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {d.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        <div className="lg:col-span-3 space-y-6">
          {!selectedDriverId ? (
            <div className="card text-muted text-sm">{t('driverDetail_selectDriver')}</div>
          ) : loadingDetail ? (
            <LoadingSpinner message="Loading driver..." />
          ) : detail ? (
            <>
              {showEditForm ? (
                <div className="card border-amber-200">
                  <h3 className="font-semibold mb-4">{t('driverDetail_editProfile')}</h3>
                  <DriverProfileForm
                    formName={formName}
                    formPhone={formPhone}
                    formSalary={formSalary}
                    onNameChange={setFormName}
                    onPhoneChange={setFormPhone}
                    onSalaryChange={setFormSalary}
                    onFrontChange={setFormLicenseFront}
                    onBackChange={setFormLicenseBack}
                    error={formError}
                    submitting={submitting}
                    onSubmit={() => submitDriverForm(true)}
                    onCancel={() => {
                      setShowEditForm(false);
                      resetForm();
                    }}
                    submitLabel={t('driverDetail_saveChanges')}
                    existingFront={detail.driver.license_front_url}
                    existingBack={detail.driver.license_back_url}
                  />
                </div>
              ) : (
                <div className="card">
                  <div className="flex flex-wrap justify-between gap-4 mb-4">
                    <div>
                      <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{detail.driver.name}</h3>
                      <p className="text-sm text-muted mt-1">
                        {t('driverDetail_joined')} {formatDisplayDate(detail.driver.created_at.split('T')[0])}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => {
                          populateEditForm();
                          setShowEditForm(true);
                          setShowAddForm(false);
                        }}
                        className="btn-secondary text-sm"
                      >
                        {t('driverDetail_editProfile')}
                      </button>
                      {isSuperAdmin && (
                        <button
                          type="button"
                          onClick={() => {
                            setDeactivatePassword('');
                            setDeactivateError('');
                            setShowDeactivateModal(true);
                          }}
                          className="btn-danger text-sm"
                        >
                          {t('driverDetail_deactivate')}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                    <InfoBox label={t('phone')} value={detail.driver.phone ?? '—'} />
                    <InfoBox
                      label={t('salary')}
                      value={
                        detail.driver.salary != null
                          ? `$${Number(detail.driver.salary).toFixed(2)}`
                          : '—'
                      }
                    />
                    <InfoBox label={t('driverDetail_totalDispatches')} value={String(detail.totalDispatchCount)} />
                    <InfoBox
                      label={t('driverDetail_cashBalance')}
                      value={
                        detail.owesShop > 0
                          ? `${t('drivers_owes')} $${detail.owesShop.toFixed(2)}`
                          : detail.creditBalance > 0
                            ? `${t('drivers_credit')} $${detail.creditBalance.toFixed(2)}`
                            : t('driverDetail_balanced')
                      }
                      highlight={detail.owesShop > 0 ? 'red' : detail.creditBalance > 0 ? 'green' : undefined}
                    />
                  </div>

                  {(detail.driver.license_front_url || detail.driver.license_back_url) && (
                    <div className="mb-6">
                      <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">{t('driverDetail_license')}</h4>
                      <div className="flex flex-wrap gap-4">
                        {detail.driver.license_front_url && (
                          <LicenseImage label={t('driverDetail_front')} url={detail.driver.license_front_url} />
                        )}
                        {detail.driver.license_back_url && (
                          <LicenseImage label={t('driverDetail_back')} url={detail.driver.license_back_url} />
                        )}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                    <Stat label={t('driverDetail_periodDispatches')} value={detail.periodTotals.dispatchCount} />
                    <Stat label={t('driverDetail_unitsSold')} value={detail.periodTotals.totalSold} />
                    <Stat label={t('driverDetail_revenue')} value={`$${detail.periodTotals.totalRevenue.toFixed(2)}`} />
                    <Stat
                      label={t('driverDetail_cashDiscrepancy')}
                      value={`$${detail.periodTotals.totalDiscrepancy.toFixed(2)}`}
                      alert={detail.periodTotals.totalDiscrepancy !== 0}
                    />
                  </div>
                </div>
              )}

              <div className="card">
                <div className="flex flex-wrap items-end gap-4 mb-4">
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex-1">{t('driverDetail_salesByDay')}</h3>
                  <div>
                    <label className="text-xs text-muted block">{t('from')}</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="input-field py-1 max-w-[160px]"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted block">{t('to')}</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="input-field py-1 max-w-[160px]"
                    />
                  </div>
                </div>

                {detail.dailySales.length === 0 ? (
                  <p className="text-sm text-muted">{t('driverDetail_noSales')}</p>
                ) : (
                  <div className="space-y-2">
                    {detail.dailySales.map((day) => (
                      <div key={day.date} className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                        <button
                          onClick={() =>
                            setExpandedDay(expandedDay === day.date ? null : day.date)
                          }
                          className="w-full flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 text-left text-sm"
                        >
                          <span className="font-medium">{formatDisplayDate(day.date)}</span>
                          <span className="text-slate-600 dark:text-slate-400">
                            {day.dispatchCount} {t('driverDetail_dispatches')} ·
                            {t('driverDetail_sold')} {day.totalSold} · ${day.totalExpectedCash.toFixed(2)}
                            {day.totalDiscrepancy !== 0 && (
                              <span className="text-red-600 ml-2">
                                ({t('driverDetail_diff')} ${day.totalDiscrepancy.toFixed(2)})
                              </span>
                            )}
                          </span>
                          <span className="text-muted">{expandedDay === day.date ? '▲' : '▼'}</span>
                        </button>
                        {expandedDay === day.date && (
                          <div className="px-4 py-3 overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-left text-muted border-b dark:border-slate-700">
                                  <th className="pb-2 pr-3">{t('driverDetail_time')}</th>
                                  <th className="pb-2 pr-3">{t('driverDetail_product')}</th>
                                  <th className="pb-2 pr-3">{t('drivers_taken')}</th>
                                  <th className="pb-2 pr-3">{t('driverDetail_sold')}</th>
                                  <th className="pb-2 pr-3">{t('drivers_returned')}</th>
                                  <th className="pb-2 pr-3">{t('driverDetail_expected')}</th>
                                  <th className="pb-2 pr-3">{t('driverDetail_received')}</th>
                                  <th className="pb-2">{t('driverDetail_diff')}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {day.dispatches.map((d) => {
                                  const pt = d.product_types as ProductType;
                                  const settlement = Array.isArray(d.settlements)
                                    ? (d.settlements[0] as Settlement)
                                    : (d.settlements as Settlement | undefined);
                                  const time = new Date(d.dispatched_at as string).toLocaleTimeString(
                                    'en-GB',
                                    { hour: '2-digit', minute: '2-digit' }
                                  );
                                  return (
                                    <tr key={d.id as string} className="border-b border-slate-50 dark:border-slate-800">
                                      <td className="py-2 pr-3">{time}</td>
                                      <td className="py-2 pr-3">{pt?.name}</td>
                                      <td className="py-2 pr-3">{d.quantity_taken as number}</td>
                                      <td className="py-2 pr-3">
                                        {settlement?.quantity_sold ?? '—'}
                                      </td>
                                      <td className="py-2 pr-3">
                                        {settlement?.quantity_returned ?? '—'}
                                      </td>
                                      <td className="py-2 pr-3">
                                        {settlement
                                          ? `$${Number(settlement.expected_cash).toFixed(2)}`
                                          : '—'}
                                      </td>
                                      <td className="py-2 pr-3">
                                        {settlement
                                          ? `$${Number(settlement.cash_received).toFixed(2)}`
                                          : '—'}
                                      </td>
                                      <td
                                        className={`py-2 ${
                                          settlement && Number(settlement.cash_discrepancy) !== 0
                                            ? 'text-red-600 font-medium'
                                            : ''
                                        }`}
                                      >
                                        {settlement
                                          ? `$${Number(settlement.cash_discrepancy).toFixed(2)}`
                                          : d.status === 'out'
                                            ? `⏳ ${t('driverDetail_statusOut')}`
                                            : '—'}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {detail.cashTransactions.length > 0 && (
                <div className="card">
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">{t('driverDetail_cashHistory')}</h3>
                  <ul className="text-sm space-y-2">
                    {detail.cashTransactions.map((tx) => (
                      <li
                        key={tx.id as string}
                        className="flex justify-between gap-4 py-2 border-b border-slate-50 dark:border-slate-800 last:border-0"
                      >
                        <span className="text-slate-600 dark:text-slate-400">
                          {formatDisplayDate((tx.created_at as string).split('T')[0])}{' '}
                          {tx.transaction_type === 'payment'
                            ? `💵 ${t('driverDetail_paymentTx')}`
                            : `⚠️ ${t('driverDetail_discrepancyTx')}`}
                          {tx.description ? (
                            <span className="text-muted block text-xs">{String(tx.description)}</span>
                          ) : null}
                        </span>
                        <span
                          className={
                            tx.transaction_type === 'payment'
                              ? 'text-green-600 font-medium'
                              : Number(tx.amount) < 0
                                ? 'text-red-600 font-medium'
                                : 'text-green-600'
                          }
                        >
                          {tx.transaction_type === 'payment'
                            ? `-$${Number(tx.amount).toFixed(2)}`
                            : `${Number(tx.amount) >= 0 ? '+' : ''}$${Number(tx.amount).toFixed(2)}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>

      {showDeactivateModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="font-bold text-lg mb-2 text-slate-900 dark:text-slate-100">
              {t('driverDetail_deactivateTitle')}
            </h3>
            <p className="text-sm text-muted mb-4">{t('driverDetail_deactivateWarning')}</p>
            {deactivateError && (
              <div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm p-3 rounded-lg mb-4">
                {deactivateError}
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleDeactivateDriver();
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium mb-1">{t('driverDetail_passwordConfirm')}</label>
                <input
                  type="password"
                  value={deactivatePassword}
                  onChange={(e) => setDeactivatePassword(e.target.value)}
                  className="input-field"
                  required
                  autoFocus
                />
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={deactivating || !deactivatePassword} className="btn-danger">
                  {deactivating ? t('login_pleaseWait') : t('driverDetail_deactivate')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowDeactivateModal(false);
                    setDeactivatePassword('');
                    setDeactivateError('');
                  }}
                  className="btn-secondary"
                >
                  {t('cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function InfoBox({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: 'red' | 'green';
}) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p
        className={`font-semibold ${
          highlight === 'red' ? 'text-red-600' : highlight === 'green' ? 'text-green-600' : 'text-slate-900 dark:text-slate-100'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function Stat({ label, value, alert }: { label: string; value: string | number; alert?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className={`font-bold ${alert ? 'text-red-600' : 'text-slate-900 dark:text-slate-100'}`}>{value}</p>
    </div>
  );
}

function LicenseImage({ label, url }: { label: string; url: string }) {
  const { t } = useAppPreferences();
  const isPdf = url.toLowerCase().includes('.pdf');
  return (
    <div>
      <p className="text-xs text-muted mb-1">{label}</p>
      {isPdf ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 text-sm underline">
          {t('driverDetail_viewPdf')}
        </a>
      ) : (
        <a href={url} target="_blank" rel="noopener noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={`License ${label}`}
            className="h-32 w-auto rounded-lg border border-slate-200 dark:border-slate-700 object-cover"
          />
        </a>
      )}
    </div>
  );
}

function DriverProfileForm({
  formName,
  formPhone,
  formSalary,
  onNameChange,
  onPhoneChange,
  onSalaryChange,
  onFrontChange,
  onBackChange,
  error,
  submitting,
  onSubmit,
  onCancel,
  submitLabel,
  existingFront,
  existingBack,
}: {
  formName: string;
  formPhone: string;
  formSalary: string;
  onNameChange: (v: string) => void;
  onPhoneChange: (v: string) => void;
  onSalaryChange: (v: string) => void;
  onFrontChange: (f: File | null) => void;
  onBackChange: (f: File | null) => void;
  error: string;
  submitting: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
  existingFront?: string | null;
  existingBack?: string | null;
}) {
  const { t } = useAppPreferences();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="grid grid-cols-1 sm:grid-cols-2 gap-4"
    >
      {error && (
        <div className="sm:col-span-2 bg-red-50 text-red-700 text-sm p-3 rounded-lg">{error}</div>
      )}
      <div>
        <label className="block text-sm font-medium mb-1">{t('name')} *</label>
        <input
          type="text"
          value={formName}
          onChange={(e) => onNameChange(e.target.value)}
          className="input-field"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">{t('phone')}</label>
        <input
          type="tel"
          value={formPhone}
          onChange={(e) => onPhoneChange(e.target.value)}
          className="input-field"
          placeholder="+95 9..."
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">{t('salary')}</label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={formSalary}
          onChange={(e) => onSalaryChange(e.target.value)}
          className="input-field"
          placeholder={t('driverDetail_monthlySalary')}
        />
      </div>
      <div>
        <LicenseCaptureField
          label={t('drivers_licenseFront')}
          hint={existingFront ? t('driverDetail_uploadReplace') : undefined}
          onChange={onFrontChange}
        />
      </div>
      <div>
        <LicenseCaptureField
          label={t('drivers_licenseBack')}
          hint={existingBack ? t('driverDetail_uploadReplace') : undefined}
          onChange={onBackChange}
        />
      </div>
      <div className="sm:col-span-2 flex gap-2">
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? t('production_saving') : submitLabel}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary">
          {t('cancel')}
        </button>
      </div>
    </form>
  );
}

export default function DriverDetailPage() {
  return (
    <Suspense fallback={<AppShell><LoadingSpinner /></AppShell>}>
      <DriverDetailContent />
    </Suspense>
  );
}
