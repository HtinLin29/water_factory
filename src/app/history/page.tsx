'use client';

import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import LoadingSpinner from '@/components/LoadingSpinner';
import { formatDisplayDate } from '@/lib/date-utils';

interface DayActivity {
  date: string;
  production: Record<string, unknown>[];
  restocks: Record<string, unknown>[];
  dispatches: Record<string, unknown>[];
  settlements: Record<string, unknown>[];
}

import { useAppPreferences } from '@/contexts/AppPreferencesContext';
import { useAuth } from '@/contexts/AuthContext';

export default function HistoryPage() {
  const { t } = useAppPreferences();
  const { apiQuery, cityFilter } = useAuth();
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [activity, setActivity] = useState<DayActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDay, setLoadingDay] = useState(false);

  useEffect(() => {
    fetch(apiQuery('/api/history'), { method: 'POST' })
      .then((r) => r.json())
      .then((data) => {
        setDates(data.dates ?? []);
        if (data.dates?.length) setSelectedDate(data.dates[0]);
      })
      .finally(() => setLoading(false));
  }, [apiQuery, cityFilter]);

  useEffect(() => {
    if (!selectedDate) return;
    setLoadingDay(true);
    fetch(apiQuery(`/api/history?date=${selectedDate}`))
      .then((r) => r.json())
      .then((data) => setActivity(data))
      .finally(() => setLoadingDay(false));
  }, [selectedDate, apiQuery, cityFilter]);

  if (loading) {
    return (
      <AppShell>
        <LoadingSpinner />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <h2 className="page-title mb-6">{t('history_title')}</h2>
      <p className="text-sm text-muted mb-4">{t('history_subtitle')}</p>

      <div className="mb-6">
        <select
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="input-field max-w-xs"
        >
          {dates.map((d) => (
            <option key={d} value={d}>
              {formatDisplayDate(d)}
            </option>
          ))}
        </select>
      </div>

      {loadingDay ? (
        <LoadingSpinner />
      ) : activity ? (
        <div className="space-y-6">
          <section className="card">
            <h3 className="font-semibold mb-3">{t('history_production')}</h3>
            {activity.production.length === 0 ? (
              <p className="text-sm text-muted">{t('history_noProduction')}</p>
            ) : (
              <ul className="text-sm space-y-1">
                {activity.production.map((p) => {
                  const pt = p.product_types as { name: string };
                  return (
                    <li key={p.id as string}>
                      {pt.name}: {t('history_produced')} {p.quantity_produced as number} ({t('history_stock')}: {p.current_stock as number})
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="card">
            <h3 className="font-semibold mb-3">{t('history_restocks')}</h3>
            {activity.restocks.length === 0 ? (
              <p className="text-sm text-muted">{t('history_noRestocks')}</p>
            ) : (
              <ul className="text-sm space-y-1">
                {activity.restocks.map((r) => {
                  const pt = r.product_types as { name: string };
                  return (
                    <li key={r.id as string}>
                      {pt.name}: +{r.packs_added as number} {t('history_packsAdded')}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="card">
            <h3 className="font-semibold mb-3">{t('history_dispatches')}</h3>
            {activity.dispatches.length === 0 ? (
              <p className="text-sm text-muted">{t('history_noDispatches')}</p>
            ) : (
              <ul className="text-sm space-y-1">
                {activity.dispatches.map((d) => {
                  const driver = d.drivers as { name: string };
                  const pt = d.product_types as { name: string };
                  return (
                    <li key={d.id as string}>
                      {driver.name}: {d.quantity_taken as number} {pt.name} — {d.status as string}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="card">
            <h3 className="font-semibold mb-3">{t('history_settlements')}</h3>
            {activity.settlements.length === 0 ? (
              <p className="text-sm text-muted">{t('history_noSettlements')}</p>
            ) : (
              <ul className="text-sm space-y-1">
                {activity.settlements.map((s) => {
                  const d = s.dispatches as {
                    drivers: { name: string };
                    product_types: { name: string };
                  };
                  return (
                    <li key={s.id as string}>
                      {d.drivers.name} ({d.product_types.name}): {t('reports_sold')} {s.quantity_sold as number},
                      {t('reports_returned')} {s.quantity_returned as number}, cash ${Number(s.cash_received).toFixed(2)}
                      {Number(s.cash_discrepancy) !== 0 && (
                        <span className="text-red-600"> (discrepancy: ${Number(s.cash_discrepancy).toFixed(2)})</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}
