'use client';

import { useAppPreferences } from '@/contexts/AppPreferencesContext';

interface LoadingSpinnerProps {
  message?: string;
}

export default function LoadingSpinner({ message }: LoadingSpinnerProps) {
  const { t } = useAppPreferences();
  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted">
      <div className="w-8 h-8 border-3 border-blue-600 dark:border-blue-400 border-t-transparent rounded-full animate-spin mb-3" />
      <p className="text-sm">{message ?? t('loading')}</p>
    </div>
  );
}
