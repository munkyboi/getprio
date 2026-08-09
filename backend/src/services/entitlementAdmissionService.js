const releaseControls = require("../config/releaseControls");
const { assertFeature, resolveTenantPolicy } = require("./entitlementResolver");

const FEATURE_FLAGS = {
  queue: "entitlementQueueEnforcement",
  branding: "entitlementBrandingEnforcement",
  discovery: "entitlementDiscoveryEnforcement",
  booking: "entitlementBookingEnforcement",
  campaigns: "entitlementCampaignEnforcement"
};

function isEnforced(featureKey, controls = releaseControls) {
  return Boolean(controls[FEATURE_FLAGS[featureKey]]);
}

async function admit({ tenantId, featureKey, mode = "create", controls, client }) {
  if (["read", "history", "ongoing", "wind_down"].includes(mode)) {
    return { allowed: true, enforced: isEnforced(featureKey, controls) };
  }
  if (!isEnforced(featureKey, controls)) {
    return { allowed: true, enforced: false };
  }
  const policy = await resolveTenantPolicy(tenantId, { client });
  if (policy.lifecycle.state !== "active") assertFeature(policy, featureKey);
  if (policy.authority?.served !== "new") {
    return { allowed: true, enforced: false, bypassed: "legacy_authority", policy };
  }
  assertFeature(policy, featureKey);
  return { allowed: true, enforced: true, policy };
}

async function canDiscover(tenantId, controls) {
  try {
    await admit({ tenantId, featureKey: "discovery", mode: "discovery", controls });
    return true;
  } catch (error) {
    if (error.statusCode === 403) return false;
    throw error;
  }
}

function toPublicCapabilities(policy) {
  const isActive = policy.lifecycle.state === "active";

  return {
    queue: isActive && policy.features.queue.enabled,
    booking: isActive && policy.features.booking.enabled,
    campaigns: isActive && policy.features.booking.enabled && policy.features.campaigns.enabled,
    branding: isActive && policy.features.branding.enabled
  };
}

async function resolvePublicCapabilities(tenantId, options = {}) {
  const policy = await resolveTenantPolicy(tenantId, { client: options.client });
  return toPublicCapabilities(policy);
}

module.exports = { admit, canDiscover, isEnforced, resolvePublicCapabilities, toPublicCapabilities };
