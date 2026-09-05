const test = require("node:test");
const assert = require("node:assert/strict");

const { canAccessVendorSection } = require("../src/lib/vendorDashboardNavigation.js");

test("Free plan navigation exposes queue operations but hides paid booking modules", () => {
  const free = {
    queueSystemAccess: true,
    serviceBookingAccess: false,
    staffSeats: 1,
    locations: 1,
    basicDashboard: true,
    historyDays: 7,
    analytics: false
  };

  assert.deepEqual(
    ["queue", "tenants", "services", "bookings", "staff", "clients", "history", "reports", "settings", "account"]
      .filter((section) => canAccessVendorSection(section, free)),
    ["queue", "tenants", "clients", "history", "settings", "account"]
  );
});

test("paid module visibility follows effective entitlements rather than plan names", () => {
  const custom = {
    queueSystemAccess: false,
    serviceBookingAccess: true,
    staffSeats: 3,
    locations: 2,
    basicDashboard: true,
    historyDays: 30,
    analytics: true
  };

  assert.equal(canAccessVendorSection("queue", custom), false);
  assert.equal(canAccessVendorSection("services", custom), true);
  assert.equal(canAccessVendorSection("bookings", custom), true);
  assert.equal(canAccessVendorSection("staff", custom), true);
  assert.equal(canAccessVendorSection("reports", custom), true);
  assert.equal(canAccessVendorSection("settings", null), true);
  assert.equal(canAccessVendorSection("account", null), true);
  assert.equal(canAccessVendorSection("services", null), false);
});

test("Ratings controls require an active paid plan, including direct navigation", () => {
  const entitlements = { analytics: true, serviceBookingAccess: true };
  for (const plan of [null, {}, { planSlug: 'free', subscriptionStatus: 'active' }, { planSlug: 'economical', subscriptionStatus: 'cancelled' }, { planSlug: 'economical', subscriptionStatus: 'past_due' }]) {
    assert.equal(canAccessVendorSection('ratings', entitlements, plan), false);
  }
  assert.equal(canAccessVendorSection('ratings', {}, { planSlug: 'economical', subscriptionStatus: 'active' }), true);
});
