'use client';

import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import DateRangePicker from '@/components/DateRangePicker';
import LoadingSpinner from '@/components/LoadingSpinner';
import { todayISO } from '@/lib/date-utils';
import type { ReportSummary, DriverLeaderboardEntry, FactorySalesSummary, FactoryUseSummary } from '@/lib/types';

import { useAppPreferences } from '@/contexts/AppPreferencesContext';
import { useAuth } from '@/contexts/AuthContext';

export default function ReportsPage() {
  const { t } = useAppPreferences();
  const { apiQuery, cityFilter } = useAuth();
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState(todayISO());
  const [leaderboardPeriod, setLeaderboardPeriod] = useState('week');
  const [summaries, setSummaries] = useState<ReportSummary[]>([]);
  const [factorySummaries, setFactorySummaries] = useState<FactorySalesSummary[]>([]);
  const [factoryUseSummaries, setFactoryUseSummaries] = useState<FactoryUseSummary[]>([]);
  const [factoryUseTotals, setFactoryUseTotals] = useState({ useCount: 0, totalEquivalentValue: 0 });
  const [summariesByCity, setSummariesByCity] = useState<ReportSummary[]>([]);
  const [combinedRevenue, setCombinedRevenue] = useState(0);
  const [factorySalesCount, setFactorySalesCount] = useState(0);
  const [leaderboard, setLeaderboard] = useState<DriverLeaderboardEntry[]>([]);
  const [summaryText, setSummaryText] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  async function loadReports() {
    setLoading(true);
    const params = new URLSearchParams({
      startDate,
      endDate,
      leaderboard: leaderboardPeriod,
    });
    const res = await fetch(apiQuery(`/api/reports?${params}`));
    const data = await res.json();
    setSummaries(data.summaries ?? []);
    setFactorySummaries(data.factorySummaries ?? []);
    setFactoryUseSummaries(data.factoryUseSummaries ?? []);
    setFactoryUseTotals(data.factoryUseTotals ?? { useCount: 0, totalEquivalentValue: 0 });
    setSummariesByCity(data.summariesByCity ?? []);
    setCombinedRevenue(data.combinedRevenue ?? 0);
    setFactorySalesCount(data.factoryTotals?.salesCount ?? 0);
    setLeaderboard(data.leaderboard ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadReports();
  }, [startDate, endDate, leaderboardPeriod, apiQuery, cityFilter]);

  async function copySummary() {
    const res = await fetch(apiQuery(`/api/summary-text?date=${startDate}`));
    const data = await res.json();
    setSummaryText(data.text);
    await navigator.clipboard.writeText(data.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <AppShell>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h2 className="page-title">{t('reports_title')}</h2>
        <DateRangePicker
          startDate={startDate}
          endDate={endDate}
          onStartChange={setStartDate}
          onEndChange={setEndDate}
        />
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : (
        <>
          <section className="mb-8">
            <h3 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3">
              {t('reports_driverSales')}
            </h3>
            <div className="grid gap-4">
              {summaries.map((s) => (
                <div key={s.productType.id} className="card">
                  <h4 className="font-bold text-slate-900 dark:text-slate-100 mb-3">{s.productType.name}</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                    <div>
                      <p className="text-muted">
                        {s.productType.is_daily_cycle ? t('reports_produced') : t('reports_restocked')}
                      </p>
                      <p className="font-semibold">{s.totalProduced}</p>
                    </div>
                    <div>
                      <p className="text-muted">{t('reports_dispatched')}</p>
                      <p className="font-semibold">{s.totalDispatched}</p>
                    </div>
                    <div>
                      <p className="text-muted">{t('reports_sold')}</p>
                      <p className="font-semibold">{s.totalSold}</p>
                    </div>
                    <div>
                      <p className="text-muted">{t('reports_returned')}</p>
                      <p className="font-semibold">{s.totalReturned}</p>
                    </div>
                    <div>
                      <p className="text-muted">{t('reports_revenue')}</p>
                      <p className="font-semibold">${s.totalRevenue.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-muted">{t('reports_cashDiscrepancy')}</p>
                      <p className={`font-semibold ${s.totalCashDiscrepancy !== 0 ? 'text-red-600' : ''}`}>
                        ${s.totalCashDiscrepancy.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="mb-8">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <h3 className="text-sm font-semibold text-muted uppercase tracking-wide">
                {t('reports_factorySales')}
              </h3>
              <span className="text-xs text-muted">
                ({t('reports_factorySalesCount', { n: factorySalesCount })})
              </span>
            </div>
            <div className="grid gap-4">
              {factorySummaries.map((s) => (
                <div key={`factory-${s.productType.id}`} className="card border-l-4 border-l-blue-500">
                  <h4 className="font-bold text-slate-900 dark:text-slate-100 mb-3">{s.productType.name}</h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-muted">{t('reports_sold')}</p>
                      <p className="font-semibold">{s.quantitySold}</p>
                    </div>
                    <div>
                      <p className="text-muted">{t('reports_revenue')}</p>
                      <p className="font-semibold">${s.revenue.toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="mb-8">
            <h3 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3">
              {t('reports_factoryUse')}
            </h3>
            <div className="grid gap-4">
              {factoryUseSummaries.map((s) => (
                <div key={`use-${s.productType.id}`} className="card border-l-4 border-l-slate-400">
                  <h4 className="font-bold text-slate-900 dark:text-slate-100 mb-3">{s.productType.name}</h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-muted">{t('reports_quantityUsed')}</p>
                      <p className="font-semibold">{s.quantityUsed}</p>
                    </div>
                    <div>
                      <p className="text-muted">{t('reports_equivalentValue')}</p>
                      <p className="font-semibold">${s.equivalentValue.toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-sm text-muted mt-4">
              {t('reports_stockLostInternal', {
                units: factoryUseSummaries.reduce((sum, s) => sum + s.quantityUsed, 0),
                value: factoryUseTotals.totalEquivalentValue.toFixed(2),
              })}
            </p>
          </section>

          <section className="mb-8">
            <div className="card bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
              <p className="text-sm text-muted uppercase tracking-wide">{t('reports_combinedTotal')}</p>
              <p className="text-3xl font-mono font-bold text-slate-900 dark:text-slate-100">
                ${combinedRevenue.toFixed(2)}
              </p>
            </div>
          </section>

          {summariesByCity.length > 0 && (
            <section className="mb-8">
              <h3 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3">
                {t('reports_cityBreakdown')}
              </h3>
              <div className="card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted border-b dark:border-slate-700">
                      <th className="pb-2 pr-4">{t('reports_city')}</th>
                      <th className="pb-2 pr-4">{t('reports_produced')}</th>
                      <th className="pb-2 pr-4">{t('reports_sold')}</th>
                      <th className="pb-2 pr-4">{t('reports_revenue')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summariesByCity.map((s) => (
                      <tr key={`${s.cityId}-${s.productType.id}`} className="border-b border-slate-50 dark:border-slate-800">
                        <td className="py-2 pr-4">{s.cityName} — {s.productType.name}</td>
                        <td className="py-2 pr-4">{s.totalProduced}</td>
                        <td className="py-2 pr-4">{s.totalSold}</td>
                        <td className="py-2 pr-4">${s.totalRevenue.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="mb-8">
            <div className="flex items-center gap-3 mb-3">
              <h3 className="text-sm font-semibold text-muted uppercase tracking-wide">
                {t('reports_leaderboard')}
              </h3>
              <select
                value={leaderboardPeriod}
                onChange={(e) => setLeaderboardPeriod(e.target.value)}
                className="text-sm input-field max-w-[140px] py-1"
              >
                <option value="week">{t('reports_thisWeek')}</option>
                <option value="month">{t('reports_thisMonth')}</option>
              </select>
            </div>
            <div className="card">
              {leaderboard.length === 0 ? (
                <p className="text-muted text-sm">{t('reports_noSales')}</p>
              ) : (
                <ol className="space-y-2">
                  {leaderboard.map((entry, i) => (
                    <li key={entry.driver.id} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-700 last:border-0">
                      <span>
                        <span className="text-muted mr-2">#{i + 1}</span>
                        <span className="font-medium">{entry.driver.name}</span>
                      </span>
                      <span className="text-sm text-slate-600 dark:text-slate-400">
                        {t('reports_soldCount', { n: entry.totalSold })}
                        {Object.entries(entry.byProduct).map(([p, q]) => (
                          <span key={p} className="ml-2 text-slate-400">
                            ({p}: {q})
                          </span>
                        ))}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </section>

          <button onClick={copySummary} className="btn-primary">
            {copied ? `✓ ${t('reports_copied')}` : `📋 ${t('reports_copySummary')}`}
          </button>
          {summaryText && (
            <pre className="mt-4 bg-slate-100 dark:bg-slate-900 rounded-lg p-4 text-sm whitespace-pre-wrap font-mono text-slate-800 dark:text-slate-200">
              {summaryText}
            </pre>
          )}
        </>
      )}
    </AppShell>
  );
}
