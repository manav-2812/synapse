// Base API client: Bearer auth, 401 -> refresh -> retry, and a consistent
// error shape. Reads `data.error.message` matching backend JSON error schema.

export const BASE: string =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";

// ============================================================
// Token storage — "Remember me" behaviour
// ============================================================
// When "Remember me" is OFF  → tokens go in sessionStorage (cleared on tab close)
// When "Remember me" is ON   → tokens go in localStorage  (survive restarts)
//
// The choice is persisted as a tiny flag in localStorage so that after a
// page reload `setTokens` (called by the refresh-token flow) still writes
// to the correct store.
// ============================================================
const TOKEN_KEY    = "synapse_access";
const REFRESH_KEY  = "synapse_refresh";
const PERSIST_FLAG = "synapse_persist";  // "1" | "0"

// Initialise from the saved flag (default: persistent = true).
let persistent: boolean =
  localStorage.getItem(PERSIST_FLAG) !== "0";

export function setPersistence(value: boolean): void {
  persistent = value;
  // Save so that the preference survives page reloads.
  localStorage.setItem(PERSIST_FLAG, value ? "1" : "0");
  // If switching OFF, remove any existing tokens from localStorage
  // so the old "remembered" session doesn't linger.
  if (!value) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
  }
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

export { refreshTokens };

// ============================================================
// Server Warm-up / Cold Start Tracking (Deployed / Render only)
// ============================================================
export interface ServerStatus {
  isWakingUp: boolean;
  justWokeUp: boolean;
  activeRequests: number;
  elapsedSeconds: number;
}

type StatusListener = (status: ServerStatus) => void;
const listeners = new Set<StatusListener>();

let activeCount = 0;
let warmupTimer: number | null = null;
let elapsedTimer: number | null = null;
let isWakingUpState = false;
let justWokeUpState = false;
let elapsedSeconds = 0;
let justWokeUpTimeout: number | null = null;

/**
 * Detect if the app is communicating with a local backend (localhost/127.0.0.1)
 * or running in local development mode. Render cold start tracking should only run
 * on deployed environments where Render's free tier spins down after 15 min of inactivity.
 */
function isLocalEnvironment(): boolean {
  if (import.meta.env.DEV) return true;
  try {
    const url = new URL(BASE, typeof window !== "undefined" ? window.location.href : "http://localhost");
    return (
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "::1" ||
      url.hostname.endsWith(".local")
    );
  } catch {
    return false;
  }
}

function notifyListeners() {
  const current: ServerStatus = {
    isWakingUp: isWakingUpState,
    justWokeUp: justWokeUpState,
    activeRequests: activeCount,
    elapsedSeconds,
  };
  listeners.forEach((l) => l(current));
}

export function subscribeServerStatus(listener: StatusListener): () => void {
  listeners.add(listener);
  listener({
    isWakingUp: isWakingUpState,
    justWokeUp: justWokeUpState,
    activeRequests: activeCount,
    elapsedSeconds,
  });
  return () => {
    listeners.delete(listener);
  };
}

function startWarmupTracking() {
  if (isLocalEnvironment()) return;
  activeCount++;
  if (activeCount === 1) {
    if (warmupTimer) clearTimeout(warmupTimer);
    // Cold starts on Render take ~15–50s. Only trigger the warmup notice if a request takes > 5s on deployed servers.
    warmupTimer = window.setTimeout(() => {
      if (activeCount > 0) {
        isWakingUpState = true;
        elapsedSeconds = 5;
        notifyListeners();
        if (elapsedTimer) clearInterval(elapsedTimer);
        elapsedTimer = window.setInterval(() => {
          elapsedSeconds += 1;
          notifyListeners();
        }, 1000);
      }
    }, 5000);
  }
}

function stopWarmupTracking() {
  if (isLocalEnvironment()) return;
  activeCount = Math.max(0, activeCount - 1);
  if (activeCount === 0) {
    if (warmupTimer) {
      clearTimeout(warmupTimer);
      warmupTimer = null;
    }
    if (elapsedTimer) {
      clearInterval(elapsedTimer);
      elapsedTimer = null;
    }
    if (isWakingUpState) {
      isWakingUpState = false;
      justWokeUpState = true;
      notifyListeners();
      if (justWokeUpTimeout) clearTimeout(justWokeUpTimeout);
      justWokeUpTimeout = window.setTimeout(() => {
        justWokeUpState = false;
        notifyListeners();
      }, 3000);
    }
    elapsedSeconds = 0;
  }
}

// Background prewarm ping (deployed only)
let prewarmed = false;
export function prewarmServer(): void {
  if (prewarmed || isLocalEnvironment()) return;
  prewarmed = true;
  const healthUrl = BASE.replace("/api/v1", "") + "/health";
  // Non-blocking fire-and-forget for remote cold start spinup
  fetch(healthUrl, { method: "GET" }).catch(() => {
    /* ignore cold start errors */
  });
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

  startWarmupTracking();
  try {
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
  } finally {
    stopWarmupTracking();
  }
}

