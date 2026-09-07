const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const env = require("../src/config/env");
const repository = require("./pushRegistrationRepository");

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
let accessTokenCache = null;

function isConfigured() {
  return Boolean(env.fcmProjectId && env.fcmClientEmail && env.fcmPrivateKey);
}

async function getAccessToken() {
  if (accessTokenCache && accessTokenCache.expiresAt > Date.now() + 60_000) {
    return accessTokenCache.value;
  }
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    { iss: env.fcmClientEmail, scope: FCM_SCOPE, aud: GOOGLE_TOKEN_URL, iat: now, exp: now + 3600 },
    env.fcmPrivateKey,
    { algorithm: "RS256" }
  );
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    const error = new Error(data.error_description || "Unable to obtain the Firebase messaging access token.");
    error.statusCode = 502;
    throw error;
  }
  accessTokenCache = { value: data.access_token, expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000 };
  return accessTokenCache.value;
}

function buildData(payload) {
  return Object.fromEntries(
    Object.entries({
      eventType: payload.eventType,
      notificationId: payload.notificationId,
      ticketRef: payload.ticketRef,
      route: payload.url,
      tag: payload.tag
    }).filter(([, value]) => value !== undefined && value !== null).map(([key, value]) => [key, String(value)])
  );
}

async function send(registration, payload) {
  if (!isConfigured()) return false;
  const accessToken = await getAccessToken();
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(env.fcmProjectId)}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        token: registration.token,
        notification: { title: payload.title, body: payload.body },
        data: buildData(payload),
        android: { priority: "high" },
        apns: { payload: { aps: { sound: "default" } } }
      }
    })
  });
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

async function sendToRegistrations({ registrations = [], payload }) {
  if (!isConfigured()) {
    return {
      attempted: 0,
      sent: 0,
      configured: false,
      outcomes: []
    };
  }

  let sent = 0;
  const outcomes = [];
  for (const registration of registrations) {
    try {
      if (await send(registration, payload)) {
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

async function sendToUser({ userId, payload }) {
  if (!isConfigured()) return { attempted: 0, sent: 0, configured: false, outcomes: [] };
  const registrations = await repository.listActiveByUserId(userId);
  return sendToRegistrations({ registrations, payload });
}

function newNotificationId() {
  return crypto.randomUUID();
}

module.exports = { isConfigured, sendToRegistrations, sendToUser, newNotificationId };
