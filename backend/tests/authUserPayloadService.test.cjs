const test = require("node:test");
const assert = require("node:assert/strict");
const { buildBaseAuthUserPayload } = require("../src/services/authUserPayloadService");

test("shared auth payload maps common account and active-tenant details for web and mobile", async () => {
  const user = {
    _id: 42,
    name: "Customer One",
    tenantMemberships: [
      { tenantId: 7, role: "owner", isActive: true },
      { tenantId: 8, role: "member", isActive: false }
    ],
    oauthAccounts: [{ provider: "google" }, { provider: "google" }],
    emailVerified: true,
    passwordHash: "hash",
    mfaEnabled: true
  };
  const tenantRepository = {
    findTenantsByIds: async () => [{ _id: 7, name: "Clinic", slug: "clinic" }]
  };

  const payload = await buildBaseAuthUserPayload(user, tenantRepository);

  assert.equal(payload.id, "42");
  assert.equal(payload.emailVerified, true);
  assert.equal(payload.hasPassword, true);
  assert.equal(payload.mfaEnabled, true);
  assert.deepEqual(payload.oauthProviders, ["google"]);
  assert.deepEqual(payload.tenants, [{ id: "7", name: "Clinic", slug: "clinic", role: "owner", isActive: true }]);
});
