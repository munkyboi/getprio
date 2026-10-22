function requestLogPath(value) {
  const url = String(value || "/");
  const path = url.split("?")[0];
  // Private resource selectors/search terms belong in protected request bodies.
  // Also redact queries from old clients and rejected attempts on these routes.
  if (/^\/(?:api\/(?:v1\/)?)?platform\/resource-inventory(?:\/|$)/i.test(path))
    return path;
  return url;
}
module.exports = { requestLogPath };
