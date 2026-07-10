'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAppPreferences } from '@/contexts/AppPreferencesContext';
import { useAuth } from '@/contexts/AuthContext';
import { PreferencesBarLight } from '@/components/PreferencesBar';
import { clearAppSessionStorage, saveLoginContext } from '@/lib/session-storage';
import type { City } from '@/lib/types';

type LoginAccountType = 'super_admin' | 'city_manager';

export default function LoginPage() {
  const { t } = useAppPreferences();
  const { refresh } = useAuth();
  const [accountType, setAccountType] = useState<LoginAccountType>('city_manager');
  const [selectedCityId, setSelectedCityId] = useState('');
  const [cities, setCities] = useState<City[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/auth/cities')
      .then((r) => r.json())
      .then((data) => {
        const list: City[] = data.cities ?? [];
        setCities(list);
        if (list.length) {
          setSelectedCityId((prev) => prev || list[0].id);
        }
      })
      .catch(() => {});
  }, []);

  async function verifyAccountMatch() {
    const meRes = await fetch('/api/auth/me');
    if (!meRes.ok) return t('login_verifyFailed');
    const me = await meRes.json();

    if (accountType === 'super_admin') {
      if (!me.isSuperAdmin) {
        return t('login_notSuperAdmin');
      }
      saveLoginContext({ type: 'super_admin' });
      return null;
    }

    if (me.isSuperAdmin) {
      return t('login_useSuperAdminLogin');
    }

    if (!me.manager?.city_id) {
      return t('city_notAssigned');
    }

    if (me.manager.city_id !== selectedCityId) {
      const expected = cities.find((c) => c.id === selectedCityId)?.name ?? t('login_selectedCity');
      const actual = me.manager.cityName ?? t('login_unknownCity');
      return t('login_wrongCity', { expected, actual });
    }

    const cityName = me.manager.cityName ?? cities.find((c) => c.id === selectedCityId)?.name ?? '';
    saveLoginContext({ type: 'manager', cityId: selectedCityId, cityName });
    return null;
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (accountType === 'city_manager' && !selectedCityId) {
      setError(t('login_selectCityFirst'));
      setLoading(false);
      return;
    }

    clearAppSessionStorage();

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    const mismatch = await verifyAccountMatch();
    if (mismatch) {
      await supabase.auth.signOut();
      setError(mismatch);
      setLoading(false);
      return;
    }

    await refresh();
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-700 to-blue-900 dark:from-slate-900 dark:to-slate-950 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md p-8">
        <PreferencesBarLight />
        <div className="text-center mb-8">
          <span className="text-4xl">💧</span>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-2">{t('appName')}</h1>
          <p className="text-muted text-sm mt-1">{t('login_title')}</p>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-sm p-3 rounded-lg mb-4">{error}</div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              {t('login_accountType')}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAccountType('super_admin')}
                className={`min-h-[44px] rounded-xl text-sm font-semibold border-2 transition ${
                  accountType === 'super_admin'
                    ? 'border-blue-600 bg-blue-50 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200'
                    : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300'
                }`}
              >
                {t('login_superAdmin')}
              </button>
              <button
                type="button"
                onClick={() => setAccountType('city_manager')}
                className={`min-h-[44px] rounded-xl text-sm font-semibold border-2 transition ${
                  accountType === 'city_manager'
                    ? 'border-blue-600 bg-blue-50 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200'
                    : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300'
                }`}
              >
                {t('login_cityManager')}
              </button>
            </div>
          </div>
          {accountType === 'city_manager' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t('login_selectCity')}
              </label>
              <select
                value={selectedCityId}
                onChange={(e) => setSelectedCityId(e.target.value)}
                className="input-field"
                required
              >
                {cities.map((city) => (
                  <option key={city.id} value={city.id}>
                    {city.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('login_email')}</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input-field" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('login_password')}</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input-field" required minLength={6} />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? t('login_pleaseWait') : t('login_signIn')}
          </button>
        </form>
      </div>
    </div>
  );
}
