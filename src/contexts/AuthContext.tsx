'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { City, ManagerRole } from '@/lib/types';

const CITY_FILTER_KEY = 'wf-city-filter';

interface AuthManager {
  id: string;
  name: string;
  email: string;
  role: ManagerRole;
  city_id: string | null;
  cityName: string | null;
}

interface AuthContextValue {
  manager: AuthManager | null;
  cities: City[];
  isSuperAdmin: boolean;
  cityFilter: string;
  setCityFilter: (cityId: string) => void;
  loading: boolean;
  refresh: () => Promise<void>;
  apiQuery: (baseUrl: string) => string;
  /** City UUID for write requests. Null only when super admin has "Both" selected. */
  writeCityId: string | null;
  /** True when super admin must pick a specific city before saving. */
  requiresCitySelection: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [manager, setManager] = useState<AuthManager | null>(null);
  const [cities, setCities] = useState<City[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [cityFilter, setCityFilterState] = useState('both');
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (!res.ok) {
        setManager(null);
        setCities([]);
        setIsSuperAdmin(false);
        setCityFilterState('both');
        return;
      }
      const data = await res.json();
      setManager(data.manager);
      setCities(data.cities ?? []);
      setIsSuperAdmin(data.isSuperAdmin);

      if (data.isSuperAdmin) {
        const saved = localStorage.getItem(CITY_FILTER_KEY);
        setCityFilterState(saved ?? 'both');
      } else if (data.manager?.city_id) {
        localStorage.removeItem(CITY_FILTER_KEY);
        setCityFilterState(data.manager.city_id);
      }
    } catch {
      setManager(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setCityFilter = useCallback(
    (cityId: string) => {
      if (!isSuperAdmin) return;
      setCityFilterState(cityId);
      localStorage.setItem(CITY_FILTER_KEY, cityId);
    },
    [isSuperAdmin]
  );

  const apiQuery = useCallback(
    (baseUrl: string) => {
      if (!isSuperAdmin) return baseUrl;
      const param =
        cityFilter !== 'both' ? `cityId=${encodeURIComponent(cityFilter)}` : 'cityId=both';
      return baseUrl.includes('?') ? `${baseUrl}&${param}` : `${baseUrl}?${param}`;
    },
    [isSuperAdmin, cityFilter]
  );

  const requiresCitySelection = isSuperAdmin && cityFilter === 'both';

  const writeCityId = isSuperAdmin
    ? cityFilter === 'both'
      ? null
      : cityFilter
    : manager?.city_id ?? null;

  return (
    <AuthContext.Provider
      value={{
        manager,
        cities,
        isSuperAdmin,
        cityFilter,
        setCityFilter,
        loading,
        refresh,
        apiQuery,
        writeCityId,
        requiresCitySelection,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
