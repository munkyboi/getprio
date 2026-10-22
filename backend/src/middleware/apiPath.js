function normalizeApiPath(value) {
  return String(value || "")
    .split("?")[0]
    .replace(/^\/api\/v1(?=\/)/, "")
    .replace(/^\/api(?=\/)/, "") || "/";
}

module.exports = { normalizeApiPath };
