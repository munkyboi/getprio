function errorHandler(error, req, res, _next) {
  const statusCode = error.statusCode || 500;
  const message = error.message || "Unexpected server error.";

  if (
    req.user
    && !["GET", "HEAD", "OPTIONS"].includes(String(req.method || "GET").toUpperCase())
    && /^\/api\/(platform|billing)(?:\/|$)/.test(String(req.originalUrl || ""))
  ) {
    const securityAuditService = require("../services/securityAuditService");
    securityAuditService.record({
      actorId: req.user._id,
      actorRole: req.user.roles?.includes("platform_admin") ? "platform_admin" : "vendor",
      sessionId: req.auth?.sessionId || null,
      action: `${String(req.method).toLowerCase()} ${String(req.route?.path || req.path || "unknown")}`,
      resourceType: "request",
      resourceId: req.context?.correlationId || "unavailable",
      reason: req.body?.reason || message,
      outcome: statusCode >= 500 ? "failure" : "denied",
      metadata: { statusCode, errorCode: error.code || null, correlationId: req.context?.correlationId || null }
    }).catch((auditError) => console.error("[security-audit-write-failed]", auditError));
  }

  if (statusCode >= 500) {
    console.error(error);
  }

  res.status(statusCode).json({
    message,
    ...(req.context?.correlationId ? { correlationId: req.context.correlationId } : {}),
    ...(error.code ? { code: error.code } : {})
  });
}

module.exports = errorHandler;
