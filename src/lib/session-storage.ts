/** Client-side session keys — cleared on logout and before each login. */
export const CITY_FILTER_KEY = 'wf-city-filter';
export const LOGIN_CONTEXT_KEY = 'wf-login-context';

export type LoginContext =
  | { type: 'super_admin' }
  | { type: 'manager'; cityId: string; cityName: string };

export function clearAppSessionStorage() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(CITY_FILTER_KEY);
  localStorage.removeItem(LOGIN_CONTEXT_KEY);
}

export function saveLoginContext(ctx: LoginContext) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LOGIN_CONTEXT_KEY, JSON.stringify(ctx));
  if (ctx.type === 'super_admin') {
    localStorage.setItem(CITY_FILTER_KEY, 'both');
  } else {
    localStorage.removeItem(CITY_FILTER_KEY);
  }
}

export function readLoginContext(): LoginContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LOGIN_CONTEXT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LoginContext;
  } catch {
    return null;
  }
}
