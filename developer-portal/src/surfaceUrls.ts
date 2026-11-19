function configuredOrigin(value: string | undefined, fallback: string) {
  if (env.VITE_LOCAL_SURFACES === "1" && !value) throw new Error("Missing local application origin.");
  const url = new URL(value || fallback);
  if (env.VITE_LOCAL_SURFACES === "1" && !["127.0.0.1", "localhost"].includes(url.hostname)) throw new Error("Local application origins must stay on loopback.");
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash || (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname)))) throw new Error("Invalid application origin.");
  return url.origin;
}
const env = import.meta.env || {};
export const coreApiOrigin = configuredOrigin(env.VITE_CORE_API_URL, "https://api.getprio.online");
export const sandboxApiOrigin = configuredOrigin(env.VITE_SANDBOX_API_URL, "https://sandbox-api.getprio.online");
export const marketingOrigin = configuredOrigin(env.VITE_MARKETING_URL, "https://getprio.online");
export const coreApiBase = `${coreApiOrigin}/v1`;
export const sandboxApiBase = `${sandboxApiOrigin}/v1`;
