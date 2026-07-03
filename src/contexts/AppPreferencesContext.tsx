'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  translate,
  type Language,
  type Theme,
  type TranslationKey,
} from '@/lib/i18n/translations';

const LANG_KEY = 'wf-language';
const THEME_KEY = 'wf-theme';

interface AppPreferencesContextValue {
  language: Language;
  theme: Theme;
  setLanguage: (lang: Language) => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const AppPreferencesContext = createContext<AppPreferencesContextValue | null>(null);

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

export function AppPreferencesProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('en');
  const [theme, setThemeState] = useState<Theme>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const savedLang = localStorage.getItem(LANG_KEY) as Language | null;
    const savedTheme = localStorage.getItem(THEME_KEY) as Theme | null;
    if (savedLang === 'en' || savedLang === 'my') setLanguageState(savedLang);
    if (savedTheme === 'light' || savedTheme === 'dark') {
      setThemeState(savedTheme);
      applyTheme(savedTheme);
    }
    setMounted(true);
  }, []);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem(LANG_KEY, lang);
    document.documentElement.lang = lang === 'my' ? 'my' : 'en';
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    localStorage.setItem(THEME_KEY, t);
    applyTheme(t);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem(THEME_KEY, next);
      applyTheme(next);
      return next;
    });
  }, []);

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>) =>
      translate(language, key, params),
    [language]
  );

  return (
    <AppPreferencesContext.Provider
      value={{ language, theme, setLanguage, setTheme, toggleTheme, t }}
    >
      {!mounted ? (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900">{children}</div>
      ) : (
        children
      )}
    </AppPreferencesContext.Provider>
  );
}

export function useAppPreferences() {
  const ctx = useContext(AppPreferencesContext);
  if (!ctx) {
    throw new Error('useAppPreferences must be used within AppPreferencesProvider');
  }
  return ctx;
}
