'use client';

import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import StockCard from '@/components/StockCard';
import LoadingSpinner from '@/components/LoadingSpinner';
import { useAppPreferences } from '@/contexts/AppPreferencesContext';
import { useAuth } from '@/contexts/AuthContext';
import type { CityDashboardSnapshot, DriverStatus } from '@/lib/types';

interface DashboardData {
  stockCards: {
    productName: string;
    unitType: string;
    quantity: number;
    threshold: number;
    isLow: boolean;
    breakdown?: {
      usedInternallyToday: number;
      soldFactoryToday: number;
      dispatchedToday: number;
    };
  }[];
  driverStatuses: DriverStatus[];
  isSuperAdmin?: boolean;
  cityComparison?: CityDashboardSnapshot[];
}

export default function DashboardPage() {
  const { t } = useAppPreferences();
  const { apiQuery, cityFilter } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [summaryText, setSummaryText] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(apiQuery('/api/dashboard'))
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [apiQuery, cityFilter]);

  async function copySummary() {
    const res = await fetch(apiQuery('/api/summary-text'));
    const json = await res.json();
    await navigator.clipboard.writeText(json.text);
    setSummaryText(json.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function statusIcon(status: DriverStatus['status']) {
    if (status === 'settled') return '✅';
    if (status === 'still_out') return '⏳';
    return '—';
  }

  function statusLabel(status: DriverStatus['status']) {
    if (status === 'settled') return t('dashboard_settled');
    if (status === 'still_out') return t('dashboard_stillOut');
    return t('dashboard_didNotGo');
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
      <h2 className="page-title mb-6">{t('dashboard_title')}</h2>

      {data?.cityComparison && data.cityComparison.length > 0 && (
        <section className="mb-8">
          <h3 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3">
            {t('city_todayComparison')}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {data.cityComparison.map((city) => (
              <div key={city.cityId} className="card">
                <h4 className="font-bold text-lg mb-3">{city.cityName} {t('city_today')}</h4>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-muted">{t('city_stock20L')}</p>
                    <p className="font-semibold text-lg">{city.stock20L}</p>
                  </div>
                  <div>
                    <p className="text-muted">{t('city_soldToday')}</p>
                    <p className="font-semibold text-lg">{city.soldToday}</p>
                  </div>
                  <div>
                    <p className="text-muted">{t('city_driversOut')}</p>
                    <p className="font-semibold text-lg">{city.driversStillOut}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mb-8">
        <h3 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3">
          {t('dashboard_currentStock')}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {data?.stockCards.map((card) => (
            <StockCard
              key={card.productName}
              productName={card.productName}
              quantity={card.quantity}
              unitLabel={card.unitType === 'pack' ? t('packs') : t('bottles')}
              threshold={card.threshold}
              isLow={card.isLow}
              breakdown={card.breakdown}
            />
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h3 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3">
          {t('dashboard_driverStatus')}
        </h3>
        <div className="card">
          {!data?.driverStatuses.length ? (
            <p className="text-muted text-sm">{t('dashboard_noDrivers')}</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-700">
              {data.driverStatuses.map((ds) => (
                <li key={ds.driver.id} className="py-3 flex items-center justify-between">
                  <span className="font-medium text-slate-800 dark:text-slate-200">{ds.driver.name}</span>
                  <span className="text-sm text-slate-600 dark:text-slate-400">
                    {statusIcon(ds.status)} {statusLabel(ds.status)}
                    {ds.outDispatches.length > 0 && (
                      <span className="text-amber-600 ml-2">
                        ({ds.outDispatches.map((d) => {
                          const pt = d.product_types as { name: string };
                          return `${d.quantity_taken} ${pt?.name}`;
                        }).join(', ')})
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section>
        <button onClick={copySummary} className="btn-primary">
          {copied ? `✓ ${t('dashboard_copied')}` : `📋 ${t('dashboard_copySummary')}`}
        </button>
        {summaryText && (
          <pre className="mt-4 bg-slate-100 dark:bg-slate-900 rounded-lg p-4 text-sm whitespace-pre-wrap font-mono text-slate-800 dark:text-slate-200">
            {summaryText}
          </pre>
        )}
      </section>
    </AppShell>
  );
}
