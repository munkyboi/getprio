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
  Boolean(import.meta.env?.DEV)
);
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

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
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

  const data = (await response.json().catch(() => ({}))) as { message?: string };
  rememberCsrfToken(data);
  if (!response.ok) {
    if (response.status === 401 && authFailureHandler && skipAuthRefresh) {
      authFailureHandler();
    }
    throw new ApiError(data.message || "Request failed.", response.status);
  }

  return data as TResponse;
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

  const data = (await response.json().catch(() => ({}))) as { message?: string };
  rememberCsrfToken(data);
  if (!response.ok) {
    if (response.status === 401 && authFailureHandler && skipAuthRefresh) {
      authFailureHandler();
    }
    throw new ApiError(data.message || "Request failed.", response.status);
  }

  return data as TResponse;
}

export { API_BASE_URL, resolveApiBaseUrl };
