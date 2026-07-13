const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const express = require("express");
const permissions = require("../src/services/permissions");

function buildAsyncHandlerMock() {
  return (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function buildAuthMock() {
  function buildUser(req) {
    const tenantRole = req.headers["x-test-tenant-role"];
    const isPlatformAdmin = req.headers["x-test-platform-admin"] === "true";

    return {
      _id: "user-1",
      roles: isPlatformAdmin ? ["platform_admin"] : ["vendor"],
      tenantMemberships: tenantRole
        ? [{ tenantId: "tenant-1", role: String(tenantRole) }]
        : []
    };
  }

  return {
    authenticate(req, _res, next) {
      req.user = buildUser(req);
      next();
    },
    maybeAuthenticate(req, _res, next) {
      req.user = buildUser(req);
      next();
    },
    userHasTenantAccess(user, tenantId) {
      return Boolean(
        (user.tenantMemberships || []).some(
          (membership) => String(membership.tenantId) === String(tenantId)
        )
      );
    },
    assertTenantPermission(user, tenantId, permission) {
      permissions.assertPermission(user, permission, { tenantId });
    },
    requirePlatformPermission(permission) {
      return (req, _res, next) => {
        try {
          permissions.assertPermission(req.user, permission);
          next();
        } catch (error) {
          next(error);
        }
      };
    }
  };
}

function buildErrorHandlerMock() {
  return (error, _req, res, _next) => {
    res.status(error.statusCode || 500).json({
      message: error.message || "Unexpected server error."
    });
  };
}

function resolveMockPath(requestPath, baseDir) {
  if (!requestPath.startsWith(".")) {
    return require.resolve(requestPath, { paths: [baseDir] });
  }

  const absoluteBase = path.resolve(baseDir, requestPath);
  const candidates = [
    absoluteBase,
    `${absoluteBase}.js`,
    `${absoluteBase}.ts`,
    path.join(absoluteBase, "index.js"),
    path.join(absoluteBase, "index.ts")
  ];

  for (const candidate of candidates) {
    try {
      return require.resolve(candidate);
    } catch {
      // Try the next candidate.
    }
  }

  throw new Error(`Unable to resolve mock path: ${requestPath}`);
}

function requireWithMocks(targetPath, mocks) {
  const resolvedTarget = require.resolve(targetPath);
  const originals = new Map();

  try {
    for (const [requestPath, mockExports] of Object.entries(mocks)) {
      const resolvedDependency = resolveMockPath(requestPath, path.dirname(resolvedTarget));
      originals.set(resolvedDependency, require.cache[resolvedDependency]);
      require.cache[resolvedDependency] = {
        id: resolvedDependency,
        filename: resolvedDependency,
        loaded: true,
        exports: mockExports
      };
    }

    delete require.cache[resolvedTarget];
    return require(resolvedTarget);
  } finally {
    delete require.cache[resolvedTarget];
    for (const [resolvedDependency, originalEntry] of originals.entries()) {
      if (originalEntry) {
        require.cache[resolvedDependency] = originalEntry;
      } else {
        delete require.cache[resolvedDependency];
      }
    }
  }
}

async function startServer(router, basePath) {
  const app = express();
  app.use(express.json());
  app.use(basePath, router);
  app.use(buildErrorHandlerMock());

  const server = await new Promise((resolve) => {
    const nextServer = app.listen(0, () => resolve(nextServer));
  });

  return {
    server,
    baseUrl: `http://127.0.0.1:${server.address().port}${basePath}`
  };
}

async function stopServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

test("permissions map keeps current owner, staff, and platform-admin boundaries", () => {
  const staffUser = {
    roles: ["vendor"],
    tenantMemberships: [{ tenantId: "tenant-1", role: "staff" }]
  };
  const adminUser = {
    roles: ["vendor"],
    tenantMemberships: [{ tenantId: "tenant-1", role: "admin" }]
  };
  const ownerUser = {
    roles: ["vendor"],
    tenantMemberships: [{ tenantId: "tenant-1", role: "owner" }]
  };
  const platformAdmin = {
    roles: ["platform_admin"],
    tenantMemberships: []
  };

  assert.equal(permissions.userHasPermission(staffUser, "tenant.queue.operate", { tenantId: "tenant-1" }), true);
  assert.equal(permissions.userHasPermission(staffUser, "tenant.staff.read", { tenantId: "tenant-1" }), true);
  assert.equal(permissions.userHasPermission(staffUser, "tenant.billing.read", { tenantId: "tenant-1" }), true);
  assert.equal(permissions.userHasPermission(staffUser, "tenant.reports.read", { tenantId: "tenant-1" }), true);
  assert.equal(permissions.userHasPermission(staffUser, "tenant.settings.manage", { tenantId: "tenant-1" }), false);
  assert.equal(permissions.userHasPermission(staffUser, "tenant.service.manage", { tenantId: "tenant-1" }), false);
  assert.equal(permissions.userHasPermission(staffUser, "tenant.availability.manage", { tenantId: "tenant-1" }), false);
  assert.equal(permissions.userHasPermission(staffUser, "tenant.booking.manage", { tenantId: "tenant-1" }), false);
  assert.equal(permissions.userHasPermission(staffUser, "tenant.booking.manage", { tenantId: "tenant-2" }), false);
  assert.equal(permissions.userHasPermission(adminUser, "tenant.settings.manage", { tenantId: "tenant-1" }), true);
  assert.equal(permissions.userHasPermission(adminUser, "tenant.settings.manage_contact", { tenantId: "tenant-1" }), false);
  assert.equal(permissions.userHasPermission(adminUser, "tenant.staff.manage", { tenantId: "tenant-1" }), true);
  assert.equal(permissions.userHasPermission(adminUser, "tenant.location.manage", { tenantId: "tenant-1" }), true);
  assert.equal(permissions.userHasPermission(adminUser, "tenant.service.manage", { tenantId: "tenant-1" }), true);
  assert.equal(permissions.userHasPermission(adminUser, "tenant.availability.manage", { tenantId: "tenant-1" }), true);
  assert.equal(permissions.userHasPermission(adminUser, "tenant.booking.manage", { tenantId: "tenant-1" }), true);
  assert.equal(permissions.userHasPermission(adminUser, "tenant.booking.manage", { tenantId: "tenant-2" }), false);
  assert.equal(permissions.userHasPermission(ownerUser, "tenant.settings.manage", { tenantId: "tenant-1" }), true);
  assert.equal(permissions.userHasPermission(ownerUser, "tenant.settings.manage_contact", { tenantId: "tenant-1" }), true);
  assert.equal(permissions.userHasPermission(ownerUser, "tenant.billing.manage", { tenantId: "tenant-1" }), true);
  assert.equal(permissions.userHasPermission(ownerUser, "tenant.service.manage", { tenantId: "tenant-1" }), true);
  assert.equal(permissions.userHasPermission(ownerUser, "tenant.availability.manage", { tenantId: "tenant-1" }), true);
  assert.equal(permissions.userHasPermission(ownerUser, "tenant.booking.manage", { tenantId: "tenant-1" }), true);
  assert.equal(permissions.userHasPermission(ownerUser, "tenant.booking.manage", { tenantId: "tenant-2" }), false);
  assert.equal(permissions.userHasPermission(platformAdmin, "platform.users.read"), true);
  assert.equal(permissions.userHasPermission(platformAdmin, "platform.plans.manage"), true);
  assert.equal(permissions.userHasPermission(platformAdmin, "tenant.booking.manage", { tenantId: "tenant-1" }), false);
});

test("vendor location payment QR settings are private vendor-managed configuration", async () => {
  const locations = [
    {
      _id: "location-1",
      tenantId: "tenant-1",
      name: "Main Branch",
      slug: "main",
      addressLine1: "123 Main",
      addressLine2: "",
      city: "Cebu City",
      province: "Cebu",
      postalCode: "",
      country: "Philippines",
      contactEmail: "main@getprio.test",
      contactPhone: "09170000000",
      timezone: "Asia/Manila",
      paymentMethodLabel: "",
      paymentAccountDisplayName: "",
      paymentAccountIdentifierDisplay: "",
      paymentQrImageUrl: "",
      paymentQrActive: false,
      isPrimary: true,
      isActive: true
    }
  ];
  let updatedLocation = null;

  const vendorRouter = requireWithMocks("../src/routes/vendorRoutes.js", {
    "../middleware/auth": buildAuthMock(),
    "../middleware/asyncHandler": buildAsyncHandlerMock(),
    "../repositories/tenants": {
      findTenantBySlug: async () => ({ _id: "tenant-1", slug: "demo", name: "Demo Tenant" })
    },
    "../repositories/storeLocations": {
      listLocationsByTenantId: async () => locations,
      findPrimaryLocationByTenantId: async () => locations[0],
      findLocationByTenantAndSlug: async (_tenantId, slug) =>
        locations.find((location) => location.slug === slug) || null,
      createLocation: async (data) => ({ _id: "location-2", ...data, createdAt: new Date(), updatedAt: new Date() }),
      updateLocation: async (locationId, changes) => {
        updatedLocation = {
          ...locations[0],
          _id: locationId,
          ...changes
        };
        return updatedLocation;
      },
      createDefaultHours: async () => [],
      listHoursByLocationId: async () => [],
      replaceHours: async () => []
    },
    "../repositories/tickets": {
      listHistoryTickets: async () => [],
      listClientTickets: async () => []
    },
    "../repositories/publicBoardThemes": {
      getResolvedTheme: async () => ({ scope: "fallback", theme: {} })
    },
    "../repositories/serviceCounters": {
      listCountersByLocationId: async () => [],
      listAssignedCounterIdsByUserIds: async () => new Map()
    },
    "../repositories/vendorServices": {
      normalizeServiceSlug: (value) => String(value || "").trim().toLowerCase(),
      listServicesByTenantId: async () => []
    },
    "../repositories/vendorAvailability": {
      listAvailabilityByLocation: async () => ({ blocks: [], exceptions: [] })
    },
    "../repositories/bookings": {
      listBookingsForTenant: async () => []
    },
    "../repositories/users": {
      listUsersByTenantId: async () => []
    },
    "../services/billingService": {
      getBillingOverview: async () => ({ subscription: { entitlements: { locations: 3 } }, plans: [] }),
      getTenantEntitlements: async () => ({ staffSeats: 5, counters: 2, brandedQueuePages: true })
    },
    "../services/publicBoardThemeUploadService": {
      createUpload: async () => ({})
    },
    "../services/locationPaymentQrUploadService": {
      uploadBinary: async ({ location, fileBuffer }) => ({
        asset: {
          objectKey: `payment-qrs/tenants/tenant-1/locations/${location.slug}/test.png`,
          publicUrl: `https://cdn.example.test/payment-qrs/${location.slug}/test.png`,
          contentType: "image/png",
          sizeBytes: fileBuffer.length
        }
      })
    },
    "../services/storeHoursService": {
      getOpenStatus: async () => ({ isOpen: true, timezone: "Asia/Manila", summary: "Open", today: null, nextOpenAt: null })
    },
    "../services/bookingService": {
      expirePendingBookingsForTenant: async () => {}
    },
    "../services/queueService": {
      createTicket: async () => ({}),
      getQueueSnapshot: async () => ({ tenant: { queuePrefix: "DMO", averageServiceMinutes: 5, notificationThreshold: 3 } }),
      callNextTicket: async () => ({ ticket: null, snapshot: { queue: [] } }),
      updateCurrentTicketStatus: async () => ({ ticket: null, snapshot: { queue: [] } }),
      publishSnapshot: async () => ({})
    },
    pdfkit: function MockPdfDocument() {}
  });

  const { server, baseUrl } = await startServer(vendorRouter, "/api/vendor");

  try {
    const deniedResponse = await fetch(`${baseUrl}/tenant/demo/locations/main`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-test-tenant-role": "staff"
      },
      body: JSON.stringify({ paymentQrActive: true })
    });
    assert.equal(deniedResponse.status, 403);

    const invalidResponse = await fetch(`${baseUrl}/tenant/demo/locations/main`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-test-tenant-role": "admin"
      },
      body: JSON.stringify({ paymentQrActive: true })
    });
    assert.equal(invalidResponse.status, 400);

    const updateResponse = await fetch(`${baseUrl}/tenant/demo/locations/main`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-test-tenant-role": "admin"
      },
      body: JSON.stringify({
        paymentMethodLabel: "GCash InstaPay QR",
        paymentAccountDisplayName: "Demo Clinic Main",
        paymentAccountIdentifierDisplay: "0917 *** 1234",
        paymentQrImageUrl: "https://cdn.example.test/payment-qr.png",
        paymentQrActive: true
      })
    });
    assert.equal(updateResponse.status, 200);
    const updateBody = await updateResponse.json();
    assert.equal(updatedLocation.paymentQrActive, true);
    assert.equal(updatedLocation.paymentMethodLabel, "GCash InstaPay QR");
    assert.equal(updateBody.location.paymentAccountDisplayName, "Demo Clinic Main");

    const deniedUploadResponse = await fetch(`${baseUrl}/tenant/demo/location-payment-qrs/uploads/direct?locationSlug=main&fileName=qr.png`, {
      method: "POST",
      headers: {
        "Content-Type": "image/png",
        "x-test-tenant-role": "staff"
      },
      body: Buffer.from("png")
    });
    assert.equal(deniedUploadResponse.status, 403);

    const uploadResponse = await fetch(`${baseUrl}/tenant/demo/location-payment-qrs/uploads/direct?locationSlug=main&fileName=qr.png`, {
      method: "POST",
      headers: {
        "Content-Type": "image/png",
        "x-test-tenant-role": "admin"
      },
      body: Buffer.from("png")
    });
    assert.equal(uploadResponse.status, 201);
    const uploadBody = await uploadResponse.json();
    assert.equal(uploadBody.asset.publicUrl, "https://cdn.example.test/payment-qrs/main/test.png");

    const listResponse = await fetch(`${baseUrl}/tenant/demo/locations`, {
      headers: {
        "x-test-tenant-role": "admin"
      }
    });
    assert.equal(listResponse.status, 200);
    const listBody = await listResponse.json();
    assert.equal(listBody.locations[0].paymentQrActive, false);
  } finally {
    await stopServer(server);
  }
});

test("vendor availability is manageable by vendor admins but denied to staff", async () => {
  const blocks = [
    {
      _id: "block-1",
      tenantId: "tenant-1",
      locationId: "location-1",
      serviceId: "service-1",
      weekday: 1,
      startsAt: "09:00",
      endsAt: "12:00",
      capacity: 2,
      isActive: true,
      notes: "",
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];
  let createdBlock = null;
  let createdException = null;
  let deletedExceptionId = null;

  const vendorRouter = requireWithMocks("../src/routes/vendorRoutes.js", {
    "../middleware/auth": buildAuthMock(),
    "../middleware/asyncHandler": buildAsyncHandlerMock(),
    "../repositories/tenants": {
      findTenantBySlug: async () => ({ _id: "tenant-1", slug: "demo", name: "Demo Tenant" })
    },
    "../repositories/storeLocations": {
      findPrimaryLocationByTenantId: async () => ({
        _id: "location-1",
        tenantId: "tenant-1",
        name: "Main Branch",
        slug: "main"
      }),
      findLocationByTenantAndSlug: async (_tenantId, slug) =>
        slug === "main"
          ? { _id: "location-1", tenantId: "tenant-1", name: "Main Branch", slug: "main" }
          : null,
      listHoursByLocationId: async () => []
    },
    "../repositories/tickets": {
      listHistoryTickets: async () => [],
      listClientTickets: async () => []
    },
    "../repositories/publicBoardThemes": {
      getResolvedTheme: async () => ({ scope: "fallback", theme: {} })
    },
    "../repositories/serviceCounters": {
      listCountersByLocationId: async () => [],
      listAssignedCounterIdsByUserIds: async () => new Map()
    },
    "../repositories/vendorServices": {
      normalizeServiceSlug: (value) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
      listServicesByTenantId: async () => [],
      findServiceByTenantAndSlug: async (_tenantId, slug) =>
        slug === "consultation"
          ? {
              _id: "service-1",
              tenantId: "tenant-1",
              name: "Consultation",
              slug: "consultation"
            }
          : null
    },
    "../repositories/vendorAvailability": {
      listAvailabilityByLocation: async () => ({ blocks, exceptions: [] }),
      findBlockByTenantAndId: async (_tenantId, blockId) => blocks.find((block) => block._id === blockId) || null,
      createBlock: async (data) => {
        createdBlock = {
          _id: "block-2",
          ...data,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        return createdBlock;
      },
      updateBlock: async (blockId, changes) => ({
        ...blocks[0],
        _id: blockId,
        ...changes
      }),
      findExceptionByTenantAndId: async (_tenantId, exceptionId) =>
        exceptionId === "exception-1"
          ? {
              _id: "exception-1",
              tenantId: "tenant-1",
              locationId: "location-1",
              serviceId: null,
              exceptionDate: "2026-07-01",
              startsAt: "",
              endsAt: "",
              isAvailable: false,
              capacity: null,
              reason: "Holiday",
              createdAt: new Date(),
              updatedAt: new Date()
            }
          : null,
      createException: async (data) => {
        createdException = {
          _id: "exception-2",
          ...data,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        return createdException;
      },
      updateException: async (exceptionId, changes) => ({
        _id: exceptionId,
        tenantId: "tenant-1",
        locationId: "location-1",
        serviceId: null,
        ...changes,
        createdAt: new Date(),
        updatedAt: new Date()
      }),
      deleteException: async (exceptionId) => {
        deletedExceptionId = exceptionId;
      }
    },
    "../repositories/users": {
      listUsersByTenantId: async () => []
    },
    "../services/billingService": {
      getBillingOverview: async () => ({ subscription: { entitlements: { locations: 1 } }, plans: [] }),
      getTenantEntitlements: async () => ({ staffSeats: 5, counters: 2, brandedQueuePages: true })
    },
    "../services/publicBoardThemeUploadService": {
      createUpload: async () => ({})
    },
    "../services/storeHoursService": {
      getOpenStatus: async () => ({ isOpen: true, timezone: "Asia/Manila", summary: "Open", today: null, nextOpenAt: null })
    },
    "../services/queueService": {
      createTicket: async () => ({}),
      getQueueSnapshot: async () => ({ tenant: { queuePrefix: "DMO", averageServiceMinutes: 5, notificationThreshold: 3 } }),
      callNextTicket: async () => ({ ticket: null, snapshot: { queue: [] } }),
      updateCurrentTicketStatus: async () => ({ ticket: null, snapshot: { queue: [] } })
    },
    pdfkit: function MockPdfDocument() {}
  });

  const { server, baseUrl } = await startServer(vendorRouter, "/api/vendor");

  try {
    const deniedResponse = await fetch(`${baseUrl}/tenant/demo/availability?location=main`, {
      headers: {
        "x-test-tenant-role": "staff"
      }
    });
    assert.equal(deniedResponse.status, 403);

    const listResponse = await fetch(`${baseUrl}/tenant/demo/availability?location=main`, {
      headers: {
        "x-test-tenant-role": "admin"
      }
    });
    assert.equal(listResponse.status, 200);
    assert.equal((await listResponse.json()).blocks.length, 1);

    const createBlockResponse = await fetch(`${baseUrl}/tenant/demo/availability/blocks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-tenant-role": "admin"
      },
      body: JSON.stringify({
        locationSlug: "main",
        serviceSlug: "consultation",
        weekday: 2,
        startsAt: "10:00",
        endsAt: "15:00",
        capacity: 3
      })
    });
    assert.equal(createBlockResponse.status, 201);
    assert.equal(createdBlock.serviceId, "service-1");
    assert.equal(createdBlock.locationId, "location-1");

    const createExceptionResponse = await fetch(`${baseUrl}/tenant/demo/availability/exceptions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-tenant-role": "owner"
      },
      body: JSON.stringify({
        locationSlug: "main",
        exceptionDate: "2026-07-01",
        isAvailable: false,
        reason: "Holiday"
      })
    });
    assert.equal(createExceptionResponse.status, 201);
    assert.equal(createdException.exceptionDate, "2026-07-01");

    const deleteExceptionResponse = await fetch(`${baseUrl}/tenant/demo/availability/exceptions/exception-1`, {
      method: "DELETE",
      headers: {
        "x-test-tenant-role": "owner"
      }
    });
    assert.equal(deleteExceptionResponse.status, 204);
    assert.equal(deletedExceptionId, "exception-1");
  } finally {
    await stopServer(server);
  }
});

test("vendor service catalog is manageable by vendor admins but denied to staff", async () => {
  const services = [
    {
      _id: "service-1",
      tenantId: "tenant-1",
      name: "Haircut",
      slug: "haircut",
      description: "Standard service",
      durationMinutes: 30,
      allowBookingQuantity: false,
      bookingQuantityLabel: "Units",
      manualPaymentRequired: false,
      priceAmountCents: 25000,
      currency: "PHP",
      priceDisplay: "PHP 250",
      isActive: true,
      sortOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];
  let createdService = null;
  let deactivatedServiceId = null;

  const vendorRouter = requireWithMocks("../src/routes/vendorRoutes.js", {
    "../middleware/auth": buildAuthMock(),
    "../middleware/asyncHandler": buildAsyncHandlerMock(),
    "../repositories/tenants": {
      findTenantBySlug: async () => ({ _id: "tenant-1", slug: "demo", name: "Demo Tenant" })
    },
    "../repositories/storeLocations": {
      findPrimaryLocationByTenantId: async () => ({
        _id: "location-1",
        tenantId: "tenant-1",
        name: "Main Branch",
        slug: "main"
      }),
      listHoursByLocationId: async () => []
    },
    "../repositories/locationServices": {
      listLocationServicesByTenantId: async () => []
    },
    "../repositories/tickets": {
      listHistoryTickets: async () => [],
      listClientTickets: async () => []
    },
    "../repositories/publicBoardThemes": {
      getResolvedTheme: async () => ({ scope: "fallback", theme: {} })
    },
    "../repositories/serviceCounters": {
      listCountersByLocationId: async () => [],
      listAssignedCounterIdsByUserIds: async () => new Map()
    },
    "../repositories/vendorServices": {
      normalizeServiceSlug: (value) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
      listServicesByTenantId: async () => services,
      findServiceByTenantAndSlug: async (_tenantId, slug) => services.find((service) => service.slug === slug) || null,
      createService: async (data) => {
        createdService = {
          _id: "service-2",
          ...data,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        return createdService;
      },
      updateService: async (serviceId, changes) => ({
        ...services[0],
        _id: serviceId,
        ...changes
      }),
      deactivateService: async (serviceId) => {
        deactivatedServiceId = serviceId;
        return {
          ...services[0],
          _id: serviceId,
          isActive: false
        };
      }
    },
    "../repositories/users": {
      listUsersByTenantId: async () => []
    },
    "../services/billingService": {
      getBillingOverview: async () => ({ subscription: { entitlements: { locations: 1 } }, plans: [] }),
      getTenantEntitlements: async () => ({ staffSeats: 5, counters: 2, brandedQueuePages: true })
    },
    "../services/publicBoardThemeUploadService": {
      createUpload: async () => ({})
    },
    "../services/storeHoursService": {
      getOpenStatus: async () => ({ isOpen: true, timezone: "Asia/Manila", summary: "Open", today: null, nextOpenAt: null })
    },
    "../services/queueService": {
      createTicket: async () => ({}),
      getQueueSnapshot: async () => ({ tenant: { queuePrefix: "DMO", averageServiceMinutes: 5, notificationThreshold: 3 } }),
      callNextTicket: async () => ({ ticket: null, snapshot: { queue: [] } }),
      updateCurrentTicketStatus: async () => ({ ticket: null, snapshot: { queue: [] } })
    },
    pdfkit: function MockPdfDocument() {}
  });

  const { server, baseUrl } = await startServer(vendorRouter, "/api/vendor");

  try {
    const deniedResponse = await fetch(`${baseUrl}/tenant/demo/services`, {
      headers: {
        "x-test-tenant-role": "staff"
      }
    });
    assert.equal(deniedResponse.status, 403);

    const listResponse = await fetch(`${baseUrl}/tenant/demo/services`, {
      headers: {
        "x-test-tenant-role": "admin"
      }
    });
    assert.equal(listResponse.status, 200);
    const listBody = await listResponse.json();
    assert.equal(listBody.services.length, 1);
    assert.equal(listBody.services[0].manualPaymentRequired, false);

    const createResponse = await fetch(`${baseUrl}/tenant/demo/services`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-tenant-role": "admin"
      },
      body: JSON.stringify({
        name: "Consultation",
        durationMinutes: 45,
        manualPaymentRequired: true,
        priceAmountCents: 50000
      })
    });
    assert.equal(createResponse.status, 201);
    const createBody = await createResponse.json();
    assert.equal(createdService.slug, "consultation");
    assert.equal(createdService.manualPaymentRequired, true);
    assert.equal(createBody.service.manualPaymentRequired, true);
    assert.equal(createdService.priceDisplay, "₱500");

    const deactivateResponse = await fetch(`${baseUrl}/tenant/demo/services/haircut`, {
      method: "DELETE",
      headers: {
        "x-test-tenant-role": "owner"
      }
    });
    assert.equal(deactivateResponse.status, 200);
    assert.equal(deactivatedServiceId, "service-1");
    assert.equal((await deactivateResponse.json()).service.isActive, false);
  } finally {
    await stopServer(server);
  }
});

test("vendor staff is denied owner-only settings route but can operate queue and read staff, clients, and history", async () => {
  const vendorRouter = requireWithMocks("../src/routes/vendorRoutes.js", {
    "../middleware/auth": buildAuthMock(),
    "../middleware/asyncHandler": buildAsyncHandlerMock(),
    "../repositories/tenants": {
      findTenantBySlug: async () => ({ _id: "tenant-1", slug: "demo", name: "Demo Tenant" }),
      updateTenant: async (tenantId, changes) => ({
        _id: tenantId,
        name: "Demo Tenant",
        slug: "demo",
        queuePrefix: changes.queuePrefix || "DMO",
        averageServiceMinutes: changes.averageServiceMinutes || 5,
        notificationThreshold: changes.notificationThreshold || 3,
        contactEmail: changes.contactEmail || "ops@getprio.local",
        contactPhone: changes.contactPhone || "09170000000"
      })
    },
    "../repositories/storeLocations": {
      findPrimaryLocationByTenantId: async () => ({
        _id: "location-1",
        tenantId: "tenant-1",
        name: "Main Branch",
        slug: "main"
      }),
      listHoursByLocationId: async () => [],
      findLocationByTenantAndSlug: async () => ({
        _id: "location-1",
        tenantId: "tenant-1",
        name: "Main Branch",
        slug: "main"
      })
    },
    "../repositories/tickets": {
      listHistoryTickets: async () => [],
      listClientTickets: async () => []
    },
    "../repositories/publicBoardThemes": {
      getResolvedTheme: async () => ({ scope: "fallback", theme: {} })
    },
    "../repositories/serviceCounters": {
      listCountersByLocationId: async () => [],
      listAssignedCounterIdsByUserIds: async () => new Map()
    },
    "../repositories/users": {
      listUsersByTenantId: async () => [
        {
          _id: "user-1",
          name: "Owner User",
          email: "owner@getprio.local",
          phone: null,
          tenantMemberships: [{ tenantId: "tenant-1", role: "owner" }]
        }
      ]
    },
    "../services/billingService": {
      getBillingOverview: async () => ({ subscription: { entitlements: { locations: 1 } }, plans: [] }),
      getTenantEntitlements: async () => ({ staffSeats: 5, counters: 2, brandedQueuePages: true })
    },
    "../services/publicBoardThemeUploadService": {
      createUpload: async () => ({})
    },
    "../services/storeHoursService": {
      getOpenStatus: async () => ({ isOpen: true, timezone: "Asia/Manila", summary: "Open", today: null, nextOpenAt: null })
    },
    "../services/queueService": {
      createTicket: async () => ({}),
      getQueueSnapshot: async () => ({ tenant: { queuePrefix: "DMO", averageServiceMinutes: 5, notificationThreshold: 3 } }),
      callNextTicket: async () => ({
        ticket: { _id: "ticket-1", ticketNumber: "DMO-001", status: "called" },
        snapshot: { queue: [] }
      }),
      updateCurrentTicketStatus: async () => ({
        ticket: { _id: "ticket-1", ticketNumber: "DMO-001", status: "served" },
        snapshot: { queue: [] }
      })
    },
    pdfkit: function MockPdfDocument() {}
  });

  const { server, baseUrl } = await startServer(vendorRouter, "/api/vendor");

  try {
    const deniedResponse = await fetch(`${baseUrl}/tenant/demo/settings`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-test-tenant-role": "staff"
      },
      body: JSON.stringify({ queuePrefix: "NEW" })
    });
    assert.equal(deniedResponse.status, 403);

    const queueResponse = await fetch(`${baseUrl}/tenant/demo/queue/call-next`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-tenant-role": "staff"
      },
      body: JSON.stringify({})
    });
    assert.equal(queueResponse.status, 200);

    const staffListResponse = await fetch(`${baseUrl}/tenant/demo/staff`, {
      headers: {
        "x-test-tenant-role": "staff"
      }
    });
    assert.equal(staffListResponse.status, 200);

    const clientsResponse = await fetch(`${baseUrl}/tenant/demo/clients?location=main`, {
      headers: {
        "x-test-tenant-role": "staff"
      }
    });
    assert.equal(clientsResponse.status, 200);

    const historyResponse = await fetch(`${baseUrl}/tenant/demo/history?location=main`, {
      headers: {
        "x-test-tenant-role": "staff"
      }
    });
    assert.equal(historyResponse.status, 200);
  } finally {
    await stopServer(server);
  }
});

test("tenant owner can access billing management routes", async () => {
  const billingRouter = requireWithMocks("../src/routes/billingRoutes.js", {
    "../middleware/auth": buildAuthMock(),
    "../middleware/asyncHandler": buildAsyncHandlerMock(),
    "../repositories/tenants": {
      findTenantBySlug: async () => ({ _id: "tenant-1", slug: "demo", name: "Demo Tenant" })
    },
    "../services/billingService": {
      getBillingOverview: async () => ({ plans: [], addOns: [], subscription: null }),
      createPayMongoCheckout: async () => ({
        checkoutSession: {
          id: "checkout-1",
          checkoutUrl: "https://paymongo.test/checkout-1"
        }
      }),
      syncPayMongoCheckout: async () => ({ synced: true, paid: true, billing: { plans: [], addOns: [], subscription: null } })
    }
  });

  const { server, baseUrl } = await startServer(billingRouter, "/api/billing");

  try {
    const ownerResponse = await fetch(`${baseUrl}/tenant/demo/checkout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-tenant-role": "owner"
      },
      body: JSON.stringify({ planSlug: "pro", billingInterval: "monthly" })
    });
    assert.equal(ownerResponse.status, 201);

    const staffResponse = await fetch(`${baseUrl}/tenant/demo/checkout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-tenant-role": "staff"
      },
      body: JSON.stringify({ planSlug: "pro", billingInterval: "monthly" })
    });
    assert.equal(staffResponse.status, 403);
  } finally {
    await stopServer(server);
  }
});

test("tenant admin cannot add another admin through staff invite", async () => {
  const vendorRouter = requireWithMocks("../src/routes/vendorRoutes.js", {
    "../middleware/auth": buildAuthMock(),
    "../middleware/asyncHandler": buildAsyncHandlerMock(),
    "../repositories/tenants": {
      findTenantBySlug: async () => ({ _id: "tenant-1", slug: "demo", name: "Demo Tenant" })
    },
    "../repositories/storeLocations": {
      findPrimaryLocationByTenantId: async () => ({
        _id: "location-1",
        tenantId: "tenant-1",
        name: "Main Branch",
        slug: "main"
      }),
      listHoursByLocationId: async () => []
    },
    "../repositories/tickets": {
      listHistoryTickets: async () => [],
      listClientTickets: async () => []
    },
    "../repositories/publicBoardThemes": {
      getResolvedTheme: async () => ({ scope: "fallback", theme: {} })
    },
    "../repositories/serviceCounters": {
      listCountersByLocationId: async () => [],
      listAssignedCounterIdsByUserIds: async () => new Map()
    },
    "../repositories/users": {
      listUsersByTenantId: async () => [
        {
          _id: "owner-1",
          name: "Owner User",
          email: "owner@getprio.local",
          phone: null,
          tenantMemberships: [{ tenantId: "tenant-1", role: "owner" }]
        }
      ],
      findUserByEmail: async () => ({
        _id: "invitee-1",
        name: "Invitee",
        email: "invitee@getprio.local",
        phone: null,
        tenantMemberships: []
      }),
      addTenantMembership: async () => {
        throw new Error("addTenantMembership should not be called");
      }
    },
    "../services/billingService": {
      getBillingOverview: async () => ({ subscription: { entitlements: { locations: 1 } }, plans: [] }),
      getTenantEntitlements: async () => ({ staffSeats: 5, counters: 2, brandedQueuePages: true })
    },
    "../services/publicBoardThemeUploadService": {
      createUpload: async () => ({})
    },
    "../services/storeHoursService": {
      getOpenStatus: async () => ({ isOpen: true, timezone: "Asia/Manila", summary: "Open", today: null, nextOpenAt: null })
    },
    "../services/queueService": {
      createTicket: async () => ({}),
      getQueueSnapshot: async () => ({ tenant: { queuePrefix: "DMO", averageServiceMinutes: 5, notificationThreshold: 3 } }),
      callNextTicket: async () => ({ ticket: null, snapshot: { queue: [] } }),
      updateCurrentTicketStatus: async () => ({ ticket: null, snapshot: { queue: [] } })
    },
    pdfkit: function MockPdfDocument() {}
  });

  const { server, baseUrl } = await startServer(vendorRouter, "/api/vendor");

  try {
    const response = await fetch(`${baseUrl}/tenant/demo/staff`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-tenant-role": "admin"
      },
      body: JSON.stringify({
        email: "invitee@getprio.local",
        role: "admin"
      })
    });
    assert.equal(response.status, 403);
    assert.match(await response.text(), /Tenant admins can only invite staff members/i);
  } finally {
    await stopServer(server);
  }
});

test("tenant admin can invite a staff member", async () => {
  let addMembershipCalled = false;
  const vendorRouter = requireWithMocks("../src/routes/vendorRoutes.js", {
    "../middleware/auth": buildAuthMock(),
    "../middleware/asyncHandler": buildAsyncHandlerMock(),
    "../repositories/tenants": {
      findTenantBySlug: async () => ({ _id: "tenant-1", slug: "demo", name: "Demo Tenant" })
    },
    "../repositories/storeLocations": {
      findPrimaryLocationByTenantId: async () => ({
        _id: "location-1",
        tenantId: "tenant-1",
        name: "Main Branch",
        slug: "main"
      }),
      listHoursByLocationId: async () => []
    },
    "../repositories/tickets": {
      listHistoryTickets: async () => [],
      listClientTickets: async () => []
    },
    "../repositories/publicBoardThemes": {
      getResolvedTheme: async () => ({ scope: "fallback", theme: {} })
    },
    "../repositories/serviceCounters": {
      listCountersByLocationId: async () => [],
      listAssignedCounterIdsByUserIds: async () => new Map()
    },
    "../repositories/users": {
      listUsersByTenantId: async () => [
        {
          _id: "owner-1",
          name: "Owner User",
          email: "owner@getprio.local",
          phone: null,
          tenantMemberships: [{ tenantId: "tenant-1", role: "owner" }]
        }
      ],
      findUserByEmail: async () => ({
        _id: "invitee-1",
        name: "Invitee",
        email: "invitee@getprio.local",
        phone: null,
        tenantMemberships: []
      }),
      addTenantMembership: async (_userId, _tenantId, role) => {
        addMembershipCalled = role === "staff";
      }
    },
    "../services/billingService": {
      getBillingOverview: async () => ({ subscription: { entitlements: { locations: 1 } }, plans: [] }),
      getTenantEntitlements: async () => ({ staffSeats: 5, counters: 2, brandedQueuePages: true })
    },
    "../services/publicBoardThemeUploadService": {
      createUpload: async () => ({})
    },
    "../services/storeHoursService": {
      getOpenStatus: async () => ({ isOpen: true, timezone: "Asia/Manila", summary: "Open", today: null, nextOpenAt: null })
    },
    "../services/queueService": {
      createTicket: async () => ({}),
      getQueueSnapshot: async () => ({ tenant: { queuePrefix: "DMO", averageServiceMinutes: 5, notificationThreshold: 3 } }),
      callNextTicket: async () => ({ ticket: null, snapshot: { queue: [] } }),
      updateCurrentTicketStatus: async () => ({ ticket: null, snapshot: { queue: [] } })
    },
    pdfkit: function MockPdfDocument() {}
  });

  const { server, baseUrl } = await startServer(vendorRouter, "/api/vendor");

  try {
    const response = await fetch(`${baseUrl}/tenant/demo/staff`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-tenant-role": "admin"
      },
      body: JSON.stringify({
        email: "invitee@getprio.local",
        role: "staff"
      })
    });
    assert.equal(response.status, 201);
    assert.equal(addMembershipCalled, true);
  } finally {
    await stopServer(server);
  }
});

test("tenant admin cannot change another staff member role", async () => {
  const vendorRouter = requireWithMocks("../src/routes/vendorRoutes.js", {
    "../middleware/auth": buildAuthMock(),
    "../middleware/asyncHandler": buildAsyncHandlerMock(),
    "../repositories/tenants": {
      findTenantBySlug: async () => ({ _id: "tenant-1", slug: "demo", name: "Demo Tenant" })
    },
    "../repositories/storeLocations": {
      findPrimaryLocationByTenantId: async () => ({
        _id: "location-1",
        tenantId: "tenant-1",
        name: "Main Branch",
        slug: "main"
      }),
      listHoursByLocationId: async () => []
    },
    "../repositories/tickets": {
      listHistoryTickets: async () => [],
      listClientTickets: async () => []
    },
    "../repositories/publicBoardThemes": {
      getResolvedTheme: async () => ({ scope: "fallback", theme: {} })
    },
    "../repositories/serviceCounters": {
      listCountersByLocationId: async () => [],
      listAssignedCounterIdsByUserIds: async () => new Map()
    },
    "../repositories/users": {
      findUserById: async () => ({
        _id: "staff-2",
        name: "Staff User",
        email: "staff@getprio.local",
        phone: null,
        tenantMemberships: [{ tenantId: "tenant-1", role: "staff", isActive: true }]
      }),
      listUsersByTenantId: async () => [
        {
          _id: "owner-1",
          name: "Owner User",
          email: "owner@getprio.local",
          phone: null,
          tenantMemberships: [{ tenantId: "tenant-1", role: "owner", isActive: true }]
        }
      ],
      updateTenantMembershipRole: async () => {
        throw new Error("updateTenantMembershipRole should not be called");
      }
    },
    "../services/billingService": {
      getBillingOverview: async () => ({ subscription: { entitlements: { locations: 1 } }, plans: [] }),
      getTenantEntitlements: async () => ({ staffSeats: 5, counters: 2, brandedQueuePages: true })
    },
    "../services/publicBoardThemeUploadService": {
      createUpload: async () => ({})
    },
    "../services/storeHoursService": {
      getOpenStatus: async () => ({ isOpen: true, timezone: "Asia/Manila", summary: "Open", today: null, nextOpenAt: null })
    },
    "../services/queueService": {
      createTicket: async () => ({}),
      getQueueSnapshot: async () => ({ tenant: { queuePrefix: "DMO", averageServiceMinutes: 5, notificationThreshold: 3 } }),
      callNextTicket: async () => ({ ticket: null, snapshot: { queue: [] } }),
      updateCurrentTicketStatus: async () => ({ ticket: null, snapshot: { queue: [] } })
    },
    pdfkit: function MockPdfDocument() {}
  });

  const { server, baseUrl } = await startServer(vendorRouter, "/api/vendor");

  try {
    const response = await fetch(`${baseUrl}/tenant/demo/staff/staff-2`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-test-tenant-role": "admin"
      },
      body: JSON.stringify({ role: "admin" })
    });
    assert.equal(response.status, 403);
    assert.match(await response.text(), /Only tenant owners can change staff roles/i);
  } finally {
    await stopServer(server);
  }
});

test("tenant admin cannot remove another staff member", async () => {
  const vendorRouter = requireWithMocks("../src/routes/vendorRoutes.js", {
    "../middleware/auth": buildAuthMock(),
    "../middleware/asyncHandler": buildAsyncHandlerMock(),
    "../repositories/tenants": {
      findTenantBySlug: async () => ({ _id: "tenant-1", slug: "demo", name: "Demo Tenant" })
    },
    "../repositories/storeLocations": {
      findPrimaryLocationByTenantId: async () => ({
        _id: "location-1",
        tenantId: "tenant-1",
        name: "Main Branch",
        slug: "main"
      }),
      listHoursByLocationId: async () => []
    },
    "../repositories/tickets": {
      listHistoryTickets: async () => [],
      listClientTickets: async () => []
    },
    "../repositories/publicBoardThemes": {
      getResolvedTheme: async () => ({ scope: "fallback", theme: {} })
    },
    "../repositories/serviceCounters": {
      listCountersByLocationId: async () => [],
      listAssignedCounterIdsByUserIds: async () => new Map()
    },
    "../repositories/users": {
      findUserById: async () => ({
        _id: "staff-2",
        name: "Staff User",
        email: "staff@getprio.local",
        phone: null,
        tenantMemberships: [{ tenantId: "tenant-1", role: "staff", isActive: true }]
      }),
      removeTenantMembership: async () => {
        throw new Error("removeTenantMembership should not be called");
      }
    },
    "../services/billingService": {
      getBillingOverview: async () => ({ subscription: { entitlements: { locations: 1 } }, plans: [] }),
      getTenantEntitlements: async () => ({ staffSeats: 5, counters: 2, brandedQueuePages: true })
    },
    "../services/publicBoardThemeUploadService": {
      createUpload: async () => ({})
    },
    "../services/storeHoursService": {
      getOpenStatus: async () => ({ isOpen: true, timezone: "Asia/Manila", summary: "Open", today: null, nextOpenAt: null })
    },
    "../services/queueService": {
      createTicket: async () => ({}),
      getQueueSnapshot: async () => ({ tenant: { queuePrefix: "DMO", averageServiceMinutes: 5, notificationThreshold: 3 } }),
      callNextTicket: async () => ({ ticket: null, snapshot: { queue: [] } }),
      updateCurrentTicketStatus: async () => ({ ticket: null, snapshot: { queue: [] } })
    },
    pdfkit: function MockPdfDocument() {}
  });

  const { server, baseUrl } = await startServer(vendorRouter, "/api/vendor");

  try {
    const response = await fetch(`${baseUrl}/tenant/demo/staff/staff-2`, {
      method: "DELETE",
      headers: {
        "x-test-tenant-role": "admin"
      }
    });
    assert.equal(response.status, 403);
    assert.match(await response.text(), /Only tenant owners can remove staff members/i);
  } finally {
    await stopServer(server);
  }
});

test("tenant owner cannot add a second owner through staff invite", async () => {
  const vendorRouter = requireWithMocks("../src/routes/vendorRoutes.js", {
    "../middleware/auth": buildAuthMock(),
    "../middleware/asyncHandler": buildAsyncHandlerMock(),
    "../repositories/tenants": {
      findTenantBySlug: async () => ({ _id: "tenant-1", slug: "demo", name: "Demo Tenant" })
    },
    "../repositories/storeLocations": {
      findPrimaryLocationByTenantId: async () => ({
        _id: "location-1",
        tenantId: "tenant-1",
        name: "Main Branch",
        slug: "main"
      }),
      listHoursByLocationId: async () => []
    },
    "../repositories/tickets": {
      listHistoryTickets: async () => [],
      listClientTickets: async () => []
    },
    "../repositories/publicBoardThemes": {
      getResolvedTheme: async () => ({ scope: "fallback", theme: {} })
    },
    "../repositories/serviceCounters": {
      listCountersByLocationId: async () => [],
      listAssignedCounterIdsByUserIds: async () => new Map()
    },
    "../repositories/users": {
      listUsersByTenantId: async () => [
        {
          _id: "owner-1",
          name: "Owner User",
          email: "owner@getprio.local",
          phone: null,
          tenantMemberships: [{ tenantId: "tenant-1", role: "owner" }]
        }
      ],
      findUserByEmail: async () => ({
        _id: "invitee-1",
        name: "Invitee",
        email: "invitee@getprio.local",
        phone: null,
        tenantMemberships: []
      }),
      addTenantMembership: async () => {
        throw new Error("addTenantMembership should not be called");
      }
    },
    "../services/billingService": {
      getBillingOverview: async () => ({ subscription: { entitlements: { locations: 1 } }, plans: [] }),
      getTenantEntitlements: async () => ({ staffSeats: 5, counters: 2, brandedQueuePages: true })
    },
    "../services/publicBoardThemeUploadService": {
      createUpload: async () => ({})
    },
    "../services/storeHoursService": {
      getOpenStatus: async () => ({ isOpen: true, timezone: "Asia/Manila", summary: "Open", today: null, nextOpenAt: null })
    },
    "../services/queueService": {
      createTicket: async () => ({}),
      getQueueSnapshot: async () => ({ tenant: { queuePrefix: "DMO", averageServiceMinutes: 5, notificationThreshold: 3 } }),
      callNextTicket: async () => ({ ticket: null, snapshot: { queue: [] } }),
      updateCurrentTicketStatus: async () => ({ ticket: null, snapshot: { queue: [] } })
    },
    pdfkit: function MockPdfDocument() {}
  });

  const { server, baseUrl } = await startServer(vendorRouter, "/api/vendor");

  try {
    const response = await fetch(`${baseUrl}/tenant/demo/staff`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-tenant-role": "owner"
      },
      body: JSON.stringify({
        email: "invitee@getprio.local",
        role: "owner"
      })
    });
    assert.equal(response.status, 400);
    assert.match(await response.text(), /Only one tenant owner is allowed per vendor/i);
  } finally {
    await stopServer(server);
  }
});

test("platform routes allow platform admins and deny non-admin users", async () => {
  const platformRouter = requireWithMocks("../src/routes/platformRoutes.js", {
    "../middleware/auth": buildAuthMock(),
    "../middleware/asyncHandler": buildAsyncHandlerMock(),
    "../repositories/platform": {
      getOverviewTotals: async () => ({}),
      listRecentPayments: async () => [],
      getOverviewAnalytics: async () => ({}),
      getPlatformSettings: async () => ({}),
      updatePlatformSettings: async () => ({}),
      listTenants: async () => [],
      listSubscriptions: async () => [],
      listUsers: async () => [{ id: "user-1" }],
      listBillingEvents: async () => []
    },
    "../repositories/queueJoinPayments": {
      listPayments: async () => []
    },
    "../services/queueFeeService": {
      listQueueFees: async () => [],
      updateQueueFees: async () => []
    },
    "../services/queueJoinPaymentService": {
      formatPayment: (payment) => payment
    },
    "../repositories/subscriptionPlans": {
      listPlans: async () => [],
      updatePlan: async () => ({ slug: "pro" })
    }
  });

  const { server, baseUrl } = await startServer(platformRouter, "/api/platform");

  try {
    const deniedResponse = await fetch(`${baseUrl}/users`);
    assert.equal(deniedResponse.status, 403);

    const allowedResponse = await fetch(`${baseUrl}/users`, {
      headers: {
        "x-test-platform-admin": "true"
      }
    });
    assert.equal(allowedResponse.status, 200);
  } finally {
    await stopServer(server);
  }
});
