// Base API client: Bearer auth, 401 -> refresh -> retry, and a consistent
// error shape. Reads `data.error.message` matching backend JSON error schema.

export const BASE: string =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";

const TOKEN_KEY = "synapse_access";
const REFRESH_KEY = "synapse_refresh";

// "Remember me" off => tokens live in sessionStorage and vanish when the
// browser/tab closes. On => localStorage, so the session survives restarts.
let persistent = true;
export function setPersistence(value: boolean): void {
  persistent = value;
}

function writeStorage(): Storage {
  return persistent ? localStorage : sessionStorage;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
}
export function getRefresh(): string | null {
  return localStorage.getItem(REFRESH_KEY) || sessionStorage.getItem(REFRESH_KEY);
}
export function setTokens(access?: string | null, refresh?: string | null): void {
  const store = writeStorage();
  if (access) store.setItem(TOKEN_KEY, access);
  if (refresh) store.setItem(REFRESH_KEY, refresh);
}
export function clearTokens(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(REFRESH_KEY);
}
export function getRedirect(): string | null {
  return localStorage.getItem("synapse_redirect");
}

export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

interface ApiErrorBody {
  error?: { message?: string; code?: string };
  detail?: string;
  message?: string;
}
function extractMessage(data: unknown, fallback: string): string {
  const body = data as ApiErrorBody | null;
  return body?.error?.message || body?.detail || body?.message || fallback;
}

// Lets AuthContext bounce the user to /login when a session truly expires.
let unauthorizedHandler: (() => void) | null = null;
export function setUnauthorizedHandler(cb: () => void): void {
  unauthorizedHandler = cb;
}

async function refreshTokens(): Promise<string> {
  const refresh = getRefresh();
  if (!refresh) throw new Error("No refresh token");
  const res = await fetch(`${BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refresh }),
  });
  if (!res.ok) throw new Error("Refresh failed");
  const data = (await res.json()) as { access_token: string; refresh_token?: string };
  setTokens(data.access_token, data.refresh_token || refresh);
  return data.access_token;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | null | undefined>;
  json?: boolean;
  raw?: boolean;
  headers?: Record<string, string>;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, query, json = true, raw = false, headers = {} } = opts;

  let url = BASE + path;
  if (query) {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") params.append(k, String(v));
    });
    const qs = params.toString();
    if (qs) url += "?" + qs;
  }

  async function doFetch(accessToken: string | null): Promise<Response> {
    const h: Record<string, string> = { ...headers };
    if (json && body !== undefined && !(body instanceof FormData)) {
      h["Content-Type"] = "application/json";
    }
    if (accessToken) h["Authorization"] = "Bearer " + accessToken;
    return fetch(url, {
      method,
      headers: h,
      body:
        body === undefined
          ? undefined
          : raw || body instanceof FormData
            ? (body as BodyInit)
            : JSON.stringify(body),
    });
  }

  let res = await doFetch(getToken());

  if (res.status === 401) {
    try {
      const newToken = await refreshTokens();
      res = await doFetch(newToken);
    } catch {
      clearTokens();
      unauthorizedHandler?.();
      throw new ApiError("Session expired. Please sign in again.", 401);
    }
  }

  if (!res.ok) {
    let data: unknown = null;
    let msg = `Request failed (${res.status})`;
    try {
      data = await res.json();
      msg = extractMessage(data, msg);
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(msg, res.status, data);
  }

  if (res.status === 204) return undefined as T;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return (await res.json()) as T;
  return (await res.text()) as unknown as T;
}
