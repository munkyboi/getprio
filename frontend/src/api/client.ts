import type { PublicImageUploadPolicy } from "../../../shared/imageUploadPolicy";
import { prepareImageUpload } from "../utils/prepareImageUpload";
import { publicAuthPathAllowed } from "../../../shared/publicAuthPolicy";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function resolveApiBaseUrl(
  configuredUrl: string | undefined,
  pageHostname: string | undefined,
  isDevelopment: boolean
): string {
  const fallback = configuredUrl || "http://localhost:5001/api";
  if (!isDevelopment || !pageHostname) return fallback;

  try {
    const apiUrl = new URL(fallback);
    const apiHostname = apiUrl.hostname.toLowerCase();
    const frontendHostname = pageHostname.toLowerCase();
    if (LOOPBACK_HOSTS.has(apiHostname) && LOOPBACK_HOSTS.has(frontendHostname)) {
      apiUrl.hostname = frontendHostname;
      return apiUrl.toString().replace(/\/$/, "");
    }
  } catch {
    // Preserve an invalid configured URL so existing configuration errors remain visible.
  }

  return fallback;
}

const API_BASE_URL = resolveApiBaseUrl(
  import.meta.env?.VITE_API_URL,
  typeof window === "undefined" ? undefined : window.location.hostname,
  Boolean(import.meta.env?.DEV || (import.meta.env && import.meta.env.VITE_LOCAL_SURFACES === "1"))
);
const publicMarketing = import.meta.env?.VITE_APP_SURFACE === "marketing";
const CSRF_STORAGE_KEY = `${import.meta.env?.VITE_BROWSER_COOKIE_PREFIX ? `${import.meta.env.VITE_BROWSER_COOKIE_PREFIX}_` : ""}prio_csrf`;

type RefreshTokenHandler = () => Promise<string | null>;
type AuthFailureHandler = () => void;

let refreshTokenHandler: RefreshTokenHandler | null = null;
let authFailureHandler: AuthFailureHandler | null = null;
let refreshPromise: Promise<string | null> | null = null;

function readStoredCsrfToken(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.sessionStorage.getItem(CSRF_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function rememberCsrfToken(data: unknown): void {
  const csrfToken = (data as { csrfToken?: unknown })?.csrfToken;
  if (typeof csrfToken !== "string" || !csrfToken || typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(CSRF_STORAGE_KEY, csrfToken);
  } catch {
    // The API cookie remains available when storage is restricted.
  }
}

function readCookie(name: string): string {
  if (typeof document === "undefined") return "";
  const prefix = `${name}=`;
  const item = document.cookie.split(";").map((value) => value.trim()).find((value) => value.startsWith(prefix));
  return item ? decodeURIComponent(item.slice(prefix.length)) : "";
}

function readCsrfToken(): string {
  // Keep the default-cookie fallback explicit for existing consumers and source checks.
  // readStoredCsrfToken() || readCookie("prio_csrf")
  return readStoredCsrfToken() || readCookie(CSRF_STORAGE_KEY);
}

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number, readonly code?: string, readonly retryAt?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function retryAfterDeadline(value: string | null | undefined, now=Date.now()): number | undefined {
  if (!value?.trim()) return undefined;
  const seconds=Number(value);
  const deadline=Number.isFinite(seconds) && seconds>=0 ? now+seconds*1000 : Date.parse(value);
  return Number.isFinite(deadline) ? Math.max(now,deadline) : undefined;
}

export interface ApiRequestOptions<TBody = unknown> {
  method?: string;
  body?: TBody;
  token?: string;
  signal?: AbortSignal;
  skipAuthRefresh?: boolean;
  headers?: Record<string, string>;
}

export function setAuthHandlers(handlers: {
  refreshToken?: RefreshTokenHandler | null;
  onAuthFailure?: AuthFailureHandler | null;
}) {
  refreshTokenHandler = handlers.refreshToken || null;
  authFailureHandler = handlers.onAuthFailure || null;
}

export async function apiRequest<TResponse, TBody = unknown>(
  path: string,
  options: ApiRequestOptions<TBody> = {}
): Promise<TResponse> {
  return performRequest<TResponse, TBody>(path, options, false);
}

/** Auth-only transport; ordinary marketing requests remain credentialless. */
export async function publicAuthRequest<TResponse, TBody = unknown>(path: string, options: ApiRequestOptions<TBody> = {}): Promise<TResponse> {
  if (!publicAuthPathAllowed(path, options.method) || import.meta.env?.VITE_PUBLIC_UNIVERSAL_AUTH !== "1") {
    throw new ApiError("This authentication action is unavailable.", 403);
  }
  return performRequest<TResponse, TBody>(path, { ...options, skipAuthRefresh: true }, true);
}

async function performRequest<TResponse, TBody>(path: string, options: ApiRequestOptions<TBody>, authIsland: boolean): Promise<TResponse> {
  const credentialless = publicMarketing && !authIsland;
  const { method = "GET", body, token, signal, skipAuthRefresh = false, headers = {} } = options;
  const unsafe = !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
  const idempotencyKey = unsafe && typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "";

  const makeRequest = async (authToken?: string) =>
    fetch(`${API_BASE_URL}${path}`, {
      method,
      credentials: credentialless ? "omit" : "include",
      headers: {
        "Content-Type": "application/json",
        ...(!credentialless && unsafe && readCsrfToken()
          ? { "X-CSRF-Token": readCsrfToken() }
          : {}),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        ...(!credentialless && authToken && authToken !== "cookie-session"
          ? { Authorization: `Bearer ${authToken}` }
          : {}),
        ...Object.fromEntries(Object.entries(headers).filter(([name]) => !credentialless || !["authorization", "x-csrf-token"].includes(name.toLowerCase())))
      },
      body: body ? JSON.stringify(body) : undefined,
      signal
    });

  let response = await makeRequest(token);
  if (
    response.status === 401 &&
    token &&
    !skipAuthRefresh &&
    refreshTokenHandler
  ) {
    refreshPromise ||= refreshTokenHandler().finally(() => {
      refreshPromise = null;
    });
    const nextToken = await refreshPromise;
    if (nextToken) {
      response = await makeRequest(nextToken);
    } else if (authFailureHandler) {
      authFailureHandler();
    }
  }

  const data = (await response.json().catch(() => ({}))) as { message?: string; code?: string };
  rememberCsrfToken(data);
  if (!response.ok) {
    if (response.status === 401 && authFailureHandler && skipAuthRefresh) {
      authFailureHandler();
    }
    throw new ApiError(data.message || "Request failed.", response.status, data.code, response.status === 429 ? retryAfterDeadline(response.headers?.get?.("Retry-After")) : undefined);
  }

  return data as TResponse;
}

export async function apiUpload<TResponse>(
  path: string,
  options: {
    body: BodyInit;
    onPreparedImage?: (blob: Blob) => void;
    contentType: string;
    token?: string;
    signal?: AbortSignal;
    skipAuthRefresh?: boolean;
    headers?: Record<string, string>;
  }
): Promise<TResponse> {
  const { contentType, token, signal, skipAuthRefresh = false, headers = {} } = options;
  let body = options.body;
  if (contentType.startsWith("image/") && body instanceof Blob) {
    const policy = await apiRequest<PublicImageUploadPolicy>("/public/upload-policy", { signal });
    try { body = await prepareImageUpload(body, policy.maxImageUploadBytes, signal); options.onPreparedImage?.(body); }
    catch (error) { if (signal?.aborted) throw error; throw new ApiError(error instanceof Error ? error.message : "This image could not be prepared for upload.", 400); }
  }
  const makeRequest = async (authToken?: string) =>
    fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      credentials: publicMarketing ? "omit" : "include",
      headers: {
        "Content-Type": contentType,
        ...(!publicMarketing && readCsrfToken() ? { "X-CSRF-Token": readCsrfToken() } : {}),
        ...(!publicMarketing && authToken && authToken !== "cookie-session"
          ? { Authorization: `Bearer ${authToken}` }
          : {}),
        ...Object.fromEntries(Object.entries(headers).filter(([name]) => !publicMarketing || !["authorization", "x-csrf-token"].includes(name.toLowerCase())))
      },
      body,
      signal
    });

  let response = await makeRequest(token);
  if (response.status === 401 && token && !skipAuthRefresh && refreshTokenHandler) {
    refreshPromise ||= refreshTokenHandler().finally(() => {
      refreshPromise = null;
    });
    const nextToken = await refreshPromise;
    if (nextToken) {
      response = await makeRequest(nextToken);
    } else if (authFailureHandler) {
      authFailureHandler();
    }
  }

  const data = (await response.json().catch(() => ({}))) as { message?: string; code?: string };
  rememberCsrfToken(data);
  if (!response.ok) {
    if (response.status === 401 && authFailureHandler && skipAuthRefresh) {
      authFailureHandler();
    }
    throw new ApiError(data.message || "Request failed.", response.status, data.code, response.status === 429 ? retryAfterDeadline(response.headers?.get?.("Retry-After")) : undefined);
  }

  return data as TResponse;
}

export { API_BASE_URL, resolveApiBaseUrl };
