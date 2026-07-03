'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAppPreferences } from '@/contexts/AppPreferencesContext';
import { PreferencesBarLight } from '@/components/PreferencesBar';

export default function LoginPage() {
  const { t } = useAppPreferences();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSetup, setIsSetup] = useState(false);
  const [setupName, setSetupName] = useState('');
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }
    router.push('/dashboard');
    router.refresh();
  }

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await fetch('/api/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name: setupName }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      setLoading(false);
      return;
    }
    const supabase = createClient();
    await supabase.auth.signInWithPassword({ email, password });
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

        <form onSubmit={isSetup ? handleSetup : handleLogin} className="space-y-4">
          {isSetup && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('login_yourName')}</label>
              <input type="text" value={setupName} onChange={(e) => setSetupName(e.target.value)} className="input-field" required />
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
            {loading ? t('login_pleaseWait') : isSetup ? t('login_createAccount') : t('login_signIn')}
          </button>
        </form>

        <p className="text-center text-xs text-muted mt-6">
          {isSetup ? (
            <button onClick={() => setIsSetup(false)} className="text-blue-600 dark:text-blue-400 hover:underline">
              {t('login_backToLogin')}
            </button>
          ) : (
            <button onClick={() => setIsSetup(true)} className="text-blue-600 dark:text-blue-400 hover:underline">
              {t('login_firstTime')}
            </button>
          )}
        </p>
      </div>
    </div>
  );
}
