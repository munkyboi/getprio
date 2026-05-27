const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
export const API_ERROR_EVENT = "getprio:api-error";

export interface ApiErrorEventDetail {
  message: string;
  status: number;
  path: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly path: string;

  constructor(message: string, status: number, path: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.path = path;
  }
}

function notifyApiError(detail: ApiErrorEventDetail) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<ApiErrorEventDetail>(API_ERROR_EVENT, {
      detail
    })
  );
}

export interface ApiRequestOptions<TBody = unknown> {
  method?: string;
  body?: TBody;
  token?: string;
  signal?: AbortSignal;
}

export async function apiRequest<TResponse, TBody = unknown>(
  path: string,
  options: ApiRequestOptions<TBody> = {}
): Promise<TResponse> {
  const { method = "GET", body, token, signal } = options;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined,
    signal
  });

  const data = (await response.json().catch(() => ({}))) as { message?: string };
  if (!response.ok) {
    const message = data.message || "Request failed.";
    notifyApiError({
      message,
      status: response.status,
      path
    });
    throw new ApiError(message, response.status, path);
  }

  return data as TResponse;
}

export { API_BASE_URL };
