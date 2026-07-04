'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { clearAppSessionStorage } from '@/lib/session-storage';
import { useAppPreferences } from '@/contexts/AppPreferencesContext';
import { useAuth } from '@/contexts/AuthContext';
import PreferencesBar from '@/components/PreferencesBar';
import type { TranslationKey } from '@/lib/i18n/translations';

const navItems: { href: string; labelKey: TranslationKey; icon: string; exact?: boolean }[] = [
  { href: '/dashboard', labelKey: 'nav_dashboard', icon: '📊' },
  { href: '/production', labelKey: 'nav_production', icon: '🏭' },
  { href: '/factory-sales', labelKey: 'nav_factorySales', icon: '🏪' },
  { href: '/drivers', labelKey: 'nav_drivers', icon: '🚚' },
  { href: '/driver-detail', labelKey: 'nav_driverDetail', icon: '👤', exact: true },
  { href: '/reports', labelKey: 'nav_reports', icon: '📈' },
  { href: '/history', labelKey: 'nav_history', icon: '📅' },
  { href: '/assistant', labelKey: 'nav_assistant', icon: '💬' },
  { href: '/export', labelKey: 'nav_export', icon: '📥' },
  { href: '/settings', labelKey: 'nav_settings', icon: '⚙️' },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useAppPreferences();
  const { manager, isSuperAdmin, cities, cityFilter, setCityFilter, loginContext } = useAuth();

  async function handleLogout() {
    const supabase = createClient();
    clearAppSessionStorage();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  function branchLabel(): string {
    if (!manager) return '';
    if (isSuperAdmin) {
      if (cityFilter === 'both') return t('city_allBranches');
      const city = cities.find((c) => c.id === cityFilter);
      return city ? `${city.name} ${t('city_branch')}` : t('city_allBranches');
    }
    const cityName =
      manager.cityName ??
      (loginContext?.type === 'manager' ? loginContext.cityName : null);
    return cityName ? `${cityName} ${t('city_branch')}` : '';
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <header className="bg-blue-700 dark:bg-slate-800 text-white shadow-md">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-2xl shrink-0">💧</span>
            <div className="min-w-0">
              <h1 className="text-lg font-bold truncate">{t('appName')}</h1>
              {branchLabel() && (
                <p className="text-xs text-blue-100 dark:text-slate-300 truncate">{branchLabel()}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            {isSuperAdmin && cities.length > 0 && (
              <div className="flex rounded-lg overflow-hidden border border-white/20 text-xs">
                {cities.map((city) => (
                  <button
                    key={city.id}
                    type="button"
                    onClick={() => setCityFilter(city.id)}
                    className={`px-2 py-1 transition ${
                      cityFilter === city.id
                        ? 'bg-white text-blue-700 font-medium'
                        : 'bg-blue-600/50 hover:bg-blue-600/70'
                    }`}
                  >
                    {city.name}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setCityFilter('both')}
                  className={`px-2 py-1 transition ${
                    cityFilter === 'both'
                      ? 'bg-white text-blue-700 font-medium'
                      : 'bg-blue-600/50 hover:bg-blue-600/70'
                  }`}
                >
                  {t('city_both')}
                </button>
              </div>
            )}
            <PreferencesBar />
            <button
              onClick={handleLogout}
              className="text-sm bg-blue-600 hover:bg-blue-500 dark:bg-slate-700 dark:hover:bg-slate-600 px-3 py-1.5 rounded-lg transition"
            >
              {t('logout')}
            </button>
          </div>
        </div>
      </header>

      <nav className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10 overflow-x-auto">
        <div className="max-w-6xl mx-auto px-4 flex gap-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`px-3 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition ${
                (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + '/'))
                  ? 'border-blue-600 text-blue-700 dark:text-blue-400 dark:border-blue-400'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400'
              }`}
            >
              <span className="mr-1">{item.icon}</span>
              {t(item.labelKey)}
            </Link>
          ))}
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
