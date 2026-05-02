// Lightweight fetch wrapper that includes credentials and unwraps JSON.

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const init: RequestInit = {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) init.body = JSON.stringify(body);

  const resp = await fetch(`/api/v1${path}`, init);
  if (!resp.ok) {
    let code: string | undefined;
    let message = resp.statusText;
    try {
      const data = await resp.json();
      code = data.code;
      message = data.message ?? message;
    } catch {
      // ignore — non-JSON error
    }
    throw new ApiError(message, resp.status, code);
  }
  if (resp.status === 204) return undefined as unknown as T;
  const ct = resp.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    return (await resp.json()) as T;
  }
  return (await resp.text()) as unknown as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
};
