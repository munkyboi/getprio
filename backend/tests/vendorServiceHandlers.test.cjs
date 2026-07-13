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

test("vendor service handler persists group-funded branch settings", async () => {
  const storeLocationRepository = require("../src/repositories/storeLocations");
  const originalFindLocationByTenantAndSlug = storeLocationRepository.findLocationByTenantAndSlug;
  const upserts = [];
  try {
    storeLocationRepository.findLocationByTenantAndSlug = async (_tenantId, slug) => ({
      _id: slug === "main-location" ? 11 : 12,
      slug
    });

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

    await handleCreateService({
      req: {
        user: {},
        params: { tenantSlug: "tenant" },
        body: {
          name: "VIP Court",
          durationMinutes: 60,
          priceAmountCents: 50000,
          locationServices: [
            {
              locationSlug: "main-location",
              capacity: 1,
              isActive: true,
              groupFunded: {
                enabled: true,
                minRequiredContributors: 2,
                maxRequiredContributors: 8,
                defaultRequiredContributors: 4,
                minContributionAmountCents: 10000,
                maxContributionAmountCents: 30000,
                minDeadlineHours: 24,
                maxDeadlineDays: 7,
                allowPublicCampaigns: true
              }
            }
          ]
        }
      },
      res: response,
      getAuthorizedTenant: async () => ({ _id: 1 }),
      assertTenantPermission: () => {},
      vendorServiceRepository: {
        createService: async (payload) => ({ _id: 8, slug: "vip-court", ...payload })
      },
      locationServiceRepository: {
        upsertLocationService: async (payload) => {
          upserts.push(payload);
          return payload;
        }
      }
    });

    assert.equal(response.statusCode, 201);
    assert.equal(upserts.length, 1);
    assert.equal(upserts[0].serviceId, 8);
    assert.deepEqual(upserts[0].groupFunded, {
      enabled: true,
      minRequiredContributors: 2,
      maxRequiredContributors: 8,
      defaultRequiredContributors: 4,
      minContributionAmountCents: 10000,
      maxContributionAmountCents: 30000,
      minDeadlineHours: 24,
      maxDeadlineDays: 7,
      allowPublicCampaigns: true
    });
  } finally {
    storeLocationRepository.findLocationByTenantAndSlug = originalFindLocationByTenantAndSlug;
  }
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
