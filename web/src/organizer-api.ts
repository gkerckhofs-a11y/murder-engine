import { organizerToken } from './admin-auth';

// Public player and registration routes retain their token-based access.
export async function organizerFetch(url: string, init: RequestInit = {}) {
  if (/^\/api\/(public|player)\//.test(url)) return fetch(url, init);
  const token = await organizerToken();
  const headers = new Headers(init.headers);
  if (token) headers.set('authorization', `Bearer ${token}`);
  return fetch(url, {...init, headers});
}

export async function organizerJson<T = any>(url: string, body?: unknown): Promise<T> {
  const response = await organizerFetch(url, body === undefined ? {} : {
    method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
  return data as T;
}
