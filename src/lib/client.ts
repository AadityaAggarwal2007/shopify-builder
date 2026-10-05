'use client';
// Browser-side helpers: the login token and a fetch that sends it.
export function token(): string {
  try { return localStorage.getItem('builder_token') || ''; } catch { return ''; }
}
export function signOut(): void {
  try { localStorage.removeItem('builder_token'); } catch { /* ignore */ }
  window.location.href = '/login';
}
export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token()}`, ...(init.headers as Record<string, string> || {}) };
  let body = init.body;
  if (init.json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(init.json); }
  const res = await fetch(path, { ...init, headers, body });
  if (res.status === 401) { signOut(); throw new Error('Signed out'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { data, status: res.status });
  return data as T;
}
export function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}
