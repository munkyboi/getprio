const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const express = require("express");

function buildAsyncHandlerMock() {
  return (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function buildAuthMock() {
  return {
    authenticate(req, _res, next) {
      req.user = {
        _id: "user-1",
        name: "Customer One",
        email: "customer@example.com",
        phone: "09171234567",
        emailVerified: true
      };
      next();
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

test("customer account overview and history expose owned tickets only", async () => {
  const tickets = [
    {
      _id: "ticket-1",
      lookupCode: "ABC12345",
      ticketNumber: "DMO-001",
      tenantName: "Demo Tenant",
      tenantSlug: "demo",
      locationName: "Main",
      locationSlug: "main",
      status: "waiting",
      createdAt: "2026-06-19T01:00:00.000Z",
      updatedAt: "2026-06-19T01:05:00.000Z"
    }
  ];

  const router = requireWithMocks("../src/routes/accountRoutes.js", {
    "../middleware/auth": buildAuthMock(),
    "../middleware/asyncHandler": buildAsyncHandlerMock(),
    "../repositories/tickets": {
      listTicketsForCustomerAccount: async () => tickets
    },
    "../services/passwordResetService": {
      changePassword: async () => {}
    }
  });

  const { server, baseUrl } = await startServer(router, "/api/account");

  try {
    const overviewResponse = await fetch(`${baseUrl}/overview`, {
      headers: { Authorization: "Bearer token" }
    });
    assert.equal(overviewResponse.status, 200);
    const overview = await overviewResponse.json();
    assert.equal(overview.user.email, "customer@example.com");
    assert.equal(overview.tickets.length, 1);
    assert.equal(overview.tickets[0].ticketNumber, "DMO-001");

    const historyResponse = await fetch(`${baseUrl}/history?limit=500`, {
      headers: { Authorization: "Bearer token" }
    });
    assert.equal(historyResponse.status, 200);
    const history = await historyResponse.json();
    assert.equal(history.tickets.length, 1);
    assert.equal(history.tickets[0].lookupCode, "ABC12345");
  } finally {
    await stopServer(server);
  }
});

test("customer bookings can be created only inside vendor availability", async () => {
  const bookings = [];
  const router = requireWithMocks("../src/routes/accountRoutes.js", {
    "../middleware/auth": buildAuthMock(),
    "../middleware/asyncHandler": buildAsyncHandlerMock(),
    "../repositories/tickets": {
      listTicketsForCustomerAccount: async () => []
    },
    "../repositories/bookings": {
      listBookingsForCustomer: async () => bookings,
      createBooking: async (data) => {
        const booking = {
          _id: "booking-1",
          reference: "BKG-TEST0001",
          tenantId: "tenant-1",
          tenantName: "Demo Tenant",
          tenantSlug: "demo",
          locationId: "location-1",
          locationName: "Main Branch",
          locationSlug: "main",
          serviceId: "service-1",
          serviceName: "Consultation",
          serviceSlug: "consultation",
          servicePriceDisplay: "PHP 500",
          customerUserId: data.customerUserId,
          customerName: data.customerName,
          customerEmail: data.customerEmail,
          customerPhone: data.customerPhone,
          scheduledStartAt: data.scheduledStartAt,
          scheduledEndAt: data.scheduledEndAt,
          status: "pending",
          notes: data.notes || "",
          paymentReference: data.paymentReference || "",
          paymentStatus: "unpaid",
          createdAt: "2026-06-22T00:00:00.000Z",
          updatedAt: "2026-06-22T00:00:00.000Z"
        };
        bookings.push(booking);
        return booking;
      }
    },
    "../services/bookingService": requireWithMocks("../src/services/bookingService.js", {
      "../repositories/bookings": {
        createBooking: async (data) => {
          const booking = {
            _id: "booking-1",
            reference: "BKG-TEST0001",
            tenantId: "tenant-1",
            tenantName: "Demo Tenant",
            tenantSlug: "demo",
            locationId: "location-1",
            locationName: "Main Branch",
            locationSlug: "main",
            serviceId: "service-1",
            serviceName: "Consultation",
            serviceSlug: "consultation",
            servicePriceDisplay: "PHP 500",
            customerUserId: data.customerUserId,
            customerName: data.customerName,
            customerEmail: data.customerEmail,
            customerPhone: data.customerPhone,
            scheduledStartAt: data.scheduledStartAt,
            scheduledEndAt: data.scheduledEndAt,
            status: "pending",
            notes: data.notes || "",
            paymentReference: data.paymentReference || "",
            paymentStatus: "unpaid",
            createdAt: "2026-06-22T00:00:00.000Z",
            updatedAt: "2026-06-22T00:00:00.000Z"
          };
          bookings.push(booking);
          return booking;
        }
      },
      "../repositories/tenants": {
        findTenantBySlug: async (slug) =>
          slug === "demo"
            ? {
                _id: "tenant-1",
                slug: "demo",
                name: "Demo Tenant",
                publicProfileEnabled: true,
                vendorApprovalStatus: "approved"
              }
            : null
      },
      "../repositories/storeLocations": {
        findLocationByTenantAndSlug: async (_tenantId, slug) =>
          slug === "main"
            ? {
                _id: "location-1",
                tenantId: "tenant-1",
                slug: "main",
                name: "Main Branch",
                isActive: true
              }
            : null
      },
      "../repositories/vendorServices": {
        normalizeServiceSlug: (value) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
        findServiceByTenantAndSlug: async (_tenantId, slug) =>
          slug === "consultation"
            ? {
                _id: "service-1",
                tenantId: "tenant-1",
                name: "Consultation",
                slug: "consultation",
                durationMinutes: 60,
                isActive: true
              }
            : null
      },
      "../repositories/vendorAvailability": {
        listAvailabilityByLocation: async () => ({
          blocks: [
            {
              _id: "block-1",
              tenantId: "tenant-1",
              locationId: "location-1",
              serviceId: "service-1",
              weekday: 1,
              startsAt: "09:00",
              endsAt: "17:00",
              capacity: 1,
              isActive: true
            }
          ],
          exceptions: []
        })
      }
    }),
    "../services/passwordResetService": {
      changePassword: async () => {}
    }
  });

  const { server, baseUrl } = await startServer(router, "/api/account");

  try {
    const acceptedResponse = await fetch(`${baseUrl}/bookings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token"
      },
      body: JSON.stringify({
        tenantSlug: "demo",
        locationSlug: "main",
        serviceSlug: "consultation",
        scheduledStartAt: "2026-06-29T02:00:00.000Z",
        notes: "First visit"
      })
    });
    assert.equal(acceptedResponse.status, 201);
    const accepted = await acceptedResponse.json();
    assert.equal(accepted.booking.reference, "BKG-TEST0001");
    assert.equal(accepted.booking.status, "pending");

    const rejectedResponse = await fetch(`${baseUrl}/bookings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token"
      },
      body: JSON.stringify({
        tenantSlug: "demo",
        locationSlug: "main",
        serviceSlug: "consultation",
        scheduledStartAt: "2026-06-29T23:00:00.000Z"
      })
    });
    assert.equal(rejectedResponse.status, 409);

    const listResponse = await fetch(`${baseUrl}/bookings`, {
      headers: { Authorization: "Bearer token" }
    });
    assert.equal(listResponse.status, 200);
    assert.equal((await listResponse.json()).bookings.length, 1);
  } finally {
    await stopServer(server);
  }
});

test("customer bookings use store hours when no booking availability is configured", async () => {
  const bookings = [];
  const router = requireWithMocks("../src/routes/accountRoutes.js", {
    "../middleware/auth": buildAuthMock(),
    "../middleware/asyncHandler": buildAsyncHandlerMock(),
    "../repositories/tickets": {
      listTicketsForCustomerAccount: async () => []
    },
    "../repositories/bookings": {
      listBookingsForCustomer: async () => bookings,
      createBooking: async (data) => {
        const booking = {
          _id: "booking-1",
          reference: "BKG-TEST0002",
          tenantId: "tenant-1",
          tenantName: "Demo Tenant",
          tenantSlug: "demo",
          locationId: "location-1",
          locationName: "Main Branch",
          locationSlug: "main",
          serviceId: "service-1",
          serviceName: "Consultation",
          serviceSlug: "consultation",
          servicePriceDisplay: "PHP 500",
          customerUserId: data.customerUserId,
          customerName: data.customerName,
          customerEmail: data.customerEmail,
          customerPhone: data.customerPhone,
          scheduledStartAt: data.scheduledStartAt,
          scheduledEndAt: data.scheduledEndAt,
          status: "pending",
          notes: data.notes || "",
          paymentReference: data.paymentReference || "",
          paymentStatus: "unpaid",
          createdAt: "2026-06-22T00:00:00.000Z",
          updatedAt: "2026-06-22T00:00:00.000Z"
        };
        bookings.push(booking);
        return booking;
      }
    },
    "../services/bookingService": requireWithMocks("../src/services/bookingService.js", {
      "../repositories/bookings": {
        createBooking: async (data) => {
          const booking = {
            _id: "booking-1",
            reference: "BKG-TEST0002",
            tenantId: "tenant-1",
            tenantName: "Demo Tenant",
            tenantSlug: "demo",
            locationId: "location-1",
            locationName: "Main Branch",
            locationSlug: "main",
            serviceId: "service-1",
            serviceName: "Consultation",
            serviceSlug: "consultation",
            servicePriceDisplay: "PHP 500",
            customerUserId: data.customerUserId,
            customerName: data.customerName,
            customerEmail: data.customerEmail,
            customerPhone: data.customerPhone,
            scheduledStartAt: data.scheduledStartAt,
            scheduledEndAt: data.scheduledEndAt,
            status: "pending",
            notes: data.notes || "",
            paymentReference: data.paymentReference || "",
            paymentStatus: "unpaid",
            createdAt: "2026-06-22T00:00:00.000Z",
            updatedAt: "2026-06-22T00:00:00.000Z"
          };
          bookings.push(booking);
          return booking;
        }
      },
      "../repositories/tenants": {
        findTenantBySlug: async () => ({
          _id: "tenant-1",
          slug: "demo",
          name: "Demo Tenant",
          publicProfileEnabled: true,
          vendorApprovalStatus: "approved"
        })
      },
      "../repositories/storeLocations": {
        findLocationByTenantAndSlug: async () => ({
          _id: "location-1",
          tenantId: "tenant-1",
          slug: "main",
          name: "Main Branch",
          timezone: "Asia/Manila",
          isActive: true
        }),
        listHoursByLocationId: async () => [
          { weekday: 1, opensAt: "09:00", closesAt: "17:00", isClosed: false }
        ]
      },
      "../repositories/vendorServices": {
        normalizeServiceSlug: (value) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
        findServiceByTenantAndSlug: async () => ({
          _id: "service-1",
          tenantId: "tenant-1",
          name: "Consultation",
          slug: "consultation",
          durationMinutes: 60,
          isActive: true
        })
      },
      "../repositories/vendorAvailability": {
        listAvailabilityByLocation: async () => ({
          blocks: [],
          exceptions: []
        })
      }
    }),
    "../services/passwordResetService": {
      changePassword: async () => {}
    }
  });

  const { server, baseUrl } = await startServer(router, "/api/account");

  try {
    const acceptedResponse = await fetch(`${baseUrl}/bookings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token"
      },
      body: JSON.stringify({
        tenantSlug: "demo",
        locationSlug: "main",
        serviceSlug: "consultation",
        scheduledStartAt: "2026-06-29T02:00:00.000Z"
      })
    });
    assert.equal(acceptedResponse.status, 201);
    assert.equal((await acceptedResponse.json()).booking.reference, "BKG-TEST0002");

    const rejectedResponse = await fetch(`${baseUrl}/bookings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token"
      },
      body: JSON.stringify({
        tenantSlug: "demo",
        locationSlug: "main",
        serviceSlug: "consultation",
        scheduledStartAt: "2026-06-29T23:00:00.000Z"
      })
    });
    assert.equal(rejectedResponse.status, 409);
  } finally {
    await stopServer(server);
  }
});
