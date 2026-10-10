const test = require("node:test");
const assert = require("node:assert/strict");

const {
  handleListBookings,
  handleListAvailability,
  handleCreateAvailabilityBlock,
  handleCreateAvailabilityException,
  handleDeleteAvailabilityBlock,
  handleDeleteAvailabilityException,
  handleUpdateAvailabilityBlock,
  handleUpdateAvailabilityException
} = require("../src/routes/vendorBookingAvailabilityHandlers");

// Keep payload-contract tests at the injected creation boundary; transaction behavior has real PostgreSQL coverage.
async function createBlockWithPayloadValidation(dependencies) {
  return handleCreateAvailabilityBlock({ ...dependencies, availabilityCreationService: {
    createAvailabilityEntry: async (tenant, location, body, type) => {
      assert.equal(type, "block");
      const payload = await require("../src/services/availabilityPayloadService").normalizeAvailabilityBlockPayload(
        tenant, { ...body, locationSlug: location.slug }, null, dependencies.vendorServiceRepository,
        async () => location, dependencies.storeLocationRepository);
      return dependencies.vendorAvailabilityRepository.createBlock({ tenantId: tenant._id, ...payload });
    }
  } });
}

test("vendor booking handler lists bookings through injected repositories", async () => {
  const response = { body: null, json(payload) { this.body = payload; } };
  let capturedOptions = null;
  await handleListBookings({
    req: {
      user: {},
      params: { tenantSlug: "tenant" },
      query: { location: "main", status: "pending", scheduledDateFrom: "2026-07-01", scheduledDateTo: "2026-07-15" }
    },
    res: response,
    getAuthorizedTenant: async () => ({ _id: 1 }),
    assertTenantPermission: () => {},
    getLocationForTenant: async () => ({ _id: 2 }),
    bookingService: { expirePendingBookingsForTenant: async () => {} },
    bookingRepository: {
      listBookingsForTenant: async (_tenantId, options) => {
        capturedOptions = options;
        return {
        bookings: [{
          _id: 7,
          reference: "BKG-1",
          locationSlug: "main",
          groupFundedBookingId: "campaign-17",
          bookingPaymentSource: "group_funded",
          bundleItems: [{ serviceName: "Court 1", bookingQuantity: 2 }],
          executionMode: "parallel",
          groupFundedBundleItems: [{
            _id: "campaign-item-1",
            serviceId: "court-1",
            serviceNameSnapshot: "Court 1",
            serviceSlugSnapshot: "court-1",
            bookingQuantity: 2,
            priceAmountCents: 30000,
            currency: "PHP",
            executionMode: "parallel",
            scheduledStartAt: "2026-07-12T08:00:00.000Z",
            scheduledEndAt: "2026-07-12T10:00:00.000Z",
            sortOrder: 0
          }],
          groupFundedCampaign: { id: "campaign-17", campaignTitle: "Weekend court booking" }
        }],
        totalItems: 1
        };
      }
    },
    formatPaginationMetadata: () => ({ totalItems: 1 }),
    parsePaginationParams: () => ({ page: 1, pageSize: 10 })
  });

  assert.equal(response.body.bookings[0].reference, "BKG-1");
  assert.equal(response.body.bookings[0].groupFundedBookingId, "campaign-17");
  assert.equal(response.body.bookings[0].bookingPaymentSource, "group_funded");
  assert.equal(response.body.bookings[0].groupFundedCampaign.campaignTitle, "Weekend court booking");
  assert.equal(response.body.bookings[0].bundleItems[0].serviceName, "Court 1");
  assert.equal(response.body.bookings[0].executionMode, "parallel");
  assert.equal(response.body.bookings[0].groupFundedCampaign.bundleItems[0].serviceName, "Court 1");
  assert.equal(capturedOptions.scheduledDateFrom, "2026-07-01");
  assert.equal(capturedOptions.scheduledDateTo, "2026-07-15");
});

test("vendor availability handler creates blocks and updates exceptions", async () => {
  const createResponse = { statusCode: null, body: null, status(code) { this.statusCode = code; return this; }, json(payload) { this.body = payload; } };
  await createBlockWithPayloadValidation({
    req: { user: {}, params: { tenantSlug: "tenant" }, query: {}, body: { locationSlug: "main", weekday: 1, startsAt: "09:00", endsAt: "10:00", capacity: 2 } },
    res: createResponse,
    getAuthorizedTenant: async () => ({ _id: 1 }),
    assertTenantPermission: () => {},
    getLocationForTenant: async () => ({ _id: 2, slug: "main" }),
    vendorAvailabilityRepository: { createBlock: async (payload) => ({ _id: 5, tenantId: 1, locationId: payload.locationId, weekday: 1, startsAt: "09:00", endsAt: "10:00", capacity: 2, isActive: true }) },
    vendorServiceRepository: { findServiceByTenantAndSlug: async () => null, normalizeServiceSlug: (value) => value }
  });

  assert.equal(createResponse.statusCode, 201);
  assert.equal(createResponse.body.block.weekday, 1);

  const updateResponse = { body: null, json(payload) { this.body = payload; } };
  await handleUpdateAvailabilityException({
    req: { user: {}, params: { tenantSlug: "tenant", exceptionId: "exception-1" }, query: {}, body: { exceptionDate: "2026-07-01", isAvailable: false } },
    res: updateResponse,
    getAuthorizedTenant: async () => ({ _id: 1 }),
    assertTenantPermission: () => {},
    getLocationForTenant: async () => ({ _id: 2, slug: "main" }),
    vendorAvailabilityRepository: {
      findExceptionByTenantAndId: async () => ({ _id: "exception-1", tenantId: 1, locationId: 2, exceptionDate: "2026-07-01", isAvailable: false }),
      updateException: async (_id, payload) => ({ _id: "exception-1", tenantId: 1, locationId: 2, ...payload })
    },
    vendorServiceRepository: { findServiceByTenantAndSlug: async () => null, normalizeServiceSlug: (value) => value }
  });

  assert.equal(updateResponse.body.exception.id, "exception-1");
});

test("vendor availability handler accepts an overnight weekly rule only within the location's business hours", async () => {
  const response = { statusCode: null, body: null, status(code) { this.statusCode = code; return this; }, json(payload) { this.body = payload; } };
  let savedPayload = null;

  await createBlockWithPayloadValidation({
    req: {
      user: {},
      params: { tenantSlug: "tenant" },
      query: {},
      body: {
        locationSlug: "main",
        weekday: 1,
        startsAt: "07:00",
        endsAt: "02:00",
        endsNextDay: true,
        capacity: 2
      }
    },
    res: response,
    getAuthorizedTenant: async () => ({ _id: 1 }),
    assertTenantPermission: () => {},
    getLocationForTenant: async () => ({ _id: 2, slug: "main" }),
    storeLocationRepository: {
      listHoursByLocationId: async () => [
        { weekday: 1, opensAt: "06:00", closesAt: "03:00", isClosed: false }
      ]
    },
    vendorAvailabilityRepository: {
      createBlock: async (payload) => {
        savedPayload = payload;
        return { _id: 5, tenantId: 1, ...payload };
      }
    },
    vendorServiceRepository: { findServiceByTenantAndSlug: async () => null, normalizeServiceSlug: (value) => value }
  });

  assert.equal(response.statusCode, 201);
  assert.equal(savedPayload.endsNextDay, true);
});

test("vendor availability handler rejects weekly availability outside the location's business hours", async () => {
  await assert.rejects(
    () => createBlockWithPayloadValidation({
      req: {
        user: {},
        params: { tenantSlug: "tenant" },
        query: {},
        body: { locationSlug: "main", weekday: 1, startsAt: "06:00", endsAt: "17:00", capacity: 1 }
      },
      res: { status() { return this; }, json() {} },
      getAuthorizedTenant: async () => ({ _id: 1 }),
      assertTenantPermission: () => {},
      getLocationForTenant: async () => ({ _id: 2, slug: "main" }),
      storeLocationRepository: {
        listHoursByLocationId: async () => [
          { weekday: 1, opensAt: "09:00", closesAt: "17:00", isClosed: false }
        ]
      },
      vendorAvailabilityRepository: { createBlock: async () => { throw new Error("must not save"); } },
      vendorServiceRepository: { findServiceByTenantAndSlug: async () => null, normalizeServiceSlug: (value) => value }
    }),
    (error) => error.statusCode === 400 && /business hours/i.test(error.message)
  );
});

test("vendor availability handler treats explicit All services as a shared weekly rule", async () => {
  const createResponse = { statusCode: null, body: null, status(code) { this.statusCode = code; return this; }, json(payload) { this.body = payload; } };
  const createCalls = [];
  let serviceLookupCount = 0;

  await createBlockWithPayloadValidation({
    req: {
      user: {},
      params: { tenantSlug: "tenant" },
      query: {},
      body: {
        locationSlug: "main",
        serviceSlug: "",
        weekday: 1,
        startsAt: "09:00",
        endsAt: "17:00",
        capacity: 2
      }
    },
    res: createResponse,
    getAuthorizedTenant: async () => ({ _id: 1 }),
    assertTenantPermission: () => {},
    getLocationForTenant: async () => ({ _id: 2, slug: "main" }),
    vendorAvailabilityRepository: {
      createBlock: async (payload) => {
        createCalls.push(payload);
        return {
          _id: 5,
          tenantId: 1,
          locationId: payload.locationId,
          serviceId: payload.serviceId,
          weekday: payload.weekday,
          startsAt: payload.startsAt,
          endsAt: payload.endsAt,
          capacity: payload.capacity,
          isActive: true
        };
      }
    },
    vendorServiceRepository: {
      findServiceByTenantAndSlug: async () => {
        serviceLookupCount += 1;
        return { _id: 99 };
      },
      normalizeServiceSlug: (value) => value
    }
  });

  assert.equal(createResponse.statusCode, 201);
  assert.equal(createCalls.length, 1);
  assert.equal(serviceLookupCount, 0);
  assert.equal(createCalls[0].serviceId, null);
  assert.equal(createResponse.body.block.serviceId, null);
});

test("vendor availability handler can update a service-specific weekly rule back to All services", async () => {
  const updateResponse = { body: null, json(payload) { this.body = payload; } };
  let capturedPayload = null;

  await handleUpdateAvailabilityBlock({
    req: {
      user: {},
      params: { tenantSlug: "tenant", blockId: "block-1" },
      query: {},
      body: {
        serviceSlug: "",
        weekday: 1,
        startsAt: "09:00",
        endsAt: "17:00",
        capacity: 2
      }
    },
    res: updateResponse,
    getAuthorizedTenant: async () => ({ _id: 1 }),
    assertTenantPermission: () => {},
    getLocationForTenant: async () => ({ _id: 2, slug: "main" }),
    vendorAvailabilityRepository: {
      findBlockByTenantAndId: async () => ({
        _id: "block-1",
        tenantId: 1,
        locationId: 2,
        serviceId: "service-1",
        weekday: 1,
        startsAt: "09:00",
        endsAt: "17:00",
        capacity: 2,
        isActive: true,
        notes: ""
      }),
      updateBlock: async (_id, payload) => {
        capturedPayload = payload;
        return {
          _id: "block-1",
          tenantId: 1,
          locationId: payload.locationId,
          serviceId: payload.serviceId,
          weekday: payload.weekday,
          startsAt: payload.startsAt,
          endsAt: payload.endsAt,
          capacity: payload.capacity,
          isActive: payload.isActive,
          notes: payload.notes
        };
      }
    },
    vendorServiceRepository: {
      findServiceByTenantAndSlug: async () => {
        throw new Error("All services must not look up a service");
      },
      normalizeServiceSlug: (value) => value
    }
  });

  assert.equal(capturedPayload.serviceId, null);
  assert.equal(updateResponse.body.block.serviceId, null);
});

test("vendor availability deletion passes authenticated scope and preserves the weekly response", async () => {
  const response = { body: null, json(payload) { this.body = payload; } };
  await handleDeleteAvailabilityBlock({
    req: { user: { _id: "admin-1" }, params: { tenantSlug: "tenant", blockId: "block-1" }, body: { actorUserId: "spoofed" } },
    res: response,
    getAuthorizedTenant: async () => ({ _id: "tenant-1" }),
    assertTenantPermission: () => {},
    availabilityDeletionService: { deleteAvailabilityEntry: async (tenant, id, type, options) => {
      assert.equal(tenant._id, "tenant-1"); assert.equal(id, "block-1"); assert.equal(type, "block");
      assert.deepEqual(options, { actorUserId: "admin-1" });
      return { _id: id, tenantId: "tenant-1", locationId: "branch-1", serviceId: null, weekday: 1,
        startsAt: "09:00", endsAt: "17:00", capacity: 2, isActive: true, notes: "Morning" };
    } }
  });
  assert.equal(response.body.block.id, "block-1");
});

test("vendor availability handler returns a capacity summary", async () => {
  const response = { body: null, json(payload) { this.body = payload; } };
  await handleListAvailability({
    req: {
      user: {},
      params: { tenantSlug: "tenant" },
      query: { location: "main" }
    },
    res: response,
    getAuthorizedTenant: async () => ({ _id: 1 }),
    assertTenantPermission: () => {},
    getLocationForTenant: async () => ({ _id: 2 }),
    vendorAvailabilityRepository: {
      listAvailabilityByLocation: async () => ({
        blocks: [
          { _id: 1, tenantId: 1, locationId: 2, serviceId: null, weekday: 1, startsAt: "09:00", endsAt: "10:00", capacity: 2, isActive: true, notes: "", createdAt: "", updatedAt: "" },
          { _id: 2, tenantId: 1, locationId: 2, serviceId: "service-1", weekday: 1, startsAt: "10:00", endsAt: "11:00", capacity: 1, isActive: true, notes: "", createdAt: "", updatedAt: "" }
        ],
        exceptions: [
          { _id: 3, tenantId: 1, locationId: 2, serviceId: null, exceptionDate: "2026-07-01", startsAt: "12:00", endsAt: "13:00", isAvailable: false, capacity: null, reason: "", createdAt: "", updatedAt: "" }
        ]
      })
    }
  });

  assert.equal(response.body.summary.hasSharedLocationCapacity, true);
  assert.equal(response.body.summary.hasServiceSpecificCapacity, true);
  assert.equal(response.body.summary.sharedBlocks, 1);
  assert.equal(response.body.summary.serviceSpecificBlocks, 1);
});

test("availability exception deletion preserves the empty 204 response and authenticated actor", async () => {
  let statusCode; let sent=false;
  await handleDeleteAvailabilityException({
    req: { user: { _id: "admin-1" }, params: { tenantSlug: "tenant", exceptionId: "exception-1" } },
    res: { status(code) { statusCode=code; return this; }, send() { sent=true; } },
    getAuthorizedTenant: async () => ({ _id: "tenant-1" }), assertTenantPermission: () => {},
    availabilityDeletionService: { deleteAvailabilityEntry: async (tenant, id, type, options) => {
      assert.equal(tenant._id, "tenant-1"); assert.equal(id, "exception-1"); assert.equal(type, "exception");
      assert.deepEqual(options, { actorUserId: "admin-1" });
    } }
  });
  assert.equal(statusCode,204); assert.equal(sent,true);
});

test("availability creation handler forwards only the authenticated actor and server-selected scope", async () => {
  const tenant = { _id: "1" }; const location = { _id: "10", slug: "main" };
  const body = { locationSlug: "main", tenantId: "2", locationId: "20", actorUserId: "999" };
  const response = { status(code) { assert.equal(code, 201); return this; }, json(value) { this.body = value; } };
  await handleCreateAvailabilityBlock({ req: { user: { _id: "1" }, params: { tenantSlug: "demo" }, body, query: {} },
    res: response, getAuthorizedTenant: async () => tenant, assertTenantPermission: () => {}, getLocationForTenant: async () => location,
    availabilityCreationService: { createAvailabilityEntry: async (...args) => {
      assert.deepEqual(args, [tenant, location, body, "block", { actorUserId: "1" }]);
      return { _id: "5", tenantId: "1", locationId: "10", weekday: 1, startsAt: "09:00", endsAt: "17:00", capacity: 2 };
    } }
  });
  assert.equal(response.body.block.id, "5"); assert.equal(response.body.block.locationId, "10");
});

test("availability exception creation preserves 201 and forwards authenticated scope", async () => {
  const response = { status(code) { assert.equal(code, 201); return this; }, json(value) { this.body = value; } };
  await handleCreateAvailabilityException({ req: { user: { _id: "1" }, params: { tenantSlug: "demo" }, body: { actorUserId: "999" }, query: { location: "main" } },
    res: response, getAuthorizedTenant: async () => ({ _id: "1" }), assertTenantPermission: () => {},
    getLocationForTenant: async (_tenant, slug) => { assert.equal(slug, "main"); return { _id: "10" }; },
    availabilityCreationService: { createAvailabilityEntry: async (tenant, location, body, type, options) => {
      assert.equal(tenant._id, "1"); assert.equal(location._id, "10"); assert.equal(type, "exception");
      assert.deepEqual(options, { actorUserId: "1" }); assert.equal(body.actorUserId, "999");
      return { _id: "6", tenantId: "1", locationId: "10", exceptionDate: "2026-10-10", isAvailable: false, capacity: null };
    } }
  });
  assert.equal(response.body.exception.id, "6"); assert.equal(response.body.exception.capacity, null);
});

test("availability service slugs preserve normalization and handle long separator input", async () => {
  const { normalizeAvailabilityBlockPayload } = require("../src/services/availabilityPayloadService");
  const lookups = [];
  for (const [input, expected] of [[" ---Court___Play--- ", "court-play"], ["-".repeat(100000), null]]) {
    const payload = await normalizeAvailabilityBlockPayload({ _id: "1" }, {
      locationSlug: "main", serviceSlug: input, weekday: 1, startsAt: "09:00", endsAt: "17:00"
    }, null, { findServiceByTenantAndSlug: async (_tenant, slug) => { lookups.push(slug); return { _id: "1000" }; } }, async () => ({ _id: "10" }));
    assert.equal(payload.serviceId, expected ? "1000" : null);
  }
  assert.deepEqual(lookups, ["court-play"]);
});
