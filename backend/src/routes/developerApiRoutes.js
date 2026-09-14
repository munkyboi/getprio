const express = require("express");

const router = express.Router();

const PRODUCTION_HOSTS = new Set(["api.getprio.online"]);
const SANDBOX_HOSTS = new Set(["sandbox-api.getprio.online"]);

function getEnvironment(req) {
  const hostname = String(req.hostname || req.headers.host || "")
    .trim()
    .toLowerCase()
    .split(":")[0];

  if (SANDBOX_HOSTS.has(hostname)) {
    return "sandbox";
  }

  if (PRODUCTION_HOSTS.has(hostname)) {
    return "production";
  }

  return "unknown";
}

function getRequestId(req) {
  return req.context?.correlationId || req.headers["x-request-id"] || "unknown";
}

function sendEnvelope(req, res, data) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-API-Version", "v1");
  res.json({ data, request_id: getRequestId(req) });
}

router.get("/", (req, res) => {
  const environment = getEnvironment(req);
  const baseUrl = environment === "sandbox"
    ? "https://sandbox-api.getprio.online/v1"
    : environment === "production"
      ? "https://api.getprio.online/v1"
      : null;

  sendEnvelope(req, res, {
    service: "getprio-queue-api",
    version: "v1",
    environment,
    base_url: baseUrl,
    documentation_url: "https://developers.getprio.online"
  });
});

router.get("/health", (req, res) => {
  sendEnvelope(req, res, {
    status: "ok",
    service: "getprio-queue-api",
    version: "v1",
    environment: getEnvironment(req)
  });
});

module.exports = router;
