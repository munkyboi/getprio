const crypto = require("node:crypto");
const dns = require("node:dns").promises;
const net = require("node:net");
const env = require("../config/env");
const deliveryRepository = require("../repositories/developerWebhookDeliveries");

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

const QUEUE_EVENT_TYPES = Object.freeze({
  ticket_created: "ticket.issued",
  ticket_called: "ticket.called",
  ticket_served: "ticket.served",
  ticket_skipped: "ticket.skipped",
  ticket_requeued: "ticket.restored",
  ticket_cancelled: "ticket.cancelled",
  ticket_unserved: "ticket.unserved",
  ticket_expired: "ticket.expired"
});
const SAFE_QUEUE_EVENT_METADATA = new Set([
  "joinChannel",
  "serviceCounterId",
  "reason",
  "reasonCode",
  "servicePriorityBand",
  "queueDateKey"
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

async function resolveDestination(value, options = {}) {
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
  return { url: url.toString(), address: addresses[0] };
}

async function validateDestination(value, options = {}) {
  const resolved = await resolveDestination(value, options);
  return options.returnAddress ? resolved : resolved.url;
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

function buildQueueEventPayload({ event, ticket, projectId, environment }) {
  const type = QUEUE_EVENT_TYPES[event?.eventType];
  if (!type || !event?._id || !ticket?._id) return null;
  const metadata = Object.fromEntries(
    Object.entries(event.metadata || {}).filter(([key]) => SAFE_QUEUE_EVENT_METADATA.has(key))
  );
  return {
    id: `queue_event:${event._id}`,
    type,
    payload_version: 1,
    project_id: String(projectId),
    environment,
    occurred_at: event.createdAt,
    resource: {
      type: "ticket",
      id: String(ticket._id),
      version: String(event._id)
    },
    data: {
      ticket: {
        id: String(ticket._id),
        ticket_number: ticket.ticketNumber,
        status: ticket.status,
        location_id: String(ticket.locationId),
        queue_date_key: ticket.dateKey,
        join_channel: ticket.joinChannel,
        service_priority_band: ticket.servicePriorityBand,
        status_reason: ticket.statusReason || null,
        called_at: ticket.calledAt || null,
        served_at: ticket.servedAt || null,
        skipped_at: ticket.skippedAt || null,
        cancelled_at: ticket.cancelledAt || null,
        unserved_at: ticket.unservedAt || null,
        terminal_at: ticket.terminalAt || null
      },
      transition: {
        from_status: event.fromStatus || null,
        to_status: event.toStatus || null,
        source: event.source || "system",
        metadata
      }
    }
  };
}

async function enqueueQueueEvent({ event, ticket, developerWebhook }, options = {}) {
  if (!developerWebhook?.projectId || !developerWebhook?.environment) return null;
  const payload = buildQueueEventPayload({
    event,
    ticket,
    projectId: developerWebhook.projectId,
    environment: developerWebhook.environment
  });
  if (!payload) return null;
  return enqueueEvent({
    projectId: developerWebhook.projectId,
    environment: developerWebhook.environment,
    eventId: payload.id,
    eventType: payload.type,
    payloadVersion: payload.payload_version,
    payload
  }, options);
}

function retryDelayMs(attemptCount, retryAfter, now = Date.now(), random = Math.random) {
  const base = Math.min(60 * 60 * 1000, 30 * 1000 * (2 ** Math.max(0, Number(attemptCount || 1) - 1)));
  let delay = base;
  if (retryAfter !== null && retryAfter !== undefined) {
    const seconds = Number(String(retryAfter).trim());
    const retryAt = Number.isFinite(seconds)
      ? now + Math.max(0, seconds) * 1000
      : Date.parse(String(retryAfter));
    if (Number.isFinite(retryAt)) delay = Math.max(delay, retryAt - now);
  }
  if (retryAfter === null || retryAfter === undefined) {
    delay = Math.min(60 * 60 * 1000, delay + Math.floor(base * 0.2 * Math.max(0, Math.min(1, random()))));
  }
  return Math.max(0, delay);
}

async function enqueueEvent({ projectId, environment, eventId, eventType, payloadVersion = 1, payload = {}, renderPayload }, options = {}) {
  if (!WEBHOOK_EVENTS.includes(eventType)) throw invalid("eventType is not supported.");
  if (!String(eventId || "").trim()) throw invalid("eventId is required.");
  if (!["sandbox", "production"].includes(environment)) throw invalid("environment must be sandbox or production.");
  if (!options.client) {
    const error = new Error("Webhook event fan-out must share the business transaction client.");
    error.statusCode = 500;
    error.code = "WEBHOOK_TRANSACTION_REQUIRED";
    throw error;
  }
  const normalizedPayloadVersion = normalizePayloadVersion(payloadVersion);
  const body = rawPayload(payload);
  if (Buffer.byteLength(body, "utf8") > env.developerWebhookMaxBodyBytes) {
    throw invalid("Webhook payload exceeds the configured body limit.");
  }
  const retentionDays = environment === "production"
    ? env.developerWebhookProductionRetentionDays
    : env.developerWebhookSandboxRetentionDays;
  const now = Date.now();
  return deliveryRepository.enqueueForRegistrations({
    projectId,
    environment,
    eventId,
    eventType,
    payloadVersion: normalizedPayloadVersion,
    payloadBody: body,
    payload,
    renderPayload,
    maxBodyBytes: env.developerWebhookMaxBodyBytes,
    expiresAt: new Date(now + retentionDays * 24 * 60 * 60 * 1000),
    retryUntil: new Date(now + 24 * 60 * 60 * 1000)
  }, options);
}

function buildSignatureHeader({ payload, secret, previousSecret, previousSecretExpiresAt, timestamp = Math.floor(Date.now() / 1000), period = 1 }) {
  const body = rawPayload(payload);
  const signedPayload = `${timestamp}.${period}.${body}`;
  const secrets = [secret];
  if (previousSecret && (!previousSecretExpiresAt || new Date(previousSecretExpiresAt).getTime() > timestamp * 1000)) {
    secrets.push(previousSecret);
  }
  const signatures = secrets.map((value) => crypto.createHmac("sha256", String(value)).update(signedPayload).digest("hex"));
  return `t=${timestamp},p=${period},${signatures.map((signature) => `v1=${signature}`).join(",")}`;
}

function verifySignature({ payload, header, secret, previousSecret, previousSecretExpiresAt, toleranceSeconds = 300, now = Math.floor(Date.now() / 1000) }) {
  const values = {};
  for (const [key, value] of String(header || "").split(",").map((part) => part.split("=", 2)).filter(([partKey, partValue]) => partKey && partValue)) {
    values[key] = values[key] ? [...(Array.isArray(values[key]) ? values[key] : [values[key]]), value] : value;
  }
  const timestamp = Number(values.t);
  if (!Number.isSafeInteger(timestamp) || Math.abs(now - timestamp) > toleranceSeconds || !values.p || !values.v1) return false;
  const expectedValues = buildSignatureHeader({ payload, secret, previousSecret, previousSecretExpiresAt, timestamp, period: values.p })
    .split(",")
    .filter((value) => value.startsWith("v1="))
    .map((value) => value.slice(3));
  const receivedValues = Array.isArray(values.v1) ? values.v1 : [values.v1];
  return receivedValues.some((value) => {
    const received = Buffer.from(value, "hex");
    return expectedValues.some((expected) => {
      const expectedBuffer = Buffer.from(expected, "hex");
      return received.length === expectedBuffer.length && crypto.timingSafeEqual(received, expectedBuffer);
    });
  });
}

module.exports = {
  WEBHOOK_EVENTS,
  QUEUE_EVENT_TYPES,
  buildQueueEventPayload,
  buildSignatureHeader,
  createSigningSecret,
  decryptSecret,
  encryptSecret,
  normalizeEvents,
  normalizeName,
  normalizePayloadVersion,
  enqueueQueueEvent,
  enqueueEvent,
  rawPayload,
  retryDelayMs,
  resolveDestination,
  validateDestination,
  verifySignature
};
