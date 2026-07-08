const test = require("node:test");
const assert = require("node:assert/strict");

const {
  handleListBookings,
  handleListAvailability,
  handleCreateAvailabilityBlock,
  handleUpdateAvailabilityException
} = require("../src/routes/vendorBookingAvailabilityHandlers");

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
        bookings: [{ _id: 7, reference: "BKG-1", locationSlug: "main" }],
        totalItems: 1
        };
      }
    },
    formatPaginationMetadata: () => ({ totalItems: 1 }),
    parsePaginationParams: () => ({ page: 1, pageSize: 10 })
  });

  assert.equal(response.body.bookings[0].reference, "BKG-1");
  assert.equal(capturedOptions.scheduledDateFrom, "2026-07-01");
  assert.equal(capturedOptions.scheduledDateTo, "2026-07-15");
});

test("vendor availability handler creates blocks and updates exceptions", async () => {
  const createResponse = { statusCode: null, body: null, status(code) { this.statusCode = code; return this; }, json(payload) { this.body = payload; } };
  await handleCreateAvailabilityBlock({
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
