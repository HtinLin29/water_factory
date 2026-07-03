import type { ManagerRole } from '@/lib/types';

export interface ManagerRecord {
  id: string;
  name: string;
  email: string;
  city_id: string | null;
  role: ManagerRole;
  cities?: { id: string; name: string } | null;
}

export function isSuperAdmin(manager: ManagerRecord): boolean {
  return manager.role === 'super_admin';
}

export class CityAccessDeniedError extends Error {
  constructor() {
    super('Access denied to another city');
    this.name = 'CityAccessDeniedError';
  }
}

/** Branch managers are locked to their city_id; super_admin may use cityId param. */
export function resolveCityIds(
  manager: ManagerRecord,
  cityIdParam?: string | null
): string[] | null {
  if (isSuperAdmin(manager)) {
    if (!cityIdParam || cityIdParam === 'both') return null;
    return [cityIdParam];
  }
  if (!manager.city_id) {
    throw new Error('Manager account has no city assigned');
  }
  if (cityIdParam && cityIdParam !== 'both' && cityIdParam !== manager.city_id) {
    throw new CityAccessDeniedError();
  }
  return [manager.city_id];
}

export function getCityFilterFromRequest(
  request: Request,
  manager: ManagerRecord
): { cityIds: string[] | null; cityIdParam: string } {
  const { searchParams } = new URL(request.url);
  const param = searchParams.get('cityId');

  if (isSuperAdmin(manager)) {
    const cityIdParam = param ?? 'both';
    return { cityIds: resolveCityIds(manager, cityIdParam), cityIdParam };
  }

  if (param && param !== 'both' && manager.city_id && param !== manager.city_id) {
    throw new CityAccessDeniedError();
  }

  return {
    cityIds: resolveCityIds(manager, manager.city_id),
    cityIdParam: manager.city_id!,
  };
}

/** City ID required for write operations. Super admin must pick a specific city (not "both"). */
export function requireWriteCityId(
  manager: ManagerRecord,
  cityIdParam?: string | null
): string {
  if (isSuperAdmin(manager)) {
    if (!cityIdParam || cityIdParam === 'both') {
      throw new Error('Select a specific city for this action');
    }
    return cityIdParam;
  }
  if (!manager.city_id) {
    throw new Error('Manager account has no city assigned');
  }
  return manager.city_id;
}

export function writeCityFromBody(
  manager: ManagerRecord,
  bodyCityId?: string | null
): string {
  if (!isSuperAdmin(manager)) {
    if (!manager.city_id) {
      throw new Error('Manager account has no city assigned');
    }
    if (bodyCityId && bodyCityId !== manager.city_id) {
      throw new CityAccessDeniedError();
    }
    return manager.city_id;
  }
  return requireWriteCityId(manager, bodyCityId);
}

// Supabase query builders have deep generics; keep this loosely typed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyCityFilter(query: any, cityIds: string[] | null, column = 'city_id'): any {
  if (cityIds === null) return query;
  if (cityIds.length === 1) return query.eq(column, cityIds[0]);
  return query.in(column, cityIds);
}

export function cityQueryString(cityIdParam: string): string {
  return cityIdParam && cityIdParam !== 'both' ? `cityId=${cityIdParam}` : '';
}

export function appendCityParam(url: string, cityIdParam: string): string {
  if (!cityIdParam || cityIdParam === 'both') return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}cityId=${encodeURIComponent(cityIdParam)}`;
}
