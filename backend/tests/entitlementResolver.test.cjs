const test = require("node:test");
const assert = require("node:assert/strict");

function loadResolver(input) {
  const target = require.resolve("../src/services/entitlementResolver.js");
  const dependency = require.resolve("../src/repositories/entitlementResolver.js");
  const previous = require.cache[dependency];
  require.cache[dependency] = {
    id: dependency,
    filename: dependency,
    loaded: true,
    exports: { loadResolverInput: async () => input }
  };
  delete require.cache[target];
  try {
    return require(target);
  } finally {
    delete require.cache[target];
    if (previous) require.cache[dependency] = previous;
    else delete require.cache[dependency];
  }
}

test("resolver never invents a fallback when subscription history is absent", async () => {
  const resolver = loadResolver({ subscription: null });
  const result = await resolver.resolveTenantPolicy("tenant-1");

  assert.equal(result.lifecycle.state, "none");
  assert.equal(result.restriction.code, "SUBSCRIPTION_REQUIRED");
  assert.equal(Object.values(result.features).every((feature) => feature.enabled === false), true);
});

test("resolver returns live Free defaults with explicit provenance", async () => {
  const resolver = loadResolver({
    subscription: { id: "subscription-1", planSlug: "free", status: "active", entitlementModelVersion: 2 },
    plan: { slug: "free", revision: 3 },
    features: { queue: true, branding: false, discovery: false, booking: false, campaigns: false },
    allowances: { queueTickets: 500, queueEmailJourneys: 500, serviceBookings: 0 },
    overrides: []
  });
  const result = await resolver.resolveTenantPolicy("tenant-1", { controls: { entitlementResolverAuthority: true } });

  assert.equal(result.lifecycle.state, "active");
  assert.deepEqual(result.features.queue, { enabled: true, source: "plan", overrideId: null });
  assert.equal(result.features.booking.enabled, false);
  assert.deepEqual(result.allowances.queueTickets, { limit: 500, source: "plan", overrideId: null });
});

test("resolver applies sparse current overrides and suppresses Campaigns without Booking", async () => {
  const resolver = loadResolver({
    subscription: { id: "subscription-2", planSlug: "economical", status: "active", entitlementModelVersion: 2 },
    plan: { slug: "economical", revision: 8 },
    features: { queue: true, branding: false, discovery: true, booking: true, campaigns: true },
    allowances: { queueTickets: 1000, queueEmailJourneys: 1000, serviceBookings: 100 },
    overrides: [
      { id: "override-booking", policyKey: "feature.booking", value: false, expiresAt: null },
      { id: "override-tickets", policyKey: "allowance.queueTickets", value: 1250, expiresAt: null },
      { id: "expired-branding", policyKey: "feature.branding", value: true, expiresAt: "2026-01-01T00:00:00.000Z" }
    ]
  });
  const result = await resolver.resolveTenantPolicy("tenant-1", { now: new Date("2026-08-04T00:00:00.000Z"), controls: { entitlementResolverAuthority: true } });

  assert.deepEqual(result.features.booking, { enabled: false, source: "override", overrideId: "override-booking" });
  assert.equal(result.features.campaigns.enabled, false);
  assert.equal(result.features.campaigns.suppressedBy, "booking");
  assert.equal(result.features.branding.enabled, false);
  assert.deepEqual(result.allowances.queueTickets, { limit: 1250, source: "override", overrideId: "override-tickets" });
});

test("resolver restricts delinquent subscriptions without silently converting them to Free", async () => {
  const resolver = loadResolver({
    subscription: { id: "subscription-3", planSlug: "pro", status: "past_due" },
    plan: { slug: "pro", revision: 4 },
    features: { queue: true, branding: true, discovery: true, booking: true, campaigns: true },
    allowances: { queueTickets: 5000, queueEmailJourneys: 5000, serviceBookings: 1000 },
    overrides: []
  });
  const result = await resolver.resolveTenantPolicy("tenant-1");

  assert.equal(result.lifecycle.state, "restricted");
  assert.equal(result.lifecycle.planSlug, "pro");
  assert.equal(result.restriction.code, "SUBSCRIPTION_PAST_DUE");
  assert.equal(result.features.queue.enabled, false);
});

test("annual service terms still expose anchored monthly allowance windows", async () => {
  const resolver = loadResolver({
    subscription: { id: "subscription-annual", planSlug: "pro", status: "active", currentPeriodStart: "2026-01-31T10:00:00.000Z", currentPeriodEnd: "2027-01-31T10:00:00.000Z" },
    plan: { slug: "pro", revision: 1 },
    features: { queue: true, branding: true, discovery: true, booking: true, campaigns: true },
    allowances: { queueTickets: 5000, queueEmailJourneys: 5000, serviceBookings: 1000 },
    overrides: []
  });
  const result = await resolver.resolveTenantPolicy("tenant-annual", { now: new Date("2026-03-15T00:00:00.000Z") });
  assert.deepEqual(result.period, { start: new Date("2026-02-28T10:00:00.000Z"), end: new Date("2026-03-31T10:00:00.000Z") });
});

test("unconverted subscriptions remain wholly legacy when global authority is enabled", async () => {
  const resolver = loadResolver({
    subscription: {
      id: "subscription-legacy",
      planSlug: "economical",
      status: "active",
      entitlementModelVersion: 1,
      legacyEntitlements: { queueSystemAccess: false, monthlyTickets: 321 }
    },
    plan: { slug: "economical", revision: 8, legacyEntitlements: { queueSystemAccess: true, monthlyTickets: 500 } },
    features: { queue: true, branding: false, discovery: true, booking: true, campaigns: true },
    allowances: { queueTickets: 1000, queueEmailJourneys: 1000, serviceBookings: 100 },
    overrides: []
  });

  const result = await resolver.resolveTenantPolicy("tenant-legacy", { controls: { entitlementResolverAuthority: true } });

  assert.deepEqual(result.authority, {
    served: "legacy",
    modelVersion: 1,
    eligibleForNewAuthority: false,
    blockedByAnomaly: false
  });
  assert.deepEqual(result.features.queue, { enabled: false, source: "legacy_snapshot", overrideId: null });
  assert.deepEqual(result.allowances.queueTickets, { limit: 321, source: "legacy_snapshot", overrideId: null });
});

test("blocking rollout anomalies quarantine converted subscriptions on legacy authority", async () => {
  const resolver = loadResolver({
    subscription: {
      id: "subscription-quarantined",
      planSlug: "pro",
      status: "active",
      entitlementModelVersion: 2,
      hasBlockingAnomaly: true,
      legacyEntitlements: { queueSystemAccess: true, monthlyTickets: 5000 }
    },
    plan: { slug: "pro", revision: 4 },
    features: { queue: true, branding: true, discovery: true, booking: true, campaigns: true },
    allowances: { queueTickets: 7000, queueEmailJourneys: 5000, serviceBookings: 1000 },
    overrides: [],
  });

  const result = await resolver.resolveTenantPolicy("tenant-quarantined", { controls: { entitlementResolverAuthority: true } });

  assert.equal(result.authority.served, "legacy");
  assert.equal(result.authority.blockedByAnomaly, true);
  assert.equal(result.allowances.queueTickets.limit, 5000);
});

test("shadow mode compares both models while continuing to serve legacy", async () => {
  let comparison;
  const resolver = loadResolver({
    subscription: {
      id: "subscription-shadow",
      planSlug: "economical",
      status: "active",
      entitlementModelVersion: 1,
      legacyEntitlements: { queueSystemAccess: true, monthlyTickets: 500 }
    },
    plan: { slug: "economical", revision: 2 },
    features: { queue: true, branding: false, discovery: true, booking: true, campaigns: true },
    allowances: { queueTickets: 1000, queueEmailJourneys: 1000, serviceBookings: 100 },
    overrides: []
  });

  const result = await resolver.resolveTenantPolicy("tenant-shadow", {
    controls: { entitlementResolverShadow: true, entitlementResolverAuthority: false },
    onShadowComparison: (value) => { comparison = value; }
  });

  assert.equal(result.authority.served, "legacy");
  assert.equal(result.allowances.queueTickets.limit, 500);
  assert.equal(comparison.matches, false);
  assert.match(comparison.legacyHash, /^[a-f0-9]{64}$/);
  assert.match(comparison.newHash, /^[a-f0-9]{64}$/);
});
