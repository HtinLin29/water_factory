'use client';

import { AppPreferencesProvider } from '@/contexts/AppPreferencesContext';
import { AuthProvider } from '@/contexts/AuthContext';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AppPreferencesProvider>
      <AuthProvider>{children}</AuthProvider>
    </AppPreferencesProvider>
  );
}
