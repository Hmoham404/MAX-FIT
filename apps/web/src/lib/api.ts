export const API_URL: string = (import.meta.env.VITE_API_URL as string) || 'https://maxfit-api.foot-arena-pro.workers.dev';

const TOKEN_KEY = 'maxfit_session';

/**
 * The session token is kept in sessionStorage (cleared when the browser/tab closes) and sent as a Bearer header.
 * The site (GitHub Pages) and the API (workers.dev) are on different domains, so third-party cookies would be blocked
 * by Safari/Chrome; a bearer token also makes classic CSRF impossible.
 */
export const session = {
  get: () => sessionStorage.getItem(TOKEN_KEY),
  set: (t: string) => sessionStorage.setItem(TOKEN_KEY, t),
  clear: () => sessionStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  constructor(public status: number, message: string, public data?: any) {
    super(message);
  }
}

type Opts = { method?: string; body?: unknown; query?: Record<string, unknown>; form?: FormData };

export async function api<T = any>(path: string, opts: Opts = {}): Promise<T> {
  const url = new URL(API_URL + '/api' + path);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  const method = opts.method || (opts.body || opts.form ? 'POST' : 'GET');
  if (method !== 'GET' && !navigator.onLine) {
    throw new ApiError(0, 'Connexion indisponible : opération bloquée jusqu’au retour du réseau.');
  }
  const headers: Record<string, string> = {};
  const t = session.get();
  if (t) headers.Authorization = `Bearer ${t}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(url, { method, headers, body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined), credentials: 'omit' });
  } catch {
    throw new ApiError(0, 'Serveur injoignable. Vérifiez votre connexion.');
  }
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    if (res.status === 401 && path !== '/auth/login') {
      session.clear();
      window.dispatchEvent(new Event('maxfit:logout'));
    }
    const msg = (data && (data as any).error) || `Erreur ${res.status}`;
    const issues = (data as any)?.issues as { path: string; message: string }[] | undefined;
    throw new ApiError(res.status, issues?.length ? `${msg} : ${issues.map((i) => `${i.path} ${i.message}`).join(', ')}` : msg, data);
  }
  return data as T;
}

export const mediaUrl = (m: { id: number; url?: string | null; has_blob?: number | boolean }) =>
  m.has_blob ? `${API_URL}/api/public/media/${m.id}` : m.url || '';

export const resolveAsset = (u?: string | null) => (!u ? '' : u.startsWith('/api/') ? API_URL + u : u);
