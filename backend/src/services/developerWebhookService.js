const crypto = require("node:crypto");
const dns = require("node:dns").promises;
const net = require("node:net");
const env = require("../config/env");

const WEBHOOK_EVENTS = Object.freeze([
  "queue.session.opened",
  "queue.intake.paused",
  "queue.intake.resumed",
  "queue.session.extended",
  "queue.session.closing",
  "queue.session.closed",
  "ticket.issued",
  "ticket.called",
  "ticket.served",
  "ticket.skipped",
  "ticket.restored",
  "ticket.cancelled",
  "ticket.unserved",
  "ticket.expired"
]);

function invalid(message, code = "INVALID_WEBHOOK") {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = code;
  return error;
}

function normalizeEvents(value) {
  const events = value === undefined ? [...WEBHOOK_EVENTS] : value;
  if (!Array.isArray(events) || events.length === 0) {
    throw invalid("events must contain at least one supported event type.");
  }
  const normalized = [...new Set(events.map((event) => String(event).trim()))];
  if (normalized.some((event) => !WEBHOOK_EVENTS.includes(event))) {
    throw invalid("events contains an unsupported event type.");
  }
  return normalized;
}

function normalizeName(value) {
  const name = String(value || "").trim();
  if (!name || name.length > 80) throw invalid("Webhook name must be between 1 and 80 characters.");
  return name;
}

function normalizePayloadVersion(value) {
  const version = value === undefined ? 1 : Number(value);
  if (!Number.isSafeInteger(version) || version < 1) {
    throw invalid("payloadVersion must be a positive integer.");
  }
  return version;
}

function isPrivateAddress(address) {
  const normalized = String(address || "").toLowerCase();
  if (net.isIPv4(normalized)) {
    const octets = normalized.split(".").map(Number);
    const first = octets[0];
    const second = octets[1];
    const third = octets[2];
    return first === 0 || first === 10 || first === 127 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (octets[0] === 169 && octets[1] === 254) ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (first === 192 && second === 0 && third === 0) ||
      (first === 192 && second === 0 && third === 2) ||
      (first === 192 && second === 31 && third === 196) ||
      (first === 192 && second === 52 && third === 193) ||
      (first === 192 && second === 88 && third === 99) ||
      (first === 192 && second === 168) ||
      (first === 198 && second === 18) ||
      (first === 198 && second === 19) ||
      (first === 198 && second === 51 && third === 100) ||
      (first === 203 && second === 0 && third === 113) ||
      first >= 224;
  }
  if (net.isIPv6(normalized)) {
    if (normalized === "::" || normalized === "::1") return true;
    if (normalized.startsWith("::ffff:")) {
      return isPrivateAddress(normalized.slice("::ffff:".length));
    }
    return normalized.startsWith("fc") || normalized.startsWith("fd") ||
      normalized.startsWith("fe8") || normalized.startsWith("fe9") ||
      normalized.startsWith("fea") || normalized.startsWith("feb") ||
      normalized.startsWith("ff") || normalized.startsWith("2001:db8:") ||
      normalized.startsWith("2001:0000:") || normalized.startsWith("2001:2:") ||
      normalized.startsWith("2001:10:") || normalized.startsWith("3fff:");
  }
  return false;
}

async function validateDestination(value, options = {}) {
  let url;
  try {
    url = new URL(String(value || "").trim());
  } catch {
    throw invalid("Webhook URL must be a valid HTTPS URL.");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw invalid("Webhook URL must use HTTPS without credentials or a fragment.");
  }
  if (url.hostname === "localhost" || url.hostname.endsWith(".localhost") || url.hostname === "metadata.google.internal") {
    throw invalid("Webhook URL must resolve to a public address.");
  }

  const lookup = options.lookup || dns.lookup;
  let records;
  try {
    records = await lookup(url.hostname, { all: true, verbatim: true });
  } catch {
    throw invalid("Webhook URL hostname could not be resolved.");
  }
  const addresses = Array.isArray(records) ? records.map((record) => record.address || record) : [records.address || records];
  if (!addresses.length || addresses.some(isPrivateAddress)) {
    throw invalid("Webhook URL must resolve only to public addresses.");
  }
  return url.toString();
}

function encryptionKey() {
  return crypto.createHash("sha256").update(String(env.developerWebhookEncryptionKey)).digest();
}

function encryptSecret(secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(secret), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

function decryptSecret(value) {
  const [version, ivValue, tagValue, ciphertextValue] = String(value || "").split(".");
  if (version !== "v1" || !ivValue || !tagValue || !ciphertextValue) throw new Error("Invalid webhook secret ciphertext.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextValue, "base64url")), decipher.final()]).toString("utf8");
}

function createSigningSecret() {
  return `whsec_${crypto.randomBytes(32).toString("base64url")}`;
}

function rawPayload(payload) {
  return typeof payload === "string" ? payload : JSON.stringify(payload);
}

function buildSignatureHeader({ payload, secret, timestamp = Math.floor(Date.now() / 1000), period = 1 }) {
  const body = rawPayload(payload);
  const signedPayload = `${timestamp}.${period}.${body}`;
  const digest = crypto.createHmac("sha256", String(secret)).update(signedPayload).digest("hex");
  return `t=${timestamp},p=${period},v1=${digest}`;
}

function verifySignature({ payload, header, secret, toleranceSeconds = 300, now = Math.floor(Date.now() / 1000) }) {
  const values = Object.fromEntries(String(header || "").split(",").map((part) => part.split("=", 2)).filter(([key, value]) => key && value));
  const timestamp = Number(values.t);
  if (!Number.isSafeInteger(timestamp) || Math.abs(now - timestamp) > toleranceSeconds || !values.p || !values.v1) return false;
  const expected = buildSignatureHeader({ payload, secret, timestamp, period: values.p }).split(",v1=")[1];
  const received = Buffer.from(values.v1, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return received.length === expectedBuffer.length && crypto.timingSafeEqual(received, expectedBuffer);
}

module.exports = {
  WEBHOOK_EVENTS,
  buildSignatureHeader,
  createSigningSecret,
  decryptSecret,
  encryptSecret,
  normalizeEvents,
  normalizeName,
  normalizePayloadVersion,
  validateDestination,
  verifySignature
};
