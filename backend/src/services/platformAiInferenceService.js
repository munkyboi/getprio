const db = require("../config/db");
const policy = require("./aiInferencePolicy");
const permissions = require("./permissions");
const privileged = require("./privilegedTransactionService");
const audit = require("../repositories/securityAudit");

const ACTION = "platform.ai_inference.policy.update";
const FACTS = Object.freeze({
  callerIntegrated: false,
  producerReady: false,
  shadowApproved: false,
});
function auditReason(reason) {
  const normalized = String(reason || "")
    .trim()
    .replace(/\s+/g, " ");
  if (normalized.length < 8 || normalized.length > 500)
    policy.invalid("Enter an audit reason between 8 and 500 characters.");
  return normalized;
}
async function readPolicy(client = db.pool, lock = "") {
  return policy.mapPolicy(
    (await client.query(`SELECT * FROM ai_inference_policy WHERE id=1${lock}`))
      .rows[0],
  );
}
async function lockAuthority(client, actorId, sessionId) {
  // Match privileged writer order: actor first, then session, then policy.
  // SHARE locks prevent role/access/session revocation until this write commits.
  const actor = (
    await client.query(
      `SELECT id,roles,deletion_requested_at,platform_access_suspended_at,mfa_enabled
    FROM users WHERE id=$1 FOR SHARE`,
      [actorId],
    )
  ).rows[0];
  if (
    !actor ||
    actor.deletion_requested_at ||
    actor.platform_access_suspended_at ||
    !actor.mfa_enabled
  ) {
    policy.invalid(
      "Platform authority is no longer active.",
      403,
      "AI_AUTHORITY_REVOKED",
    );
  }
  permissions.assertPermission(
    { roles: actor.roles },
    "platform.ai_inference.manage",
  );
  const session = (
    await client.query(
      `SELECT * FROM auth_sessions WHERE id=$1 AND user_id=$2 FOR SHARE`,
      [sessionId, actorId],
    )
  ).rows[0];
  if (!session || session.status !== "active" || session.surface !== "app")
    policy.invalid(
      "The session is no longer active.",
      401,
      "AI_SESSION_REVOKED",
    );
  return {
    _id: String(session.id),
    primaryAuthenticatedAt: session.primary_authenticated_at,
    mfaVerifiedAt: session.mfa_verified_at,
    expiresAt: session.expires_at,
    absoluteExpiresAt: session.absolute_expires_at,
    inactivityExpiresAt: session.inactivity_expires_at,
  };
}
function assertSession(session) {
  for (const expires of [
    session.expiresAt,
    session.absoluteExpiresAt,
    session.inactivityExpiresAt,
  ].filter(Boolean)) {
    if (new Date(expires).getTime() <= Date.now())
      policy.invalid("The session has expired.", 401, "AI_SESSION_EXPIRED");
  }
  privileged.assertRecentAssurance(session);
}
async function status(current, client = db.pool) {
  const locations = current.pilots.length
    ? (
        await client.query(
          `SELECT t.id::text AS "tenantId",l.id::text AS "locationId",t.name AS "tenantName",l.name AS "locationName"
    FROM jsonb_to_recordset($1::jsonb) AS p("tenantId" TEXT,"locationId" TEXT)
    JOIN store_locations l ON l.id=p."locationId"::bigint AND l.tenant_id=p."tenantId"::bigint
    JOIN tenants t ON t.id=l.tenant_id`,
          [JSON.stringify(current.pilots)],
        )
      ).rows
    : [];
  return {
    policy: current,
    effectiveMode: "off",
    predictor: {
      kind: "deterministic",
      version: require("./resourceShadowProjection").PREDICTOR_VERSION,
      target: require("./resourceShadowProjection").TARGET,
    },
    readiness: {
      status: "not_ready",
      blockers: [
        "caller_not_integrated",
        "producer_not_ready",
        "shadow_approval_missing",
        "customer_rollout_not_approved",
      ],
    },
    capture: {
      status: "not_integrated",
      privacyApproval: "not_recorded",
      detail:
        "Resource service-start capture is not integrated. Existing baseline capture is unchanged.",
    },
    diagnostics: {
      status: "not_collected",
      forecastSupport: null,
      latencyMs: null,
      errors: null,
      lastEvidenceAt: null,
    },
    pilots: current.pilots.map((scope) => ({
      ...scope,
      ...locations.find(
        (location) =>
          location.tenantId === scope.tenantId &&
          location.locationId === scope.locationId,
      ),
      ...policy.decide(current, scope, FACTS),
    })),
  };
}
async function read(user) {
  permissions.assertPermission(user, "platform.ai_inference.read");
  return status(await readPolicy());
}
async function preview({ user, session, draft, reason }) {
  permissions.assertPermission(user, "platform.ai_inference.manage");
  const normalized = policy.normalizePolicy(draft);
  const current = await readPolicy();
  const confirmation = await privileged.issueConfirmation({
    actorId: user._id,
    session,
    action: ACTION,
    target: "global",
    reason: auditReason(reason),
    payload: normalized,
    previewRevision: current.revision,
  });
  return { policy: normalized, revision: current.revision, confirmation };
}
async function update({
  user,
  session,
  draft,
  reason,
  expectedRevision,
  confirmationToken,
  operationKey,
}) {
  permissions.assertPermission(user, "platform.ai_inference.manage");
  privileged.assertRecentAssurance(session);
  const normalized = policy.normalizePolicy(draft);
  const normalizedReason = auditReason(reason);
  if (
    typeof operationKey !== "string" ||
    operationKey.length < 8 ||
    operationKey.length > 128
  )
    policy.invalid("An idempotency key is required.");
  if (
    typeof expectedRevision !== "string" ||
    !/^[1-9]\d{0,18}$/.test(expectedRevision)
  )
    policy.invalid("Invalid policy revision.");
  const digest = privileged.buildPayloadDigest({
    policy: normalized,
    reason: normalizedReason,
    expectedRevision,
  });
  return db.withTransaction(async (client) => {
    const currentSession = await lockAuthority(client, user._id, session._id);
    const current = await readPolicy(client, " FOR UPDATE");
    // Recheck wall-clock assurance after any policy-lock wait, including replay.
    assertSession(currentSession);
    const receipt = (
      await client.query(
        "SELECT payload_digest,response FROM ai_inference_policy_operations WHERE actor_user_id=$1 AND operation_key=$2",
        [user._id, operationKey],
      )
    ).rows[0];
    if (receipt) {
      if (receipt.payload_digest !== digest)
        policy.invalid(
          "This idempotency key was already used for another policy.",
          409,
          "AI_POLICY_KEY_CONFLICT",
        );
      return receipt.response;
    }
    if (current.revision !== expectedRevision)
      policy.invalid(
        "The policy changed. Refresh and review it again.",
        409,
        "AI_POLICY_STALE",
      );
    for (const scope of normalized.pilots) {
      if (
        !(
          await client.query(
            "SELECT id FROM store_locations WHERE tenant_id=$1 AND id=$2",
            [scope.tenantId, scope.locationId],
          )
        ).rows.length
      )
        policy.invalid(
          "Pilot location does not belong to the selected tenant.",
          404,
          "AI_SCOPE_NOT_FOUND",
        );
    }
    await privileged.consumeConfirmation(
      {
        token: confirmationToken,
        actorId: user._id,
        session: currentSession,
        action: ACTION,
        target: "global",
        reason: normalizedReason,
        payload: normalized,
        previewRevision: expectedRevision,
        currentPreviewRevision: current.revision,
      },
      { client },
    );
    const updated = policy.mapPolicy(
      (
        await client.query(
          `UPDATE ai_inference_policy SET revision=revision+1,
      requested_mode=$1,timeout_ms=$2,freshness_ms=$3,pilots=$4::jsonb,updated_at=clock_timestamp() WHERE id=1 RETURNING *`,
          [
            normalized.requestedMode,
            normalized.timeoutMs,
            normalized.freshnessMs,
            JSON.stringify(normalized.pilots),
          ],
        )
      ).rows[0],
    );
    await audit.appendEvent(
      {
        actorId: user._id,
        actorRole: "platform_admin",
        sessionId: session._id,
        action: ACTION,
        resourceType: "ai_inference_policy",
        resourceId: "global",
        reason: normalizedReason,
        outcome: "success",
        beforeState: current,
        afterState: updated,
        metadata: {
          policyVersion: "ai-inference-policy.v1",
          scope: "global_and_listed_pilots",
        },
      },
      { client },
    );
    const response = await status(updated, client);
    await client.query(
      "INSERT INTO ai_inference_policy_operations (actor_user_id,operation_key,payload_digest,response) VALUES ($1,$2,$3,$4::jsonb)",
      [user._id, operationKey, digest, JSON.stringify(response)],
    );
    return response;
  });
}
async function searchScopes(user, query) {
  permissions.assertPermission(user, "platform.ai_inference.read");
  if (typeof query !== "string" || query.length > 100)
    policy.invalid("Enter a shorter location search.");
  const rows = (
    await db.pool.query(
      `SELECT t.id::text AS "tenantId",t.name AS "tenantName",l.id::text AS "locationId",l.name AS "locationName"
    FROM tenants t JOIN store_locations l ON l.tenant_id=t.id WHERE t.name ILIKE $1 OR l.name ILIKE $1
    ORDER BY t.name,l.name,l.id LIMIT 50`,
      [`%${query.trim()}%`],
    )
  ).rows;
  return { scopes: rows, limited: rows.length === 50 };
}
// Future trusted callers must re-read on admission AND inside their acceptance/
// publication transaction. FOR SHARE serializes publication with global disable.
// No process-local policy cache and no caller/provider/capture wiring in this slice.
function createBoundary({ authorize }) {
  if (typeof authorize !== "function")
    policy.invalid("A trusted scope authorizer is required.", 500);
  async function scopeFor(input, client) {
    const scope = {
      tenantId: policy.identifier(input?.tenantId),
      locationId: policy.identifier(input?.locationId),
    };
    if ((await authorize(client, scope)) !== true)
      policy.invalid("Inference scope access denied.", 403);
    return scope;
  }
  return {
    async admit(input, client = db.pool) {
      const scope = await scopeFor(input, client);
      return policy.decide(await readPolicy(client), scope, FACTS);
    },
    async accept(admission, client) {
      if (!client || client === db.pool)
        policy.invalid("Acceptance requires the caller transaction.", 500);
      const scope = await scopeFor(admission?.scope, client);
      const current = policy.decide(
        await readPolicy(client, " FOR SHARE"),
        scope,
        FACTS,
      );
      return policy.accepts(admission, current);
    },
  };
}
module.exports = { read, preview, update, searchScopes, createBoundary };
