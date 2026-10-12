function queueBoardReturnPath(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  try {
    const url = new URL(value, "https://getprio.invalid");
    const code = url.searchParams.get("boardPairing") || "";
    if (url.origin !== "https://getprio.invalid" || url.pathname !== "/dashboard/queue" || !/^[a-f0-9]{32}$/i.test(code)) return null;
    return `/dashboard/queue?boardPairing=${code.toLowerCase()}`;
  } catch { return null; }
}
module.exports = queueBoardReturnPath;
