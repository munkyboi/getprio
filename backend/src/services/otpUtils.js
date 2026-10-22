const crypto = require("node:crypto");

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function hashCode(code) {
  return crypto.createHash("sha256").update(String(code || "")).digest("hex");
}

function matchesCode(code, expectedHash) {
  const actual = Buffer.from(hashCode(code), "hex");
  const expected = Buffer.from(String(expectedHash || ""), "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function issueCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function maskEmail(email) {
  const [local, domain] = String(email || "").split("@");
  if (!local || !domain) return "your email address";
  return `${local.slice(0, 1)}${"*".repeat(Math.max(1, Math.min(6, local.length - 1)))}@${domain}`;
}

function createInvalidCode(code, defaultMessage) {
  return (message = defaultMessage) => {
    const error = new Error(message);
    error.statusCode = 400;
    error.code = code;
    return error;
  };
}

module.exports = {
  OTP_TTL_MS,
  MAX_ATTEMPTS,
  createInvalidCode,
  hashCode,
  issueCode,
  maskEmail,
  matchesCode
};
