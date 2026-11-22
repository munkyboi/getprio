import { publicAuthPathAllowed } from "../../../shared/publicAuthPolicy";

const API_BASE_URL = import.meta.env?.VITE_API_URL || "http://localhost:5001/api";
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
  const { method = "GET", body, token, signal, skipAuthRefresh = false, headers = {} } = options;
  const unsafe = !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
  const idempotencyKey = unsafe && typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "";

  const makeRequest = async (authToken?: string) =>
    fetch(`${API_BASE_URL}${path}`, {
      method,
      credentials: "include",
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
      retryAt: data.retryAt ?? retryAfterDeadline(response.headers.get("Retry-After"))
    });
  }

  return data as TResponse;
}

/** Restrict credentialed public-site requests to the explicit universal-auth allowlist. */
export async function publicAuthRequest<TResponse, TBody = unknown>(
  path: string,
  options: ApiRequestOptions<TBody> = {}
): Promise<TResponse> {
  if (!publicAuthPathAllowed(path, options.method) || import.meta.env?.VITE_PUBLIC_UNIVERSAL_AUTH !== "1") {
    throw new ApiError("This authentication action is unavailable.", 403);
  }
  return apiRequest<TResponse, TBody>(path, { ...options, skipAuthRefresh: true });
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
    fetch(`${API_BASE_URL}${path}`, {
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
