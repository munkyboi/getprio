const crypto = require("crypto");
const repository = require("../repositories/entitlementResolver");
const releaseControls = require("../config/releaseControls");

const FEATURE_KEYS = ["queue", "branding", "discovery", "booking", "campaigns"];
const ALLOWANCE_KEYS = ["queueTickets", "queueEmailJourneys", "serviceBookings"];
const RESTRICTED_STATUSES = new Set(["past_due", "unpaid", "suspended"]);

function emptyFeatures() {
  return Object.fromEntries(
    FEATURE_KEYS.map((key) => [key, { enabled: false, source: "restriction", overrideId: null }])
  );
}

function emptyAllowances() {
  return Object.fromEntries(
    ALLOWANCE_KEYS.map((key) => [key, { limit: 0, source: "restriction", overrideId: null }])
  );
}

function activeOverrides(overrides, now) {
  return (overrides || []).filter(
    (override) => !override.expiresAt || new Date(override.expiresAt).getTime() > now.getTime()
  );
}

function stableHash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function applyCampaignDependency(features) {
  if (features.campaigns.enabled && !features.booking.enabled) {
    features.campaigns = { ...features.campaigns, enabled: false, suppressedBy: "booking" };
  }
  return features;
}

function buildLegacyValues(input) {
  const snapshot = {
    ...(input.plan?.legacyEntitlements || {}),
    ...(input.subscription?.legacyEntitlements || {})
  };
  const featureMap = {
    queue: "queueSystemAccess",
    branding: "publicFacingBranding",
    discovery: "marketplaceDiscovery",
    booking: "serviceBookingAccess",
    campaigns: "groupFundedCampaignAccess"
  };
  const allowanceMap = {
    queueTickets: "monthlyTickets",
    queueEmailJourneys: "monthlyQueueEmailJourneys",
    serviceBookings: "monthlyServiceBookings"
  };
  const features = Object.fromEntries(FEATURE_KEYS.map((key) => [key, {
    enabled: Boolean(snapshot[featureMap[key]]),
    source: "legacy_snapshot",
    overrideId: null
  }]));
  const allowances = Object.fromEntries(ALLOWANCE_KEYS.map((key) => [key, {
    limit: Number.isFinite(Number(snapshot[allowanceMap[key]])) ? Math.max(0, Number(snapshot[allowanceMap[key]])) : 0,
    source: "legacy_snapshot",
    overrideId: null
  }]));
  return { features: applyCampaignDependency(features), allowances };
}

function buildNewValues(input, now) {
  const overrides = activeOverrides(input.overrides, now);
  const features = Object.fromEntries(FEATURE_KEYS.map((key) => [key, {
    enabled: Boolean(input.features?.[key]),
    source: "plan",
    overrideId: null
  }]));
  const allowances = Object.fromEntries(ALLOWANCE_KEYS.map((key) => [key, {
    limit: Number(input.allowances?.[key] || 0),
    source: "plan",
    overrideId: null
  }]));

  for (const override of overrides) {
    const [kind, key] = String(override.policyKey || "").split(".", 2);
    if (kind === "feature" && features[key]) {
      features[key] = { enabled: Boolean(override.value), source: "override", overrideId: override.id };
    }
    if (kind === "allowance" && allowances[key] && Number.isFinite(Number(override.value))) {
      allowances[key] = { limit: Math.max(0, Number(override.value)), source: "override", overrideId: override.id };
    }
  }
  return { features: applyCampaignDependency(features), allowances };
}

function comparableValues(values) {
  return {
    features: Object.fromEntries(FEATURE_KEYS.map((key) => [key, Boolean(values.features[key]?.enabled)])),
    allowances: Object.fromEntries(ALLOWANCE_KEYS.map((key) => [key, Number(values.allowances[key]?.limit || 0)]))
  };
}

async function emitShadowComparison({ tenantId, subscription, legacyValues, newValues }, options) {
  const legacy = comparableValues(legacyValues);
  const next = comparableValues(newValues);
  const comparison = {
    tenantId: String(tenantId),
    subscriptionId: subscription.id,
    modelVersion: Number(subscription.entitlementModelVersion || 1),
    legacyHash: stableHash(legacy),
    newHash: stableHash(next),
    matches: JSON.stringify(legacy) === JSON.stringify(next)
  };
  if (options.onShadowComparison) await options.onShadowComparison(comparison);
  else if (!comparison.matches) console.warn("[entitlement-resolver-shadow-mismatch]", comparison);
}

function lifecycleFor(subscription) {
  if (!subscription) return { state: "none", planSlug: null, subscriptionId: null };
  if (subscription.status === "active") {
    return { state: "active", planSlug: subscription.planSlug, subscriptionId: subscription.id };
  }
  if (RESTRICTED_STATUSES.has(subscription.status)) {
    return { state: "restricted", planSlug: subscription.planSlug, subscriptionId: subscription.id };
  }
  return { state: "inactive", planSlug: subscription.planSlug, subscriptionId: subscription.id };
}

function restrictionFor(lifecycle, status) {
  if (lifecycle.state === "active") return null;
  if (lifecycle.state === "none") {
    return { code: "SUBSCRIPTION_REQUIRED", message: "This vendor does not have an active subscription." };
  }
  return {
    code: `SUBSCRIPTION_${String(status || "inactive").toUpperCase()}`,
    message: "This subscription is currently restricted. Existing work remains available."
  };
}

function addAnchoredMonth(start, monthOffset) {
  const anchor = new Date(start);
  const result = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + monthOffset, 1,
    anchor.getUTCHours(), anchor.getUTCMinutes(), anchor.getUTCSeconds(), anchor.getUTCMilliseconds()));
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(anchor.getUTCDate(), lastDay));
  return result;
}

function monthlyAllowancePeriod(subscription, now) {
  const serviceStart = new Date(subscription.currentPeriodStart);
  const serviceEnd = new Date(subscription.currentPeriodEnd);
  if (!Number.isFinite(serviceStart.getTime()) || !Number.isFinite(serviceEnd.getTime())) return { start: null, end: null };
  let offset = 0;
  while (offset < 120 && addAnchoredMonth(serviceStart, offset + 1) <= now && addAnchoredMonth(serviceStart, offset + 1) < serviceEnd) offset += 1;
  const start = addAnchoredMonth(serviceStart, offset);
  const calculatedEnd = addAnchoredMonth(serviceStart, offset + 1);
  const end = calculatedEnd < serviceEnd ? calculatedEnd : serviceEnd;
  return { start, end };
}

async function resolveTenantPolicy(tenantId, options = {}) {
  const input = await repository.loadResolverInput(tenantId, options);
  const controls = options.controls || releaseControls;
  if (input.ambiguous) {
    return { tenantId: String(tenantId), lifecycle: { state: "restricted", planSlug: null, subscriptionId: null }, planRevision: null, restriction: { code: "SUBSCRIPTION_AMBIGUOUS", message: "This subscription requires reconciliation before new work can be admitted." }, features: emptyFeatures(), allowances: emptyAllowances(), period: null };
  }
  const lifecycle = lifecycleFor(input.subscription);
  const restriction = restrictionFor(lifecycle, input.subscription?.status);
  if (lifecycle.state !== "active") {
    return {
      tenantId: String(tenantId),
      lifecycle,
      planRevision: input.plan?.revision || null,
      restriction,
      features: emptyFeatures(),
      allowances: emptyAllowances(),
      period: null
    };
  }

  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const legacyValues = buildLegacyValues(input);
  const newValues = buildNewValues(input, now);
  if (controls.entitlementResolverShadow) {
    await emitShadowComparison({ tenantId, subscription: input.subscription, legacyValues, newValues }, options);
  }
  const modelVersion = Number(input.subscription.entitlementModelVersion || 1);
  const eligibleForNewAuthority = modelVersion >= 2 && !input.subscription.hasBlockingAnomaly;
  const servedAuthority = controls.entitlementResolverAuthority && eligibleForNewAuthority ? "new" : "legacy";
  const servedValues = servedAuthority === "new" ? newValues : legacyValues;

  const period = monthlyAllowancePeriod(input.subscription, now);
  return {
    tenantId: String(tenantId),
    lifecycle,
    planRevision: input.plan?.revision || null,
    authority: {
      served: servedAuthority,
      modelVersion,
      eligibleForNewAuthority,
      blockedByAnomaly: Boolean(input.subscription.hasBlockingAnomaly)
    },
    restriction,
    features: servedValues.features,
    allowances: servedValues.allowances,
    period
  };
}

function assertFeature(policy, featureKey) {
  if (policy.lifecycle.state === "active" && policy.features?.[featureKey]?.enabled) return true;
  const error = new Error(policy.restriction?.message || "This feature is not included in the vendor's current plan.");
  error.statusCode = 403;
  error.code = policy.restriction?.code || `FEATURE_${String(featureKey).toUpperCase()}_NOT_INCLUDED`;
  throw error;
}

module.exports = {
  ALLOWANCE_KEYS,
  FEATURE_KEYS,
  assertFeature,
  buildLegacyValues,
  buildNewValues,
  comparableValues,
  monthlyAllowancePeriod,
  resolveTenantPolicy
};
