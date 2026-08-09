const idempotencyService = require("../services/idempotencyService");
const repository = require("../repositories/idempotency");

function buildOperationIdentity(req, scope) {
  const tenantId = req.authorizedTenant?._id || req.params?.tenantId || req.body?.tenantId || "platform";
  const target = req.params?.purchaseId || req.params?.providerDisputeId || req.params?.lotId ||
    req.params?.overrideId || req.params?.operationId || req.params?.subscriptionId ||
    req.params?.planSlug || req.params?.tenantSlug || req.params?.tenantId || req.body?.planSlug || "global";
  return { operation: scope, tenantId: String(tenantId), target: String(target) };
}

function requireIdempotency(scope) {
  return async function idempotencyMiddleware(req, res, next) {
    try {
      const identity = buildOperationIdentity(req, scope);
      const result = await idempotencyService.claim({
        actorId: req.user._id,
        scope: `${scope}:tenant=${identity.tenantId}:target=${identity.target}`,
        key: req.get("idempotency-key"),
        payload: { identity, body: req.body }
      });
      if (result.state === "replay") {
        res.status(result.statusCode || 200).json(result.body);
        return;
      }
      req.idempotency = result.record;
      const originalJson = res.json.bind(res);
      res.json = (body) => {
        repository.complete(result.record.id, res.statusCode, body).catch(next);
        return originalJson(body);
      };
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { buildOperationIdentity, requireIdempotency };
