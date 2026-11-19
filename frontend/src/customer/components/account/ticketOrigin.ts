export function customerTicketBack(origin: string | null): string {
  return origin === "home" ? "/account/dashboard" : "/account/tickets";
}
export function customerHomeTicketPath(path: string): string {
  const [pathname, query = ""] = path.split("?");
  if (!pathname.startsWith("/ticket/"))
    throw Error("Expected a Customer ticket route.");
  const params = new URLSearchParams(query);
  params.set("from", "home");
  return `${pathname}?${params.toString()}`;
}
