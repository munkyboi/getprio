export function queueBoardReturnPath(search: string): string | null {
  const params = new URLSearchParams(search);
  let code = params.get("boardPairing");
  if (!code) {
    try {
      const next = new URL(params.get("next") || "", "https://getprio.invalid");
      if (next.origin === "https://getprio.invalid" && next.pathname === "/dashboard/queue") code = next.searchParams.get("boardPairing");
    } catch { return null; }
  }
  return code && /^[a-f0-9]{32}$/i.test(code) ? `/dashboard/queue?boardPairing=${code.toLowerCase()}` : null;
}
