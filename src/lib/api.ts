/**
 * Typed REST client for the self-hosted backend (NestJS at VITE_API_BASE_URL).
 *
 * Phase 1 deliverable: this is the abstraction layer. Phase 2 rewrites every
 * service file under src/modules/shared/services/* to use it.
 *
 * Behaviour:
 * - Auto-attaches `Authorization: Bearer <accessToken>`.
 * - On 401, attempts a single `/auth/refresh`; on failure, clears tokens.
 * - Throws `ApiError` with status + parsed body on non-2xx.
 */

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

const ACCESS_KEY = "auth.accessToken";
const REFRESH_KEY = "auth.refreshToken";
const TENANT_KEY = "app.currentTenantSlug";
const REQUEST_PREFIX = "req_";

function makeClientRequestId(): string {
  const suffix = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return `${REQUEST_PREFIX}${suffix}`;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    public readonly requestId?: string | null,
    message?: string,
  ) {
    super(message ?? `API ${status}`);
  }
}

type AuthEvent = "signed_in" | "signed_out" | "token_refreshed";
const authListeners = new Set<(e: AuthEvent) => void>();
function emitAuth(e: AuthEvent) {
  authListeners.forEach((cb) => {
    try {
      cb(e);
    } catch {
      /* ignore listener errors */
    }
  });
}

export const tokenStore = {
  get access(): string | null {
    return typeof localStorage !== "undefined" ? localStorage.getItem(ACCESS_KEY) : null;
  },
  get refresh(): string | null {
    return typeof localStorage !== "undefined" ? localStorage.getItem(REFRESH_KEY) : null;
  },
  set(access: string, refresh: string) {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
    emitAuth("signed_in");
  },
  clear() {
    const had = !!localStorage.getItem(ACCESS_KEY);
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    if (had) emitAuth("signed_out");
  },
  subscribe(cb: (e: AuthEvent) => void) {
    authListeners.add(cb);
    return () => authListeners.delete(cb);
  },
};

const tenantListeners = new Set<(slug: string | null) => void>();
function emitTenant(slug: string | null) {
  tenantListeners.forEach((cb) => {
    try {
      cb(slug);
    } catch {
      /* ignore */
    }
  });
}

export const tenantStore = {
  get slug(): string | null {
    return typeof localStorage !== "undefined" ? localStorage.getItem(TENANT_KEY) : null;
  },
  set(slug: string | null) {
    if (slug) localStorage.setItem(TENANT_KEY, slug);
    else localStorage.removeItem(TENANT_KEY);
    emitTenant(slug);
  },
  subscribe(cb: (slug: string | null) => void) {
    tenantListeners.add(cb);
    return () => tenantListeners.delete(cb);
  },
};

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

async function refreshOnce(): Promise<boolean> {
  const refreshToken = tokenStore.refresh;
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { accessToken: string; refreshToken: string };
    tokenStore.set(data.accessToken, data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

async function request<T>(method: Method, path: string, body?: unknown, retried = false): Promise<T> {
  if (!BASE_URL) {
    throw new ApiError(0, null, "VITE_API_BASE_URL is not configured");
  }
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  headers["X-Client-Request-Id"] = makeClientRequestId();
  headers["X-App-Release"] = (import.meta.env.VITE_RELEASE_NAME ?? import.meta.env.VITE_APP_VERSION ?? "dev");

  const access = tokenStore.access;
  if (access) headers.Authorization = `Bearer ${access}`;
  const tenantSlug = tenantStore.slug;
  if (tenantSlug) headers["X-Tenant-Slug"] = tenantSlug;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && !retried) {
    const refreshed = await refreshOnce();
    if (refreshed) return request<T>(method, path, body, true);
    tokenStore.clear();
  }

  const responseRequestId = res.headers.get("x-request-id");

  if (!res.ok) {
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* keep as text */
    }
    throw new ApiError(res.status, parsed, responseRequestId);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
  baseUrl: BASE_URL,
};

/**
 * Auth helpers — used by AuthPage and useAuth in Phase 2.
 */
export const authApi = {
  async login(email: string, password: string) {
    const tokens = await api.post<{ accessToken: string; refreshToken: string }>(
      "/auth/login",
      { email, password },
    );
    tokenStore.set(tokens.accessToken, tokens.refreshToken);
    return tokens;
  },
  async register(email: string, password: string, displayName?: string) {
    return api.post<{ emailVerificationRequired: true; email: string; message: string; verificationUrl?: string }>(
      "/auth/register",
      { email, password, displayName },
    );
  },
  registrationStatus() {
    return api.get<{
      passwordRegistrationEnabled: boolean;
      googleEnabled: boolean;
      delivery: string;
      missingSmtpFields: string[];
      reasons: Array<"smtp_unconfigured" | "email_delivery_unconfigured">;
    }>("/auth/registration-status");
  },
  async logout() {
    const refreshToken = tokenStore.refresh;
    if (refreshToken) {
      await api.post("/auth/logout", { refreshToken }).catch(() => undefined);
    }
    tokenStore.clear();
  },
  /** Fire-and-forget redirect to the backend Google OAuth start URL. */
  startGoogle() {
    window.location.href = `${BASE_URL}/auth/google`;
  },
  me<T = { id: string; email: string; roles: string[] }>() {
    return api.get<T>("/auth/me");
  },
};
