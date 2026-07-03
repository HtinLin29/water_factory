'use client';

import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { useAppPreferences } from '@/contexts/AppPreferencesContext';
import { useAuth } from '@/contexts/AuthContext';

interface Message {
  role: 'user' | 'assistant';
  text: string;
}

export default function AssistantPage() {
  const { t } = useAppPreferences();
  const { apiQuery } = useAuth();
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setMessages([{ role: 'assistant', text: t('assistant_welcome') }]);
  }, [t]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    const userMessage = query.trim();
    setMessages((prev) => [...prev, { role: 'user', text: userMessage }]);
    setQuery('');
    setLoading(true);
    const res = await fetch(apiQuery('/api/assistant'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: userMessage }),
    });
    const data = await res.json();
    setMessages((prev) => [...prev, { role: 'assistant', text: data.answer }]);
    setLoading(false);
  }

  return (
    <AppShell>
      <h2 className="page-title mb-2">{t('assistant_title')}</h2>
      <p className="text-sm text-muted mb-6">{t('assistant_subtitle')}</p>
      <div className="card max-w-2xl">
        <div className="space-y-4 mb-4 max-h-96 overflow-y-auto">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`rounded-lg px-4 py-2 max-w-[80%] text-sm whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200'
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}
          {loading && <p className="text-sm text-muted">{t('assistant_thinking')}</p>}
        </div>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('assistant_placeholder')}
            className="input-field"
          />
          <button type="submit" disabled={loading} className="btn-primary whitespace-nowrap">
            {t('assistant_ask')}
          </button>
        </form>
      </div>
    </AppShell>
  );
}
