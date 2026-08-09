const RELEASE_CONTROL_ENV_KEYS = Object.freeze({
  entitlementResolverShadow: "ENTITLEMENT_RESOLVER_SHADOW_ENABLED",
  entitlementResolverAuthority: "ENTITLEMENT_RESOLVER_AUTHORITY_ENABLED",
  entitlementQueueEnforcement: "ENTITLEMENT_QUEUE_ENFORCEMENT_ENABLED",
  entitlementBrandingEnforcement: "ENTITLEMENT_BRANDING_ENFORCEMENT_ENABLED",
  entitlementDiscoveryEnforcement: "ENTITLEMENT_DISCOVERY_ENFORCEMENT_ENABLED",
  entitlementBookingEnforcement: "ENTITLEMENT_BOOKING_ENFORCEMENT_ENABLED",
  entitlementCampaignEnforcement: "ENTITLEMENT_CAMPAIGN_ENFORCEMENT_ENABLED",
  allowanceObserve: "ALLOWANCE_LEDGER_OBSERVE_ENABLED",
  allowanceQueueTickets: "ALLOWANCE_QUEUE_TICKETS_ENABLED",
  allowanceQueueEmailJourneys: "ALLOWANCE_QUEUE_EMAIL_JOURNEYS_ENABLED",
  allowanceServiceBookings: "ALLOWANCE_SERVICE_BOOKINGS_ENABLED",
  freePlanBackfill: "FREE_PLAN_BACKFILL_ENABLED",
  usageCreditCatalog: "USAGE_CREDIT_CATALOG_ENABLED",
  usageCreditGrants: "USAGE_CREDIT_GRANTS_ENABLED",
  usageCreditCheckout: "USAGE_CREDIT_CHECKOUT_ENABLED",
  usageCreditRefunds: "USAGE_CREDIT_REFUNDS_ENABLED",
  usageCreditDisputes: "USAGE_CREDIT_DISPUTES_ENABLED",
  entitlementOverrides: "ENTITLEMENT_OVERRIDES_ENABLED",
  allowanceRepairs: "ALLOWANCE_REPAIRS_ENABLED",
  subscriptionLifecycle: "SUBSCRIPTION_LIFECYCLE_ENABLED",
  planPolicyMutations: "PLAN_POLICY_MUTATIONS_ENABLED",
  vendorCapacityExperience: "VENDOR_CAPACITY_EXPERIENCE_ENABLED"
});

function isExplicitlyEnabled(value) {
  return value === "1" || String(value || "").toLowerCase() === "true";
}

function buildReleaseControls(source = process.env) {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(RELEASE_CONTROL_ENV_KEYS).map(([key, environmentKey]) => [
        key,
        isExplicitlyEnabled(source[environmentKey])
      ])
    )
  );
}

const releaseControls = buildReleaseControls();

module.exports = {
  ...releaseControls,
  RELEASE_CONTROL_ENV_KEYS,
  buildReleaseControls,
  isExplicitlyEnabled
};
