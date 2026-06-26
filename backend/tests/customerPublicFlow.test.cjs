const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const express = require("express");

function buildAsyncHandlerMock() {
  return (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function buildErrorHandlerMock() {
  return (error, _req, res, _next) => {
    res.status(error.statusCode || 500).json({
      message: error.message || "Unexpected server error."
    });
  };
}

function buildPublicAuthMock() {
  return {
    maybeAuthenticate(req, _res, next) {
      const mode = req.headers["x-test-auth-mode"];

      if (mode === "customer") {
        req.user = {
          _id: "user-1",
          roles: ["customer"],
          email: "customer@example.com",
          phone: "09171234567"
        };
      } else {
        req.user = null;
      }

      next();
    }
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
      // Try next candidate.
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

function buildPublicRouter(ticket, cancelTicketMock) {
  const vendorProfiles = [
    {
      name: "Demo Tenant",
      slug: "demo",
      category: "Clinic",
      description: "Public queue and booking profile.",
      imageUrl: "",
      locations: [
        {
          name: "Ayala",
          slug: "ayala",
          city: "Cebu City",
          province: "Cebu",
          country: "Philippines",
          isPrimary: true,
          hours: [
            { weekday: 0, opensAt: "08:00", closesAt: "17:00", isClosed: false },
            { weekday: 1, opensAt: "", closesAt: "", isClosed: true }
          ]
        },
        {
          name: "West",
          slug: "west",
          city: "Mandaue",
          province: "Cebu",
          country: "Philippines",
          isPrimary: false,
          hours: [
            { weekday: 0, opensAt: "10:00", closesAt: "19:00", isClosed: false }
          ]
        }
      ],
      location: {
        name: "Ayala",
        slug: "ayala",
        city: "Cebu City",
        province: "Cebu",
        country: "Philippines"
      }
    }
  ];

  return requireWithMocks("../src/routes/publicRoutes.js", {
    "../middleware/auth": buildPublicAuthMock(),
    "../middleware/asyncHandler": buildAsyncHandlerMock(),
    "../repositories/tenants": {
      listPublicVendorProfiles: async ({ search } = {}) =>
        search && !JSON.stringify(vendorProfiles).toLowerCase().includes(String(search).toLowerCase())
          ? []
          : vendorProfiles,
      findPublicVendorProfileBySlug: async (slug) =>
        slug === "demo" ? vendorProfiles[0] : null,
      findTenantBySlug: async () => ({
        _id: "tenant-1",
        slug: "demo",
        name: "Demo Tenant",
        isActive: true
      }),
      findTenantById: async () => ({ _id: "tenant-1", slug: "demo", name: "Demo Tenant" })
    },
    "../repositories/storeLocations": {
      findPrimaryLocationByTenantId: async () => ({
        _id: "location-1",
        tenantId: "tenant-1",
        slug: "ayala",
        name: "Ayala",
        timezone: "Asia/Manila",
        isPrimary: true,
        isActive: true
      }),
      findLocationByTenantAndSlug: async (_tenantId, slug) =>
        slug === "west"
          ? {
              _id: "location-2",
              tenantId: "tenant-1",
              slug: "west",
              name: "West",
              timezone: "Asia/Manila",
              isPrimary: false,
              isActive: true
            }
          : {
              _id: "location-1",
              tenantId: "tenant-1",
              slug: "ayala",
              name: "Ayala",
              timezone: "Asia/Manila",
              isPrimary: true,
              isActive: true
            },
      findLocationById: async (locationId) =>
        locationId === "location-2"
          ? {
              _id: "location-2",
              tenantId: "tenant-1",
              slug: "west",
              name: "West",
              timezone: "Asia/Manila",
              isPrimary: false,
              isActive: true
            }
          : {
              _id: "location-1",
              tenantId: "tenant-1",
              slug: "ayala",
              name: "Ayala",
              timezone: "Asia/Manila",
              isPrimary: true,
              isActive: true
            }
    },
    "../repositories/publicBoardThemes": {
      getResolvedTheme: async () => ({
        scope: "location",
        theme: {
          presetId: "classic",
          heroTitle: "Demo board",
          heroSubtitle: "Ayala",
          logoUrl: "https://cdn.example.test/logo.png",
          backgroundImageUrl: "https://cdn.example.test/background.png",
          pageBackgroundColor: "#f8efe3",
          cardBackgroundColor: "#fffaf4",
          cardAlpha: 0.9,
          cardBorderSize: 1,
          cardBorderRadius: 28,
          cardBorderColor: "#eadccf",
          headerColor: "#24160f",
          subheaderColor: "#8a5c39",
          bodyColor: "#3f3027",
          buttonBackgroundColor: "#ea6a1f",
          buttonTextColor: "#ffffff",
          buttonBorderColor: "#ea6a1f"
        }
      })
    },
    "../repositories/vendorServices": {
      listServicesByTenantId: async () => [
        {
          _id: "service-1",
          tenantId: "tenant-1",
          name: "General consultation",
          slug: "general-consultation",
          description: "A bookable public service.",
          durationMinutes: 30,
          allowBookingQuantity: false,
          bookingQuantityLabel: "Units",
          manualPaymentRequired: true,
          priceAmountCents: 50000,
          currency: "PHP",
          priceDisplay: "PHP 500",
          isActive: true,
          sortOrder: 1,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          _id: "service-2",
          tenantId: "tenant-1",
          name: "Hidden service",
          slug: "hidden-service",
          description: "Inactive services are not public.",
          durationMinutes: 45,
          allowBookingQuantity: false,
          bookingQuantityLabel: "Units",
          manualPaymentRequired: false,
          priceAmountCents: 75000,
          currency: "PHP",
          priceDisplay: "PHP 750",
          isActive: false,
          sortOrder: 2,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]
    },
    "../repositories/tickets": {
      findTicketByLookupCode: async () => ticket,
      findTicketByTenantAndLookupCode: async () => ticket
    },
    "../services/queueEvents": {
      subscribe: () => () => {}
    },
    "../services/turnstileService": {
      verifyTurnstileToken: async () => ({ success: true })
    },
    "../services/queueJoinOtpService": {
      requestJoinOtp: async () => ({ otpId: "otp-1" }),
      resendJoinOtp: async () => ({ otpId: "otp-2" }),
      verifyJoinOtp: async () => ({})
    },
    "../services/queueJoinPaymentService": {
      handleDirectJoin: async () => ({}),
      handleVerifiedJoin: async () => ({}),
      syncQueueJoinPayment: async () => ({ synced: true, paid: false })
    },
    "../services/queueFeeService": {
      assertTenantCanAcceptCustomerJoins: async () => {},
      getQueueFeeForTenant: async () => ({ enabled: false, amountCents: 0, currency: "PHP", displayAmount: "PHP 0.00", planSlug: "economical" })
    },
    "../services/storeHoursService": {
      assertLocationOpenForCustomerJoin: async () => {},
      getOpenStatus: async () => ({ isOpen: true, timezone: "Asia/Manila", summary: "Open", today: null, nextOpenAt: null })
    },
    "../services/notificationService": {
      sendEmail: async () => {},
      sendSms: async () => {}
    },
    "../repositories/platform": {
      getPlatformSettings: async () => ({ enterpriseInquiryEmail: "ops@getprio.test" })
    },
    "../services/queueService": {
      getQueueSnapshot: async () => ({
        tenant: { name: "Demo Tenant", slug: "demo", isActive: true, queueFee: { enabled: false, amountCents: 0, currency: "PHP", displayAmount: "PHP 0.00", planSlug: "economical" } },
        location: { name: "Ayala", slug: "ayala", timezone: "Asia/Manila", openStatus: { isOpen: true }, hours: [] },
        publicBoardTheme: { scope: "location", theme: {} },
        queueDay: { isClosed: false, queueDateKey: "20260606", closedAt: null, reopenedAt: null, closureReason: null },
        stats: { waitingCount: 1, estimatedWaitMinutes: 5, servedToday: 0 },
        current: null,
        nextUp: [],
        history: [],
        usage: { periodStart: new Date(), periodEnd: null, emailsSentThisPeriod: 0 },
        focusTicket: null
      }),
      cancelTicket: cancelTicketMock
    }
  });
}

test("public vendor discovery returns approved public profile cards", async () => {
  const router = buildPublicRouter(null, async () => ({}));
  const { server, baseUrl } = await startServer(router, "/api/public");

  try {
    const response = await fetch(`${baseUrl}/vendors?search=clinic`);

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.vendors.length, 1);
    assert.deepEqual(Object.keys(body.vendors[0]).sort(), [
      "category",
      "description",
      "imageUrl",
      "location",
      "locations",
      "name",
      "publicBoardTheme",
      "services",
      "slug"
    ]);
    assert.equal(body.vendors[0].slug, "demo");
    assert.equal(body.vendors[0].location.city, "Cebu City");
    assert.equal(body.vendors[0].locations.length, 2);
    assert.equal(body.vendors[0].locations[1].slug, "west");
    assert.equal(body.vendors[0].locations[0].hours[0].opensAt, "08:00");
    assert.equal(body.vendors[0].services.length, 1);
    assert.equal(body.vendors[0].services[0].slug, "general-consultation");
    assert.equal(body.vendors[0].services[0].manualPaymentRequired, true);
    assert.equal(body.vendors[0].services[0].tenantId, undefined);
    assert.equal(body.vendors[0].publicBoardTheme.theme.logoUrl, "https://cdn.example.test/logo.png");
    assert.equal(body.vendors[0].contactEmail, undefined);
  } finally {
    await stopServer(server);
  }
});

test("public vendor discovery can match non-primary branch locations", async () => {
  const router = buildPublicRouter(null, async () => ({}));
  const { server, baseUrl } = await startServer(router, "/api/public");

  try {
    const response = await fetch(`${baseUrl}/vendors?search=mandaue`);

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.vendors.length, 1);
    assert.equal(body.vendors[0].locations[1].name, "West");
  } finally {
    await stopServer(server);
  }
});

test("public vendor profile returns 404 for unavailable vendors", async () => {
  const router = buildPublicRouter(null, async () => ({}));
  const { server, baseUrl } = await startServer(router, "/api/public");

  try {
    const response = await fetch(`${baseUrl}/vendors/private-vendor`);

    assert.equal(response.status, 404);
    const body = await response.json();
    assert.match(body.message, /vendor not found/i);
  } finally {
    await stopServer(server);
  }
});

test("public vendor profile includes the resolved public board theme", async () => {
  const router = buildPublicRouter(null, async () => ({}));
  const { server, baseUrl } = await startServer(router, "/api/public");

  try {
    const response = await fetch(`${baseUrl}/vendors/demo`);

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.vendor.publicBoardTheme.scope, "location");
    assert.equal(body.vendor.publicBoardTheme.theme.logoUrl, "https://cdn.example.test/logo.png");
    assert.equal(body.vendor.publicBoardTheme.theme.backgroundImageUrl, "https://cdn.example.test/background.png");
    assert.equal(body.vendor.services[0].slug, "general-consultation");
    assert.equal(body.vendor.services[0].manualPaymentRequired, true);
    assert.equal(body.vendor.locations[0].hours[0].closesAt, "17:00");
  } finally {
    await stopServer(server);
  }
});

test("public cancellation rejects requests without matching ownership proof", async () => {
  const router = buildPublicRouter(
    {
      _id: "ticket-1",
      tenantId: "tenant-1",
      userId: null,
      lookupCode: "ABC12345",
      customerEmail: "owner@example.com",
      customerPhone: "09998887777",
      status: "waiting"
    },
    async () => ({})
  );
  const { server, baseUrl } = await startServer(router, "/api/public");

  try {
    const response = await fetch(`${baseUrl}/tenant/demo/tickets/ABC12345`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });

    assert.equal(response.status, 403);
    const body = await response.json();
    assert.match(body.message, /could not verify/i);
  } finally {
    await stopServer(server);
  }
});

test("public cancellation allows guest owner with matching email", async () => {
  let cancelledLookupCode = null;
  const router = buildPublicRouter(
    {
      _id: "ticket-1",
      tenantId: "tenant-1",
      userId: null,
      lookupCode: "ABC12345",
      customerEmail: "owner@example.com",
      customerPhone: "09998887777",
      status: "waiting"
    },
    async (_tenant, lookupCode) => {
      cancelledLookupCode = lookupCode;
      return {
        ticket: { lookupCode, status: "cancelled" },
        snapshot: { queueDay: { isClosed: false } }
      };
    }
  );
  const { server, baseUrl } = await startServer(router, "/api/public");

  try {
    const response = await fetch(`${baseUrl}/tenant/demo/tickets/ABC12345`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerEmail: "owner@example.com" })
    });

    assert.equal(response.status, 200);
    assert.equal(cancelledLookupCode, "ABC12345");
    const body = await response.json();
    assert.equal(body.ticket.status, "cancelled");
  } finally {
    await stopServer(server);
  }
});

test("public cancellation allows authenticated customer owner without contact payload", async () => {
  let cancelled = false;
  const router = buildPublicRouter(
    {
      _id: "ticket-1",
      tenantId: "tenant-1",
      userId: "user-1",
      lookupCode: "ABC12345",
      customerEmail: "customer@example.com",
      customerPhone: "09171234567",
      status: "waiting"
    },
    async () => {
      cancelled = true;
      return {
        ticket: { lookupCode: "ABC12345", status: "cancelled" },
        snapshot: { queueDay: { isClosed: false } }
      };
    }
  );
  const { server, baseUrl } = await startServer(router, "/api/public");

  try {
    const response = await fetch(`${baseUrl}/tenant/demo/tickets/ABC12345`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "x-test-auth-mode": "customer"
      },
      body: JSON.stringify({})
    });

    assert.equal(response.status, 200);
    assert.equal(cancelled, true);
  } finally {
    await stopServer(server);
  }
});

test("public cancellation returns 409 for non-waiting tickets", async () => {
  const router = buildPublicRouter(
    {
      _id: "ticket-1",
      tenantId: "tenant-1",
      userId: null,
      lookupCode: "ABC12345",
      customerEmail: "owner@example.com",
      customerPhone: "09998887777",
      status: "served"
    },
    async () => {
      throw new Error("cancelTicket should not run");
    }
  );
  const { server, baseUrl } = await startServer(router, "/api/public");

  try {
    const response = await fetch(`${baseUrl}/tenant/demo/tickets/ABC12345`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerEmail: "owner@example.com" })
    });

    assert.equal(response.status, 409);
    const body = await response.json();
    assert.match(body.message, /only waiting tickets can be cancelled/i);
  } finally {
    await stopServer(server);
  }
});

test("public cancellation rejects a mismatched location URL for the ticket", async () => {
  let cancelCalled = false;
  const router = buildPublicRouter(
    {
      _id: "ticket-1",
      tenantId: "tenant-1",
      locationId: "location-2",
      userId: null,
      lookupCode: "ABC12345",
      customerEmail: "owner@example.com",
      customerPhone: "09998887777",
      status: "waiting"
    },
    async () => {
      cancelCalled = true;
      throw new Error("cancelTicket should not run");
    }
  );
  const { server, baseUrl } = await startServer(router, "/api/public");

  try {
    const response = await fetch(`${baseUrl}/tenant/demo/location/ayala/tickets/ABC12345`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerEmail: "owner@example.com" })
    });

    assert.equal(response.status, 404);
    assert.equal(cancelCalled, false);
    const body = await response.json();
    assert.match(body.message, /waiting ticket not found/i);
  } finally {
    await stopServer(server);
  }
});

test("public queue snapshots redact tenant and location contact details", async () => {
  require("tsx/cjs");
  const queueService = require("../src/services/queueService.js");
  const billingRepository = require("../src/repositories/billing");
  const notificationDeliveryRepository = require("../src/repositories/notificationDeliveries");
  const publicBoardThemeRepository = require("../src/repositories/publicBoardThemes");
  const queueDayClosureRepository = require("../src/repositories/queueDayClosures");
  const queueDayPauseRepository = require("../src/repositories/queueDayPauses");
  const storeLocationRepository = require("../src/repositories/storeLocations");
  const ticketRepository = require("../src/repositories/tickets");
  const queueFeeService = require("../src/services/queueFeeService");
  const storeHoursService = require("../src/services/storeHoursService");

  const originals = [
    [billingRepository, "getActiveSubscriptionByTenantId"],
    [notificationDeliveryRepository, "countSentTransactionalEmails"],
    [publicBoardThemeRepository, "getResolvedTheme"],
    [queueDayClosureRepository, "findActiveClosure"],
    [queueDayPauseRepository, "findActivePause"],
    [storeLocationRepository, "listHoursByLocationId"],
    [storeLocationRepository, "findPrimaryLocationByTenantId"],
    [ticketRepository, "findCurrentCalledTicket"],
    [ticketRepository, "listWaitingTickets"],
    [ticketRepository, "listSkippedTickets"],
    [ticketRepository, "listHistoryTickets"],
    [ticketRepository, "countServedToday"],
    [ticketRepository, "findTicketByTenantAndLookupCode"],
    [queueFeeService, "getQueueFeeForTenant"],
    [queueFeeService, "getActiveTenantSubscription"],
    [storeHoursService, "getOpenStatus"]
  ].map(([moduleExports, key]) => [moduleExports, key, moduleExports[key]]);

  try {
    billingRepository.getActiveSubscriptionByTenantId = async () => null;
    notificationDeliveryRepository.countSentTransactionalEmails = async () => 0;
    publicBoardThemeRepository.getResolvedTheme = async () => ({ scope: "tenant", theme: {} });
    queueDayClosureRepository.findActiveClosure = async () => null;
    queueDayPauseRepository.findActivePause = async () => null;
    storeLocationRepository.listHoursByLocationId = async () => [];
    storeLocationRepository.findPrimaryLocationByTenantId = async () => null;
    ticketRepository.findCurrentCalledTicket = async () => null;
    ticketRepository.listWaitingTickets = async () => [];
    ticketRepository.listSkippedTickets = async () => [];
    ticketRepository.listHistoryTickets = async () => [];
    ticketRepository.countServedToday = async () => 0;
    ticketRepository.findTicketByTenantAndLookupCode = async () => null;
    queueFeeService.getQueueFeeForTenant = async () => ({
      enabled: false,
      amountCents: 0,
      currency: "PHP",
      displayAmount: "PHP 0.00",
      planSlug: "economical"
    });
    queueFeeService.getActiveTenantSubscription = async () => null;
    storeHoursService.getOpenStatus = async () => ({
      isOpen: true,
      timezone: "Asia/Manila",
      summary: "Open",
      today: null,
      nextOpenAt: null
    });

    const snapshot = await queueService.getQueueSnapshot(
      {
        _id: "tenant-1",
        name: "Demo Tenant",
        slug: "demo",
        queuePrefix: "DMO",
        averageServiceMinutes: 5,
        notificationThreshold: 3,
        autoPauseEnabled: false,
        autoPauseThreshold: null,
        autoResumeEnabled: false,
        autoResumeVacancyPercent: null,
        contactEmail: "ops@demo.test",
        contactPhone: "09170000000"
      },
      {
        location: {
          _id: "location-2",
          tenantId: "tenant-1",
          name: "West",
          slug: "west",
          addressLine1: "123 Main",
          addressLine2: "",
          city: "Manila",
          province: "Metro Manila",
          postalCode: "1000",
          country: "PH",
          contactEmail: "west@demo.test",
          contactPhone: "09171112222",
          timezone: "Asia/Manila",
          isPrimary: false,
          isActive: true
        }
      }
    );

    assert.equal(snapshot.tenant.contactEmail, undefined);
    assert.equal(snapshot.tenant.contactPhone, undefined);
    assert.equal(snapshot.location.contactEmail, undefined);
    assert.equal(snapshot.location.contactPhone, undefined);
  } finally {
    for (const [moduleExports, key, originalValue] of originals) {
      moduleExports[key] = originalValue;
    }
  }
});

test("public queue snapshots use the ticket location for lookup-code requests", async () => {
  require("tsx/cjs");
  const queueService = require("../src/services/queueService.js");
  const billingRepository = require("../src/repositories/billing");
  const notificationDeliveryRepository = require("../src/repositories/notificationDeliveries");
  const publicBoardThemeRepository = require("../src/repositories/publicBoardThemes");
  const queueDayClosureRepository = require("../src/repositories/queueDayClosures");
  const queueDayPauseRepository = require("../src/repositories/queueDayPauses");
  const storeLocationRepository = require("../src/repositories/storeLocations");
  const ticketRepository = require("../src/repositories/tickets");
  const queueFeeService = require("../src/services/queueFeeService");
  const storeHoursService = require("../src/services/storeHoursService");

  const originals = [
    [billingRepository, "getActiveSubscriptionByTenantId"],
    [notificationDeliveryRepository, "countSentTransactionalEmails"],
    [publicBoardThemeRepository, "getResolvedTheme"],
    [queueDayClosureRepository, "findActiveClosure"],
    [queueDayPauseRepository, "findActivePause"],
    [storeLocationRepository, "listHoursByLocationId"],
    [storeLocationRepository, "findPrimaryLocationByTenantId"],
    [storeLocationRepository, "findLocationById"],
    [ticketRepository, "findCurrentCalledTicket"],
    [ticketRepository, "listWaitingTickets"],
    [ticketRepository, "listSkippedTickets"],
    [ticketRepository, "listHistoryTickets"],
    [ticketRepository, "countServedToday"],
    [ticketRepository, "findTicketByTenantAndLookupCode"],
    [queueFeeService, "getQueueFeeForTenant"],
    [queueFeeService, "getActiveTenantSubscription"],
    [storeHoursService, "getOpenStatus"]
  ].map(([moduleExports, key]) => [moduleExports, key, moduleExports[key]]);

  try {
    billingRepository.getActiveSubscriptionByTenantId = async () => null;
    notificationDeliveryRepository.countSentTransactionalEmails = async () => 0;
    publicBoardThemeRepository.getResolvedTheme = async () => ({ scope: "tenant", theme: {} });
    queueDayClosureRepository.findActiveClosure = async () => null;
    queueDayPauseRepository.findActivePause = async () => null;
    storeLocationRepository.listHoursByLocationId = async () => [];
    storeLocationRepository.findPrimaryLocationByTenantId = async () => ({
      _id: "location-1",
      tenantId: "tenant-1",
      name: "Ayala",
      slug: "ayala",
      timezone: "Asia/Manila",
      isPrimary: true,
      isActive: true
    });
    storeLocationRepository.findLocationById = async (locationId) =>
      locationId === "location-2"
        ? {
            _id: "location-2",
            tenantId: "tenant-1",
            name: "West",
            slug: "west",
            timezone: "Asia/Manila",
            isPrimary: false,
            isActive: true
          }
        : null;
    ticketRepository.findCurrentCalledTicket = async () => null;
    ticketRepository.listWaitingTickets = async (_tenantId, options = {}) =>
      options.locationId === "location-2"
        ? [
            {
              _id: "ticket-1",
              ticketNumber: "DMO-001",
              customerName: "Ticket Holder",
              status: "waiting",
              joinChannel: "online",
              carriedOverAt: null,
              carryOverCount: 0,
              createdAt: new Date("2026-06-19T01:00:00.000Z")
            }
          ]
        : [];
    ticketRepository.listSkippedTickets = async () => [];
    ticketRepository.listHistoryTickets = async () => [];
    ticketRepository.countServedToday = async () => 0;
    ticketRepository.findTicketByTenantAndLookupCode = async () => ({
      _id: "ticket-1",
      tenantId: "tenant-1",
      locationId: "location-2",
      ticketNumber: "DMO-001",
      customerName: "Ticket Holder",
      status: "waiting",
      dateKey: "20260619",
      lookupCode: "ABC12345",
      createdAt: new Date("2026-06-19T01:00:00.000Z")
    });
    queueFeeService.getQueueFeeForTenant = async () => ({
      enabled: false,
      amountCents: 0,
      currency: "PHP",
      displayAmount: "PHP 0.00",
      planSlug: "economical"
    });
    queueFeeService.getActiveTenantSubscription = async () => null;
    storeHoursService.getOpenStatus = async () => ({
      isOpen: true,
      timezone: "Asia/Manila",
      summary: "Open",
      today: null,
      nextOpenAt: null
    });

    const snapshot = await queueService.getQueueSnapshot(
      {
        _id: "tenant-1",
        name: "Demo Tenant",
        slug: "demo",
        queuePrefix: "DMO",
        averageServiceMinutes: 5,
        notificationThreshold: 3,
        autoPauseEnabled: false,
        autoPauseThreshold: null,
        autoResumeEnabled: false,
        autoResumeVacancyPercent: null
      },
      {
        location: {
          _id: "location-1",
          tenantId: "tenant-1",
          name: "Ayala",
          slug: "ayala",
          timezone: "Asia/Manila",
          isPrimary: true,
          isActive: true
        },
        lookupCode: "ABC12345"
      }
    );

    assert.equal(snapshot.location.slug, "west");
    assert.equal(snapshot.focusTicket.position, 1);
  } finally {
    for (const [moduleExports, key, originalValue] of originals) {
      moduleExports[key] = originalValue;
    }
  }
});
