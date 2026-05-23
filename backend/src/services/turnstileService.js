const crypto = require("crypto");
const env = require("../config/env");

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function isTurnstileConfigured() {
  return Boolean(env.turnstileSecretKey);
}

async function verifyTurnstileToken({ token, remoteIp }) {
  if (!isTurnstileConfigured()) {
    return {
      success: true,
      skipped: true
    };
  }

  if (!token || String(token).length > 2048) {
    return {
      success: false,
      errorCodes: ["missing-input-response"]
    };
  }

  const response = await fetch(SITEVERIFY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      secret: env.turnstileSecretKey,
      response: token,
      remoteip: remoteIp,
      idempotency_key: crypto.randomUUID()
    })
  });

  const data = await response.json().catch(() => ({}));
  return {
    success: Boolean(response.ok && data.success),
    errorCodes: data["error-codes"] || [],
    hostname: data.hostname || "",
    action: data.action || ""
  };
}

module.exports = {
  isTurnstileConfigured,
  verifyTurnstileToken
};
