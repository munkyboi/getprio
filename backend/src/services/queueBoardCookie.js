const crypto = require("node:crypto");
const env = require("../config/env");

// Derive a dedicated key rather than using the JWT signing key directly.
function key() {
  return crypto.hkdfSync("sha256", env.jwtSecret, Buffer.alloc(0), "prio-queue-board-cookie-v1", 32);
}
function sealBrowserSecret(secret, boardId) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(boardId));
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return `v1.${Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url")}`;
}
function openBrowserSecret(value, boardId) {
  if (typeof value !== "string" || !/^v1\.[A-Za-z0-9_-]{123}$/.test(value)) return "";
  try {
    const payload = Buffer.from(value.slice(3), "base64url");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key(), payload.subarray(0, 12));
    decipher.setAAD(Buffer.from(boardId));
    decipher.setAuthTag(payload.subarray(12, 28));
    const secret = Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString("utf8");
    return /^[a-f0-9]{64}$/.test(secret) ? secret : "";
  } catch {
    return "";
  }
}
module.exports = { sealBrowserSecret, openBrowserSecret };
