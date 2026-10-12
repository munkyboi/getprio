const { PREDICTOR_VERSION, TARGET } = require("./resourceShadowProjection");

function invalid(message, statusCode = 400, code = "INVALID_AI_POLICY") {
  throw Object.assign(new Error(message), { statusCode, code });
}
function identifier(value) {
  if (
    typeof value !== "string" ||
    !/^[1-9]\d{0,18}$/.test(value) ||
    BigInt(value) > 9223372036854775807n
  )
    invalid("Select a valid tenant and location.");
  return value;
}
function normalizePolicy(input) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some(
      (key) =>
        !["requestedMode", "timeoutMs", "freshnessMs", "pilots"].includes(key),
    )
  )
    invalid("Unsupported inference policy field.");
  if (!["off", "private_shadow"].includes(input.requestedMode))
    invalid("Customer estimates are not approved.");
  for (const [key, maximum] of [
    ["timeoutMs", 1000],
    ["freshnessMs", 5000],
  ]) {
    if (
      !Number.isSafeInteger(input[key]) ||
      input[key] < 1 ||
      input[key] > maximum
    )
      invalid(`Invalid ${key}.`);
  }
  if (!Array.isArray(input.pilots) || input.pilots.length > 100)
    invalid("Select at most 100 pilot locations.");
  const seen = new Set();
  const pilots = input.pilots
    .map((pilot) => {
      if (
        !pilot ||
        Object.keys(pilot).some(
          (key) => !["tenantId", "locationId", "requestedMode"].includes(key),
        )
      )
        invalid("Invalid pilot policy.");
      const tenantId = identifier(pilot.tenantId),
        locationId = identifier(pilot.locationId);
      const key = `${tenantId}:${locationId}`;
      if (
        seen.has(key) ||
        !["off", "private_shadow"].includes(pilot.requestedMode)
      )
        invalid("Duplicate or invalid pilot location.");
      seen.add(key);
      return { tenantId, locationId, requestedMode: pilot.requestedMode };
    })
    .sort((a, b) =>
      `${a.tenantId}:${a.locationId}`.localeCompare(
        `${b.tenantId}:${b.locationId}`,
      ),
    );
  return {
    requestedMode: input.requestedMode,
    timeoutMs: input.timeoutMs,
    freshnessMs: input.freshnessMs,
    pilots,
  };
}
function mapPolicy(row) {
  if (!row)
    invalid(
      "Inference policy storage is unavailable.",
      503,
      "AI_POLICY_UNAVAILABLE",
    );
  return {
    revision: String(row.revision),
    requestedMode: row.requested_mode,
    timeoutMs: row.timeout_ms,
    freshnessMs: row.freshness_ms,
    pilots: row.pilots,
    updatedAt: row.updated_at,
  };
}
// Derived facts are server-owned integration evidence, never editable policy.
function decide(policy, scope, facts) {
  const pilot = policy.pilots.find(
    (item) =>
      item.tenantId === scope.tenantId && item.locationId === scope.locationId,
  );
  const blockers = [];
  if (policy.requestedMode === "off") blockers.push("global_disabled");
  if (!pilot || pilot.requestedMode === "off") blockers.push("scope_disabled");
  if (!facts.callerIntegrated) blockers.push("caller_not_integrated");
  if (!facts.producerReady) blockers.push("producer_not_ready");
  if (!facts.shadowApproved) blockers.push("shadow_approval_missing");
  return {
    allowed: blockers.length === 0,
    effectiveMode: blockers.length ? "off" : "private_shadow",
    revision: policy.revision,
    scope: { ...scope },
    target: TARGET,
    predictorVersion: PREDICTOR_VERSION,
    timeoutMs: policy.timeoutMs,
    freshnessMs: policy.freshnessMs,
    blockers,
  };
}
function accepts(admission, current) {
  return (
    admission?.allowed === true &&
    current.allowed === true &&
    admission.revision === current.revision &&
    admission.target === current.target &&
    admission.predictorVersion === current.predictorVersion &&
    admission.scope?.tenantId === current.scope.tenantId &&
    admission.scope?.locationId === current.scope.locationId
  );
}
module.exports = {
  normalizePolicy,
  mapPolicy,
  decide,
  accepts,
  identifier,
  invalid,
};
