'use client';

import { useState } from 'react';
import { useAppPreferences } from '@/contexts/AppPreferencesContext';
import type { StockBreakdown } from '@/lib/types';

interface StockCardProps {
  productName: string;
  quantity: number;
  unitLabel: string;
  threshold: number;
  isLow: boolean;
  breakdown?: StockBreakdown;
}

export default function StockCard({
  productName,
  quantity,
  unitLabel,
  threshold,
  isLow,
  breakdown,
}: StockCardProps) {
  const { t } = useAppPreferences();
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`card ${
        isLow ? 'border-amber-400 dark:border-amber-500 ring-1 ring-amber-200 dark:ring-amber-800' : ''
      }`}
    >
      <button
        type="button"
        onClick={() => breakdown && setExpanded((v) => !v)}
        className={`w-full text-left ${breakdown ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted font-medium">{productName}</p>
            <p className="text-3xl font-bold text-slate-900 dark:text-slate-100 mt-1">
              {quantity}
              <span className="text-base font-normal text-muted ml-1">{unitLabel}</span>
            </p>
          </div>
          {isLow && (
            <span className="bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 text-xs font-semibold px-2 py-1 rounded-full">
              {t('dashboard_lowStock')}
            </span>
          )}
        </div>
        <p className="text-xs text-muted mt-2">{t('dashboard_alertBelow')} {threshold}</p>
        {breakdown && (
          <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
            {expanded ? t('dashboard_hideBreakdown') : t('dashboard_showBreakdown')}
          </p>
        )}
      </button>

      {expanded && breakdown && (
        <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 text-xs space-y-1">
          <p>
            <span className="text-muted">{t('dashboard_stockCurrent')}:</span>{' '}
            <strong>{quantity}</strong>
          </p>
          <p>
            <span className="text-muted">{t('dashboard_usedInternally')}:</span>{' '}
            <strong>{breakdown.usedInternallyToday}</strong>
          </p>
          <p>
            <span className="text-muted">{t('dashboard_soldFactory')}:</span>{' '}
            <strong>{breakdown.soldFactoryToday}</strong>
          </p>
          <p>
            <span className="text-muted">{t('dashboard_dispatchedDrivers')}:</span>{' '}
            <strong>{breakdown.dispatchedToday}</strong>
          </p>
        </div>
      )}
    </div>
  );
}
