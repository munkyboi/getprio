import { apiRequest, publicAuthRequest, type ApiRequestOptions } from "../api/client";
import { publicAuthPathAllowed } from "../../../shared/publicAuthPolicy";
import { publicUniversalAuthEnabled } from "../surfaces/publicAuthEnabled";

export function sessionRequest<TResponse, TBody = unknown>(path: string, options: ApiRequestOptions<TBody> = {}): Promise<TResponse> {
  if (import.meta.env?.VITE_APP_SURFACE === "marketing" && publicUniversalAuthEnabled && publicAuthPathAllowed(path, options.method)) return publicAuthRequest<TResponse, TBody>(path, options);
  return apiRequest<TResponse, TBody>(path, options);
}
