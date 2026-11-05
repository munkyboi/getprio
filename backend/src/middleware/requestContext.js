const { AsyncLocalStorage } = require("node:async_hooks");
const { randomUUID } = require("node:crypto");

const requestContextStorage = new AsyncLocalStorage();
const SAFE_CORRELATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

function normalizeCorrelationId(value) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return SAFE_CORRELATION_ID.test(String(candidate || "")) ? String(candidate) : randomUUID();
}

function createRequestContextMiddleware({ rolloutCohort = "off" } = {}) {
  const serverRolloutCohort = String(rolloutCohort || "off").slice(0, 64);

  return function requestContextMiddleware(req, res, next) {
    const context = Object.freeze({
      correlationId: normalizeCorrelationId(req.headers?.["x-correlation-id"]),
      rolloutCohort: serverRolloutCohort
    });

    req.context = context;
    res.setHeader("X-Correlation-ID", context.correlationId);
    requestContextStorage.run(context, next);
  };
}

function getRequestContext() {
  return requestContextStorage.getStore() || null;
}

module.exports = {
  createRequestContextMiddleware,
  getRequestContext,
  normalizeCorrelationId
};
