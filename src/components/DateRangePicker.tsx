'use client';

import { useAppPreferences } from '@/contexts/AppPreferencesContext';

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onStartChange: (date: string) => void;
  onEndChange: (date: string) => void;
}

export default function DateRangePicker({
  startDate,
  endDate,
  onStartChange,
  onEndChange,
}: DateRangePickerProps) {
  const { t } = useAppPreferences();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div>
        <label className="block text-xs text-muted mb-1">{t('from')}</label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => onStartChange(e.target.value)}
          className="input-field"
        />
      </div>
      <div>
        <label className="block text-xs text-muted mb-1">{t('to')}</label>
        <input
          type="date"
          value={endDate}
          onChange={(e) => onEndChange(e.target.value)}
          className="input-field"
        />
      </div>
    </div>
  );
}
