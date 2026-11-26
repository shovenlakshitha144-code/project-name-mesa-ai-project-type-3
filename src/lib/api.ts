import { cacheGet, cacheSet } from './offlineCache';

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const headers: Record<string, string> = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...((options.headers as Record<string, string>) || {}),
  };

  try {
    const res = await fetch(path, {
      ...options,
      credentials: 'include',
      headers,
    });

    const contentType = res.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await res.json() : await res.text();

    if (!res.ok) {
      const msg = typeof data === 'object' && data && 'error' in data ? String(data.error) : `Request failed (${res.status})`;
      const code = typeof data === 'object' && data && 'code' in data ? String(data.code) : undefined;
      throw new ApiError(msg, res.status, code);
    }

    if (method === 'GET') {
      await cacheSet(path, data);
    }
    return data as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (method === 'GET') {
      const cached = await cacheGet<T>(path);
      if (cached !== null) {
        return cached;
      }
    }
    throw new ApiError(
      navigator.onLine ? 'Unable to reach MESA server.' : 'Offline mode: this action requires a connection.',
      0,
      'NETWORK_ERROR'
    );
  }
}
