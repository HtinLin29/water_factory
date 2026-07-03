'use client';

import { useState } from 'react';
import AppShell from '@/components/AppShell';
import DateRangePicker from '@/components/DateRangePicker';
import { todayISO } from '@/lib/date-utils';
import { useAppPreferences } from '@/contexts/AppPreferencesContext';
import { useAuth } from '@/contexts/AuthContext';

export default function ExportPage() {
  const { t } = useAppPreferences();
  const { apiQuery } = useAuth();
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState(todayISO());
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    const params = new URLSearchParams({ startDate, endDate });
    const res = await fetch(apiQuery(`/api/export?${params}`));
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `water-factory-export-${startDate}-to-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExporting(false);
  }

  return (
    <AppShell>
      <h2 className="page-title mb-6">{t('export_title')}</h2>
      <div className="card max-w-lg space-y-6">
        <p className="text-sm text-muted">{t('export_desc')}</p>
        <DateRangePicker startDate={startDate} endDate={endDate} onStartChange={setStartDate} onEndChange={setEndDate} />
        <button onClick={handleExport} disabled={exporting} className="btn-primary">
          {exporting ? t('export_exporting') : `📥 ${t('export_download')}`}
        </button>
      </div>
    </AppShell>
  );
}
