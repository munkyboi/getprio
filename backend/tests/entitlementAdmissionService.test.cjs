const test = require("node:test");
const assert = require("node:assert/strict");

const { toPublicCapabilities } = require("../src/services/entitlementAdmissionService");

test("public capabilities expose only active effective plan features", () => {
  assert.deepEqual(
    toPublicCapabilities({
      lifecycle: { state: "active" },
      features: {
        queue: { enabled: true },
        booking: { enabled: false },
        campaigns: { enabled: true },
        branding: { enabled: false }
      }
    }),
    { queue: true, booking: false, campaigns: false, branding: false }
  );

  assert.deepEqual(
    toPublicCapabilities({
      lifecycle: { state: "restricted" },
      features: {
        queue: { enabled: true },
        booking: { enabled: true },
        campaigns: { enabled: true },
        branding: { enabled: true }
      }
    }),
    { queue: false, booking: false, campaigns: false, branding: false }
  );
});
