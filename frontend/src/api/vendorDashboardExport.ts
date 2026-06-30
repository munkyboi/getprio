import { API_BASE_URL } from "./client";

export function exportHistory(token: string, tenantSlug: string, locationSlug: string, range: string, format: "csv" | "pdf") {
  return fetch(
    `${API_BASE_URL}/vendor/tenant/${tenantSlug}/history/export?location=${encodeURIComponent(locationSlug)}&range=${encodeURIComponent(range)}&format=${encodeURIComponent(format)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );
}
