const test = require("node:test");
const assert = require("node:assert/strict");

const { handleCreateLocation, handleUpdateLocation } = require("../src/routes/vendorLocationHandlers");

test("vendor location handler rejects active location limit", async () => {
  await assert.rejects(
    () =>
      handleCreateLocation({
        req: { user: {}, params: { tenantSlug: "tenant" }, query: {}, body: { isActive: true } },
        res: {},
        getAuthorizedTenant: async () => ({ _id: 1 }),
        assertTenantPermission: () => {},
        billingService: { getBillingOverview: async () => ({ subscription: { entitlements: { locations: 1 } } }) },
        storeLocationRepository: {
          listLocationsByTenantId: async () => [{ isActive: true }],
          createLocation: async () => ({}),
          createDefaultHours: async () => {}
        },
        normalizeLocationPayload: (body) => body,
        formatLocation: async () => ({})
      }),
    (error) => error.statusCode === 403
  );
});

test("vendor location handlers create and update locations through injected services", async () => {
  const createdLocations = [];
  const updatedLocations = [];
  const response = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
    }
  };

  const storeLocationRepository = {
    listLocationsByTenantId: async () => [],
    createLocation: async (location) => {
      createdLocations.push(location);
      return { _id: 2 };
    },
    createDefaultHours: async () => {},
    updateLocation: async (_locationId, changes) => {
      updatedLocations.push(changes);
      return { _id: 2, isActive: true };
    }
  };

  await handleCreateLocation({
    req: { user: {}, params: { tenantSlug: "tenant" }, query: {}, body: { name: "Branch" } },
    res: response,
    getAuthorizedTenant: async () => ({ _id: 1 }),
    assertTenantPermission: () => {},
    billingService: { getBillingOverview: async () => ({ subscription: { entitlements: { locations: 2 } } }) },
    storeLocationRepository,
    platformRepository: { getPlatformSettings: async () => ({ defaultTimezone: "Pacific/Auckland" }) },
    normalizeLocationPayload: (body) => body,
    formatLocation: async () => ({ id: "2" })
  });

  assert.equal(response.statusCode, 201);
  assert.deepEqual(response.body.location, { id: "2" });
  assert.equal(createdLocations[0].timezone, "Pacific/Auckland");

  const updateResponse = {
    statusCode: null,
    body: null,
    json(payload) {
      this.body = payload;
    }
  };

  await handleUpdateLocation({
    req: { user: {}, params: { tenantSlug: "tenant", locationSlug: "main" }, query: {}, body: { isActive: true } },
    res: updateResponse,
    getAuthorizedTenant: async () => ({ _id: 1 }),
    assertTenantPermission: () => {},
    billingService: { getBillingOverview: async () => ({ subscription: { entitlements: { locations: 2 } } }) },
    storeLocationRepository,
    normalizeLocationPayload: (body) => body,
    formatLocation: async () => ({ id: "2" }),
    getLocationForTenant: async () => ({ _id: 2, slug: "main", isActive: false })
  });

  assert.deepEqual(updateResponse.body.location, { id: "2" });
  assert.equal(Object.prototype.hasOwnProperty.call(updatedLocations[0], "slug"), false);
});

test("vendor location handler rejects changing an established slug", async () => {
  await assert.rejects(
    () =>
      handleUpdateLocation({
        req: {
          user: {},
          params: { tenantSlug: "tenant", locationSlug: "main" },
          query: {},
          body: { name: "Main Branch", slug: "renamed" }
        },
        res: {},
        getAuthorizedTenant: async () => ({ _id: 1 }),
        assertTenantPermission: () => {},
        billingService: { getBillingOverview: async () => ({ subscription: { entitlements: { locations: 2 } } }) },
        storeLocationRepository: { updateLocation: async () => ({}) },
        normalizeLocationPayload: (body) => body,
        formatLocation: async () => ({}),
        getLocationForTenant: async () => ({ _id: 2, slug: "main", isActive: true })
      }),
    (error) => error.statusCode === 400 && error.message === "Location slug cannot be changed after creation."
  );
});
