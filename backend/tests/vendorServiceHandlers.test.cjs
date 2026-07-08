const test = require("node:test");
const assert = require("node:assert/strict");

const { handleListServices, handleCreateService, handleDeleteService } = require("../src/routes/vendorServiceHandlers");

test("vendor service handler lists and creates services", async () => {
  const listResponse = { body: null, json(payload) { this.body = payload; } };
  await handleListServices({
    req: { user: {}, params: { tenantSlug: "tenant" } },
    res: listResponse,
    getAuthorizedTenant: async () => ({ _id: 1 }),
    assertTenantPermission: () => {},
    vendorServiceRepository: {
      listServicesByTenantId: async () => [{ _id: 7, name: "Consultation", slug: "consultation", durationMinutes: 30, allowBookingQuantity: false, isActive: true }]
    },
    locationServiceRepository: {
      listLocationServicesByTenantId: async () => []
    }
  });
  assert.equal(listResponse.body.services[0].slug, "consultation");

  const createResponse = { statusCode: null, body: null, status(code) { this.statusCode = code; return this; }, json(payload) { this.body = payload; } };
  await handleCreateService({
    req: { user: {}, params: { tenantSlug: "tenant" }, body: { name: "Consultation", durationMinutes: 45 } },
    res: createResponse,
    getAuthorizedTenant: async () => ({ _id: 1 }),
    assertTenantPermission: () => {},
    vendorServiceRepository: {
      createService: async (payload) => ({ _id: 8, slug: "consultation", ...payload })
    },
    locationServiceRepository: {
      upsertLocationService: async (payload) => payload
    }
  });
  assert.equal(createResponse.statusCode, 201);
  assert.equal(createResponse.body.service.name, "Consultation");
});

test("vendor service handler deletes services through injected repository", async () => {
  const response = { body: null, json(payload) { this.body = payload; } };
  await handleDeleteService({
    req: { user: {}, params: { tenantSlug: "tenant", serviceSlug: "consultation" } },
    res: response,
    getAuthorizedTenant: async () => ({ _id: 1 }),
    assertTenantPermission: () => {},
    vendorServiceRepository: {
      findServiceByTenantAndSlug: async () => ({ _id: 8, slug: "consultation" }),
      deactivateService: async () => ({ _id: 8, slug: "consultation", isActive: false })
    }
  });
  assert.equal(response.body.service.isActive, false);
});
