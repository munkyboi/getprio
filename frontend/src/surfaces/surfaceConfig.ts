/* Control characters are intentionally rejected in redirect paths. */
/* eslint-disable no-control-regex */
export type BrowserSurface = "marketing" | "customer" | "vendor";
export type AppPurpose = BrowserSurface | "platform" | "developers";
const defaults: Record<AppPurpose, string> = {
  marketing: "https://getprio.online", customer: "https://app.getprio.online",
  vendor: "https://vendor.getprio.online", platform: "https://platform.getprio.online",
  developers: "https://developers.getprio.online",
};

export function validateAppOrigin(value: string): string {
  const url = new URL(value);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))) {
    throw new Error("Application URLs must be HTTPS origins or explicit local loopback origins.");
  }
  return url.origin;
}

export function createAppUrls(values: Partial<Record<AppPurpose, string>>, local = false) {
  const origins = Object.fromEntries(Object.entries(defaults).map(([purpose, fallback]) => {
    const value = values[purpose as AppPurpose];
    if (local && !value) throw new Error(`Missing local ${purpose} application origin.`);
    const canonical = validateAppOrigin(value || fallback);
    if (local && !["localhost", "127.0.0.1", "[::1]"].includes(new URL(canonical).hostname)) throw new Error("Local application origins must stay on loopback.");
    return [purpose, canonical];
  })) as Record<AppPurpose, string>;
  return (purpose: AppPurpose, path = "/") => {
    if (!path.startsWith("/") || path.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(path)) throw new Error("Invalid application path.");
    const url = new URL(path, origins[purpose]);
    if (url.origin !== origins[purpose]) throw new Error("Invalid application destination.");
    return url.href;
  };
}

export function safeSurfaceNext(value: string | null | undefined, surface: "customer" | "vendor", allowOnboarding = false) {
  const fallback = surface === "vendor" ? "/dashboard" : "/account/dashboard";
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value)) return fallback;
  try {
    const url = new URL(value, "https://return.invalid");
    let decoded = url.pathname;
    for (let i = 0; i < 4; i++) { const next = decodeURIComponent(decoded); if (next === decoded) break; decoded = next; }
    if (url.origin !== "https://return.invalid" || /[\\\u0000-\u001f\u007f]/.test(decoded) || decoded.includes("//") || /(?:^|\/)\.\.?(?:\/|$)/.test(decoded)) return fallback;
    const permitted = surface === "vendor" ? /^\/(?:dashboard|queue-board)(?:[/?#]|$)/ : /^\/(?:account|vendors|join|ticket|payment)(?:[/?#]|$)/;
    if (!permitted.test(decoded) && !(surface === "vendor" && allowOnboarding && /^\/register(?:\/vendor)?$/.test(decoded))) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return fallback; }
}

export function keepSurfaceReturnPath(value: string | null, surface: "customer" | "vendor"): string | null {
  return value && safeSurfaceNext(value, surface) === value ? value : null;
}

export function initialAuthSurface(pathname: string, params: URLSearchParams): "customer" | "vendor" {
  const app = params.get("app");
  if (app === "customer" || app === "vendor") return app;
  if (pathname.endsWith("/vendor") || keepSurfaceReturnPath(params.get("next"), "vendor")) return "vendor";
  return "customer";
}

const frontendEnv = import.meta.env || {};
export const currentSurface = frontendEnv.VITE_APP_SURFACE as BrowserSurface | undefined;
export function appUrl(purpose: AppPurpose, path = "/") {
  const env = frontendEnv;
  return createAppUrls({ marketing: env.VITE_MARKETING_URL, customer: env.VITE_CUSTOMER_APP_URL,
    vendor: env.VITE_VENDOR_APP_URL, platform: env.VITE_PLATFORM_DASHBOARD_URL,
    developers: env.VITE_DEVELOPER_PORTAL_URL }, env.VITE_LOCAL_SURFACES === "1")(purpose, path);
}
