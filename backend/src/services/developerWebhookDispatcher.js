const crypto = require("node:crypto");
const dns = require("node:dns").promises;
const https = require("node:https");
const net = require("node:net");
const env = require("../config/env");
const deliveries = require("../repositories/developerWebhookDeliveries");
const webhookService = require("./developerWebhookService");

function parseRetryAfter(value, now = Date.now()) {
  if (!value) return null;
  const seconds = Number(String(value).trim());
  if (Number.isFinite(seconds)) return seconds;
  const timestamp = Date.parse(String(value));
  return Number.isFinite(timestamp) ? Math.max(0, (timestamp - now) / 1000) : null;
}

function sendPinnedHttpsRequest(url, options = {}) {
  const parsed = new URL(url);
  return new Promise((resolve, reject) => {
    const request = https.request({
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: `${parsed.pathname}${parsed.search}`,
      method: options.method || "POST",
      headers: options.headers,
      servername: parsed.hostname.replace(/^\[|\]$/g, ""),
      rejectUnauthorized: true,
      lookup: (_hostname, _lookupOptions, callback) => callback(
        null,
        options.pinnedAddress,
        net.isIP(options.pinnedAddress)
      )
    }, (response) => {
      response.resume();
      resolve({
        status: response.statusCode || 0,
        headers: { get: (name) => response.headers[String(name).toLowerCase()] || null }
      });
    });
    request.setTimeout(options.timeoutMs || env.developerWebhookTimeoutMs, () => {
      request.destroy(new Error("Webhook request timed out."));
    });
    request.on("error", reject);
    request.end(options.body || "");
  });
}

function createDeveloperWebhookDispatcher(options = {}) {
  const workerId = options.workerId || `developer-webhook-${process.pid}-${crypto.randomUUID()}`;
  const fetchImpl = options.fetch || sendPinnedHttpsRequest;
  const lookup = options.lookup || dns.lookup;
  const cleanupExpired = options.cleanupExpired;
  const now = options.now || (() => Date.now());
  const random = options.random || Math.random;
  let activeBatch = null;

  async function deliver(delivery) {
    const payloadBody = String(delivery.payloadBody || "");
    if (Buffer.byteLength(payloadBody, "utf8") > env.developerWebhookMaxBodyBytes) {
      const error = new Error("Webhook payload exceeds the configured body limit.");
      error.permanent = true;
      throw error;
    }
    const destination = await webhookService.validateDestination(delivery.url, { lookup, returnAddress: true });
    const secret = webhookService.decryptSecret(delivery.signingSecretCiphertext);
    const previousSecret = delivery.previousSigningSecretCiphertext &&
      (!delivery.previousSigningSecretExpiresAt || new Date(delivery.previousSigningSecretExpiresAt).getTime() > now())
      ? webhookService.decryptSecret(delivery.previousSigningSecretCiphertext)
      : undefined;
    const timestamp = Math.floor(now() / 1000);
    const headers = {
      "content-type": "application/json",
      "user-agent": "GetPrio-Webhooks/1",
      "GetPrio-Event-Id": delivery.eventId,
      "GetPrio-Signature": webhookService.buildSignatureHeader({
        payload: payloadBody,
        secret,
        previousSecret,
        previousSecretExpiresAt: delivery.previousSigningSecretExpiresAt,
        timestamp,
        period: 1
      })
    };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.developerWebhookTimeoutMs);
    try {
      const response = await fetchImpl(destination.url, {
        method: "POST",
        headers,
        body: payloadBody,
        redirect: "error",
        pinnedAddress: destination.address,
        timeoutMs: env.developerWebhookTimeoutMs,
        signal: controller.signal
      });
      if (response.status >= 200 && response.status < 300) {
        return { status: response.status };
      }
      const error = new Error(`Webhook receiver returned HTTP ${response.status}.`);
      error.responseStatus = response.status;
      error.retryAfter = parseRetryAfter(response.headers?.get?.("retry-after"), now());
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function runBatch(limit = 25) {
    if (activeBatch) return activeBatch;
    activeBatch = (async () => {
      const claimed = await deliveries.claimBatch(workerId, limit);
      for (const delivery of claimed) {
        try {
          const result = await deliver(delivery);
          await deliveries.markSent(delivery.id, workerId, result.status);
        } catch (error) {
          const expiresAt = delivery.retryUntil ? new Date(delivery.retryUntil).getTime() : Infinity;
          const retryAt = now() + webhookService.retryDelayMs(delivery.attemptCount, error.retryAfter, now(), random);
          const canRetry = !error.permanent && retryAt < expiresAt;
          if (canRetry) {
            await deliveries.markRetry(delivery.id, workerId, new Date(retryAt), error.message, error.responseStatus);
          } else {
            await deliveries.markFailed(delivery.id, workerId, error.message, error.responseStatus);
          }
        }
      }
      if (typeof cleanupExpired === "function") await cleanupExpired();
      return claimed.length;
    })();
    try {
      return await activeBatch;
    } finally {
      activeBatch = null;
    }
  }

  function start(intervalMs = 10000) {
    if (timer) return;
    timer = setInterval(() => {
      runBatch().catch((error) => console.error("[developer-webhook-dispatch] batch failed", error));
    }, intervalMs);
    timer.unref?.();
  }

  async function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    if (activeBatch) await activeBatch;
  }

  let timer = null;
  return { deliver, runBatch, start, stop, workerId };
}

module.exports = { createDeveloperWebhookDispatcher, parseRetryAfter };
