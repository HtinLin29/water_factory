'use client';

import { useAppPreferences } from '@/contexts/AppPreferencesContext';

export default function PreferencesBar({ className = '' }: { className?: string }) {
  const { language, theme, setLanguage, toggleTheme, t } = useAppPreferences();

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex rounded-lg overflow-hidden border border-white/20 dark:border-slate-600 text-xs">
        <button
          type="button"
          onClick={() => setLanguage('en')}
          className={`px-2.5 py-1.5 transition ${
            language === 'en'
              ? 'bg-white text-blue-700 font-medium'
              : 'bg-blue-600/50 text-white hover:bg-blue-600/70'
          }`}
          title={t('english')}
        >
          EN
        </button>
        <button
          type="button"
          onClick={() => setLanguage('my')}
          className={`px-2.5 py-1.5 transition ${
            language === 'my'
              ? 'bg-white text-blue-700 font-medium'
              : 'bg-blue-600/50 text-white hover:bg-blue-600/70'
          }`}
          title={t('myanmar')}
        >
          မြန်
        </button>
      </div>
      <button
        type="button"
        onClick={toggleTheme}
        className="p-1.5 rounded-lg bg-blue-600/50 hover:bg-blue-600/70 text-white transition text-sm"
        title={theme === 'dark' ? t('lightMode') : t('darkMode')}
        aria-label={theme === 'dark' ? t('lightMode') : t('darkMode')}
      >
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>
    </div>
  );
}

export function PreferencesBarLight() {
  const { language, theme, setLanguage, toggleTheme, t } = useAppPreferences();

  return (
    <div className="flex items-center justify-center gap-2 mb-4">
      <div className="flex rounded-lg overflow-hidden border border-slate-200 dark:border-slate-600 text-xs">
        <button
          type="button"
          onClick={() => setLanguage('en')}
          className={`px-2.5 py-1.5 transition ${
            language === 'en'
              ? 'bg-blue-600 text-white font-medium'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
          }`}
        >
          EN
        </button>
        <button
          type="button"
          onClick={() => setLanguage('my')}
          className={`px-2.5 py-1.5 transition ${
            language === 'my'
              ? 'bg-blue-600 text-white font-medium'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
          }`}
        >
          မြန်
        </button>
      </div>
      <button
        type="button"
        onClick={toggleTheme}
        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 transition text-sm"
        aria-label={theme === 'dark' ? t('lightMode') : t('darkMode')}
      >
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>
    </div>
  );
}
