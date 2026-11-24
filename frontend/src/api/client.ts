import { publicAuthPathAllowed } from "../../../shared/publicAuthPolicy";
import { publicUniversalAuthEnabled } from "../surfaces/publicAuthEnabled";

const API_BASE_URL = import.meta.env?.VITE_API_URL || "http://localhost:5001/api";

export function localizeApiOrigin(base: string, hostname: string): string {
  if (!["localhost", "127.0.0.1", "[::1]"].includes(hostname)) return base;
  const url = new URL(base);
  if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) url.hostname = hostname;
  return url.origin + url.pathname.replace(/\/$/u, "");
}

export function runtimeApiBaseUrl(hostname?: string): string {
  // Keep local browser/API requests same-site even when a preview was built
  // with the loopback API's other spelling. This is required for credentialed
  // auth requests: browsers classify localhost and 127.0.0.1 as cross-site,
  // which causes the strict CSRF middleware to reject an otherwise valid
  // session. Production API origins are left untouched by localizeApiOrigin.
  const browserHostname = hostname || (typeof window !== "undefined" ? window.location?.hostname || "" : "");
  return browserHostname ? localizeApiOrigin(API_BASE_URL, browserHostname) : API_BASE_URL;
}
const CSRF_STORAGE_KEY = "prio_csrf";

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
  return readStoredCsrfToken() || readCookie("prio_csrf");
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly retryAt?: number;

  constructor(message: string, status: number, details: { code?: string; retryAt?: number } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = details.code;
    this.retryAt = details.retryAt;
  }
}

export function retryAfterDeadline(value: string | null | undefined, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return now + seconds * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? date : undefined;
}

export interface ApiRequestOptions<TBody = unknown> {
  method?: string;
  body?: TBody;
  token?: string;
  signal?: AbortSignal;
  skipAuthRefresh?: boolean;
  headers?: Record<string, string>;
  credentials?: RequestCredentials;
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
  const {
    method = "GET",
    body,
    token,
    signal,
    skipAuthRefresh = false,
    headers = {},
    credentials = import.meta.env?.VITE_APP_SURFACE === "marketing" ? "omit" : "include",
  } = options;
  const unsafe = !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
  const idempotencyKey = unsafe && typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "";

  const makeRequest = async (authToken?: string) =>
    fetch(`${runtimeApiBaseUrl()}${path}`, {
      method,
      credentials,
      headers: {
        "Content-Type": "application/json",
        ...(unsafe && readCsrfToken()
          ? { "X-CSRF-Token": readCsrfToken() }
          : {}),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        ...(authToken && authToken !== "cookie-session"
          ? { Authorization: `Bearer ${authToken}` }
          : {}),
        ...headers
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

  const data = (await response.json().catch(() => ({}))) as { message?: string; code?: string; retryAt?: number };
  rememberCsrfToken(data);
  if (!response.ok) {
    if (response.status === 401 && authFailureHandler && skipAuthRefresh) {
      authFailureHandler();
    }
    throw new ApiError(data.message || "Request failed.", response.status, {
      ...data,
      retryAt: data.retryAt ?? retryAfterDeadline(
        typeof response.headers?.get === "function" ? response.headers.get("Retry-After") : undefined
      )
    });
  }

  return data as TResponse;
}

/** Restrict credentialed public-site requests to the explicit universal-auth allowlist. */
export async function publicAuthRequest<TResponse, TBody = unknown>(
  path: string,
  options: ApiRequestOptions<TBody> = {}
): Promise<TResponse> {
  if (!publicAuthPathAllowed(path, options.method) || !publicUniversalAuthEnabled) {
    throw new ApiError("This authentication action is unavailable.", 403);
  }
  return apiRequest<TResponse, TBody>(path, { ...options, credentials: "include", skipAuthRefresh: true });
}

export async function apiUpload<TResponse>(
  path: string,
  options: {
    body: BodyInit;
    contentType: string;
    token?: string;
    signal?: AbortSignal;
    skipAuthRefresh?: boolean;
    headers?: Record<string, string>;
  }
): Promise<TResponse> {
  const { body, contentType, token, signal, skipAuthRefresh = false, headers = {} } = options;
  if (contentType.startsWith("image/") && body instanceof Blob) {
    const policy = await apiRequest<{ maxImageUploadKb: number; maxImageUploadBytes: number }>("/public/upload-policy", { signal });
    if (body.size < 1 || body.size > policy.maxImageUploadBytes) {
      throw new ApiError(`Image must be between 1 byte and ${policy.maxImageUploadKb} KB. Choose a smaller image or compress it before uploading.`, 400);
    }
  }
  const makeRequest = async (authToken?: string) =>
    fetch(`${runtimeApiBaseUrl()}${path}`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": contentType,
        ...(readCsrfToken() ? { "X-CSRF-Token": readCsrfToken() } : {}),
        ...(authToken && authToken !== "cookie-session"
          ? { Authorization: `Bearer ${authToken}` }
          : {}),
        ...headers
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

  const data = (await response.json().catch(() => ({}))) as { message?: string; code?: string; retryAt?: number };
  rememberCsrfToken(data);
  if (!response.ok) {
    if (response.status === 401 && authFailureHandler && skipAuthRefresh) {
      authFailureHandler();
    }
    throw new ApiError(data.message || "Request failed.", response.status, data);
  }

  return data as TResponse;
}

export { API_BASE_URL };
