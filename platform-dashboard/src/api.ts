const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

function readCsrfToken() {
  const entry = document.cookie.split(";").map((value) => value.trim()).find((value) => value.startsWith("prio_csrf="));
  return entry ? decodeURIComponent(entry.slice("prio_csrf=".length)) : "";
}

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiRequest<TResponse, TBody = unknown>(
  path: string,
  options: {
    method?: string;
    body?: TBody;
    token?: string;
    headers?: Record<string, string>;
  } = {}
): Promise<TResponse> {
  const unsafe = !["GET", "HEAD", "OPTIONS"].includes((options.method || "GET").toUpperCase());
  const idempotencyKey = unsafe && "randomUUID" in crypto ? crypto.randomUUID() : "";
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method || "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(unsafe && readCsrfToken()
        ? { "X-CSRF-Token": readCsrfToken() }
        : {}),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      ...(options.token && options.token !== "cookie-session"
        ? { Authorization: `Bearer ${options.token}` }
        : {}),
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const data = (await response.json().catch(() => ({}))) as { message?: string };
  if (!response.ok) {
    throw new ApiError(data.message || "Request failed.", response.status);
  }

  return data as TResponse;
}
