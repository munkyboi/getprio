// Resolve only supported join links. Never fetch a pasted/scanned address.
export function resolveCustomerJoin(
  value: string,
  currentOrigin: string,
  customerOrigin: string,
): string | null {
  try {
    const trimmed = value.trim();
    if (!trimmed || trimmed.startsWith("//")) return null;
    const url = new URL(trimmed, currentOrigin);
    if (
      ![
        currentOrigin,
        new URL(customerOrigin).origin,
        "https://app.getprio.online",
      ].includes(url.origin) ||
      url.username ||
      url.password ||
      url.hash
    )
      return null;
    if (
      !/^\/join\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?\/?$/i.test(
        url.pathname,
      )
    )
      return null;
    if (
      [...url.searchParams.keys()].some((key) => key !== "source") ||
      (url.searchParams.has("source") &&
        url.searchParams.get("source") !== "qr")
    )
      return null;
    return url.pathname.replace(/\/$/, "") + url.search;
  } catch {
    return null;
  }
}
