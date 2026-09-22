const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const env = require("../src/config/env");
const repository = require("./pushRegistrationRepository");

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const FCM_REQUEST_TIMEOUT_MS = 15_000;
const FCM_DISPATCH_TIMEOUT_MS = 60_000;
let accessTokenCache = null;

function configForEnvironment(environment = "production") {
  if (environment === "sandbox") {
    return {
      projectId: env.fcmSandboxProjectId || "",
      clientEmail: env.fcmSandboxClientEmail || "",
      privateKey: env.fcmSandboxPrivateKey || ""
    };
  }
  return {
    projectId: env.fcmProjectId || "",
    clientEmail: env.fcmClientEmail || "",
    privateKey: env.fcmPrivateKey || ""
  };
}

function isConfigured(environment = "production") {
  const config = configForEnvironment(environment);
  return Boolean(config.projectId && config.clientEmail && config.privateKey);
}

function timeoutError() {
  const error = new Error("FCM request timed out.");
  error.statusCode = 504;
  return error;
}

async function fetchWithDeadline(url, options, deadline) {
  const remainingMs = Math.min(FCM_REQUEST_TIMEOUT_MS, deadline - Date.now());
  if (remainingMs <= 0) {
    throw timeoutError();
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), remainingMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw timeoutError();
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function getAccessToken(config, deadline) {
  const cacheKey = `${config.projectId}:${config.clientEmail}`;
  if (
    accessTokenCache?.key === cacheKey &&
    accessTokenCache.expiresAt > Date.now() + 60_000
  ) {
    return accessTokenCache.value;
  }
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    { iss: config.clientEmail, scope: FCM_SCOPE, aud: GOOGLE_TOKEN_URL, iat: now, exp: now + 3600 },
    config.privateKey,
    { algorithm: "RS256" }
  );
  const response = await fetchWithDeadline(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion })
  }, deadline);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    const error = new Error(data.error_description || "Unable to obtain the Firebase messaging access token.");
    error.statusCode = 502;
    throw error;
  }
  accessTokenCache = { key: cacheKey, value: data.access_token, expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000 };
  return accessTokenCache.value;
}

function buildData(payload) {
  return Object.fromEntries(
    Object.entries({
      eventType: payload.eventType,
      notificationId: payload.notificationId,
      ticketRef: payload.ticketRef,
      route: payload.route || payload.url,
      tag: payload.tag
    }).filter(([, value]) => value !== undefined && value !== null).map(([key, value]) => [key, String(value)])
  );
}

function collapseId(payload) {
  return String(payload.notificationId || payload.tag || "getprio-queue").slice(0, 64);
}

async function send(registration, payload, deadline, config) {
  if (!config.projectId || !config.clientEmail || !config.privateKey) return false;
  const accessToken = await getAccessToken(config, deadline);
  const response = await fetchWithDeadline(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        token: registration.token,
        notification: { title: payload.title, body: payload.body },
        data: buildData(payload),
        android: { priority: "high", collapseKey: collapseId(payload) },
        apns: {
          headers: { "apns-collapse-id": collapseId(payload) },
          payload: { aps: { sound: "default" } }
        }
      }
    })
  }, deadline);
  const data = await response.json().catch(() => ({}));
  if (response.ok) {
    await repository.recordSuccess(registration.id);
    return true;
  }
  const details = JSON.stringify(data);
  if (response.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/.test(details)) {
    await repository.deactivateByToken(registration.token);
  } else {
    await repository.recordFailure(registration.id);
  }
  const error = new Error(`FCM delivery failed (${response.status}).`);
  error.statusCode = response.status;
  throw error;
}

async function sendToRegistrations({ registrations = [], payload, timeoutMs = FCM_DISPATCH_TIMEOUT_MS, environment = "production" }) {
  const config = configForEnvironment(environment);
  if (!isConfigured(environment)) {
    return {
      attempted: 0,
      sent: 0,
      configured: false,
      outcomes: []
    };
  }

  let sent = 0;
  const outcomes = [];
  const deadline = Date.now() + Math.max(1, Number(timeoutMs) || FCM_DISPATCH_TIMEOUT_MS);
  for (const registration of registrations) {
    if (Date.now() >= deadline) {
      outcomes.push({
        registrationId: registration.id,
        installationId: registration.installationId,
        platform: registration.platform,
        status: "failed",
        statusCode: 504,
        error: "FCM request timed out."
      });
      continue;
    }
    try {
      if (await send(registration, payload, deadline, config)) {
        sent += 1;
        outcomes.push({
          registrationId: registration.id,
          installationId: registration.installationId,
          platform: registration.platform,
          status: "accepted"
        });
      }
    } catch (error) {
      console.warn("[fcm-push-failed]", { registrationId: registration.id, error: error.message });
      outcomes.push({
        registrationId: registration.id,
        installationId: registration.installationId,
        platform: registration.platform,
        status: "failed",
        statusCode: error.statusCode || null,
        error: error.message
      });
    }
  }
  return { attempted: registrations.length, sent, configured: true, outcomes };
}

async function sendToUser({ userId, payload, environment = "production" }) {
  if (!isConfigured(environment)) return { attempted: 0, sent: 0, configured: false, outcomes: [] };
  const registrations = await repository.listActiveByUserId(userId);
  return sendToRegistrations({ registrations, payload, environment });
}

function newNotificationId() {
  return crypto.randomUUID();
}

module.exports = { configForEnvironment, isConfigured, sendToRegistrations, sendToUser, newNotificationId };
