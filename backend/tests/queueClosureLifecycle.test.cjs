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

function buildAuthMock() {
  function buildUser(req) {
    const tenantRole = req.headers["x-test-tenant-role"];

    return {
      _id: "user-1",
      roles: ["vendor"],
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
    assertTenantPermission(_user, _tenantId, _permission) {
      return;
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

test("vendor queue close and reopen routes return lifecycle snapshots", async () => {
  const queueServiceCalls = [];
  const vendorRouter = requireWithMocks("../src/routes/vendorRoutes.js", {
    "../middleware/auth": buildAuthMock(),
    "../middleware/asyncHandler": buildAsyncHandlerMock(),
    "../repositories/tenants": {
      findTenantBySlug: async () => ({ _id: "tenant-1", slug: "demo", name: "Demo Tenant" })
    },
    "../repositories/storeLocations": {
      findPrimaryLocationByTenantId: async () => ({ _id: "location-1", slug: "ayala", name: "Ayala" }),
      listHoursByLocationId: async () => []
    },
    "../repositories/publicBoardThemes": {
      getResolvedTheme: async () => ({ scope: "location", theme: {} }),
      saveTheme: async () => ({})
    },
    "../repositories/tickets": {
      listClientTickets: async () => [],
      listHistoryTickets: async () => []
    },
    "../repositories/serviceCounters": {
      findCounterByLocationAndSlug: async () => null
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
      getQueueSnapshot: async () => ({ queueDay: { isClosed: false } }),
      closeQueueDay: async (_tenant, options) => {
        queueServiceCalls.push({ fn: "closeQueueDay", options });
        return { queueDay: { isClosed: true, closureReason: options.reason || "" } };
      },
      reopenQueueDay: async (_tenant, options) => {
        queueServiceCalls.push({ fn: "reopenQueueDay", options });
        return { queueDay: { isClosed: false } };
      },
      callNextTicket: async () => ({ ticket: { _id: "ticket-1", ticketNumber: "P001", status: "called" }, snapshot: { queueDay: { isClosed: false } } }),
      updateCurrentTicketStatus: async () => ({ ticket: { _id: "ticket-1", ticketNumber: "P001", status: "served" }, snapshot: { queueDay: { isClosed: false } } })
    },
    pdfkit: function MockPdfDocument() {}
  });

  const { server, baseUrl } = await startServer(vendorRouter, "/api/vendor");

  try {
    const closeResponse = await fetch(`${baseUrl}/tenant/demo/queue/close`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-tenant-role": "staff"
      },
      body: JSON.stringify({ reason: "Closed for the day" })
    });
    assert.equal(closeResponse.status, 200);
    const closeBody = await closeResponse.json();
    assert.equal(closeBody.message, "Queue day closed.");
    assert.equal(closeBody.snapshot.queueDay.isClosed, true);
    assert.equal(queueServiceCalls[0].fn, "closeQueueDay");
    assert.equal(queueServiceCalls[0].options.reason, "Closed for the day");

    const reopenResponse = await fetch(`${baseUrl}/tenant/demo/queue/reopen`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-tenant-role": "staff"
      },
      body: JSON.stringify({})
    });
    assert.equal(reopenResponse.status, 200);
    const reopenBody = await reopenResponse.json();
    assert.equal(reopenBody.message, "Queue day reopened.");
    assert.equal(reopenBody.snapshot.queueDay.isClosed, false);
    assert.equal(queueServiceCalls[1].fn, "reopenQueueDay");
  } finally {
    await stopServer(server);
  }
});

test("vendor call-next returns 409 when queue day is closed", async () => {
  const vendorRouter = requireWithMocks("../src/routes/vendorRoutes.js", {
    "../middleware/auth": buildAuthMock(),
    "../middleware/asyncHandler": buildAsyncHandlerMock(),
    "../repositories/tenants": {
      findTenantBySlug: async () => ({ _id: "tenant-1", slug: "demo", name: "Demo Tenant" })
    },
    "../repositories/storeLocations": {
      findPrimaryLocationByTenantId: async () => ({ _id: "location-1", slug: "ayala", name: "Ayala" }),
      listHoursByLocationId: async () => []
    },
    "../repositories/publicBoardThemes": {
      getResolvedTheme: async () => ({ scope: "location", theme: {} }),
      saveTheme: async () => ({})
    },
    "../repositories/tickets": {
      listClientTickets: async () => [],
      listHistoryTickets: async () => []
    },
    "../repositories/serviceCounters": {
      findCounterByLocationAndSlug: async () => null
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
      getQueueSnapshot: async () => ({ queueDay: { isClosed: true } }),
      closeQueueDay: async () => ({ queueDay: { isClosed: true } }),
      reopenQueueDay: async () => ({ queueDay: { isClosed: false } }),
      callNextTicket: async () => {
        const error = new Error("This queue day is closed. Reopen the queue to continue operations.");
        error.statusCode = 409;
        error.code = "QUEUE_DAY_CLOSED";
        throw error;
      },
      updateCurrentTicketStatus: async () => ({ ticket: { _id: "ticket-1", ticketNumber: "P001", status: "served" }, snapshot: { queueDay: { isClosed: false } } })
    },
    pdfkit: function MockPdfDocument() {}
  });

  const { server, baseUrl } = await startServer(vendorRouter, "/api/vendor");

  try {
    const response = await fetch(`${baseUrl}/tenant/demo/queue/call-next`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-tenant-role": "staff"
      },
      body: JSON.stringify({})
    });
    assert.equal(response.status, 409);
    const body = await response.json();
    assert.match(body.message, /queue day is closed/i);
  } finally {
    await stopServer(server);
  }
});

test("vendor call-next returns 400 when a ticket is already active", async () => {
  const vendorRouter = requireWithMocks("../src/routes/vendorRoutes.js", {
    "../middleware/auth": buildAuthMock(),
    "../middleware/asyncHandler": buildAsyncHandlerMock(),
    "../repositories/tenants": {
      findTenantBySlug: async () => ({ _id: "tenant-1", slug: "demo", name: "Demo Tenant" })
    },
    "../repositories/storeLocations": {
      findPrimaryLocationByTenantId: async () => ({ _id: "location-1", slug: "ayala", name: "Ayala" }),
      listHoursByLocationId: async () => []
    },
    "../repositories/publicBoardThemes": {
      getResolvedTheme: async () => ({ scope: "location", theme: {} }),
      saveTheme: async () => ({})
    },
    "../repositories/tickets": {
      listClientTickets: async () => [],
      listHistoryTickets: async () => []
    },
    "../repositories/serviceCounters": {
      findCounterByLocationAndSlug: async () => null
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
      getQueueSnapshot: async () => ({ queueDay: { isClosed: false } }),
      closeQueueDay: async () => ({ queueDay: { isClosed: true } }),
      reopenQueueDay: async () => ({ queueDay: { isClosed: false } }),
      callNextTicket: async () => {
        const error = new Error("Serve or skip the current ticket before calling the next one.");
        error.statusCode = 400;
        throw error;
      },
      updateCurrentTicketStatus: async () => ({ ticket: { _id: "ticket-1", ticketNumber: "P001", status: "served" }, snapshot: { queueDay: { isClosed: false } } })
    },
    pdfkit: function MockPdfDocument() {}
  });

  const { server, baseUrl } = await startServer(vendorRouter, "/api/vendor");

  try {
    const response = await fetch(`${baseUrl}/tenant/demo/queue/call-next`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-tenant-role": "staff"
      },
      body: JSON.stringify({})
    });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.match(body.message, /serve or skip the current ticket/i);
  } finally {
    await stopServer(server);
  }
});

test("vendor call-next returns an empty-queue snapshot when there are no waiting tickets", async () => {
  const vendorRouter = requireWithMocks("../src/routes/vendorRoutes.js", {
    "../middleware/auth": buildAuthMock(),
    "../middleware/asyncHandler": buildAsyncHandlerMock(),
    "../repositories/tenants": {
      findTenantBySlug: async () => ({ _id: "tenant-1", slug: "demo", name: "Demo Tenant" })
    },
    "../repositories/storeLocations": {
      findPrimaryLocationByTenantId: async () => ({ _id: "location-1", slug: "ayala", name: "Ayala" }),
      listHoursByLocationId: async () => []
    },
    "../repositories/publicBoardThemes": {
      getResolvedTheme: async () => ({ scope: "location", theme: {} }),
      saveTheme: async () => ({})
    },
    "../repositories/tickets": {
      listClientTickets: async () => [],
      listHistoryTickets: async () => []
    },
    "../repositories/serviceCounters": {
      findCounterByLocationAndSlug: async () => null
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
      getQueueSnapshot: async () => ({ queueDay: { isClosed: false }, nextUp: [] }),
      closeQueueDay: async () => ({ queueDay: { isClosed: true } }),
      reopenQueueDay: async () => ({ queueDay: { isClosed: false } }),
      callNextTicket: async () => null,
      updateCurrentTicketStatus: async () => ({ ticket: { _id: "ticket-1", ticketNumber: "P001", status: "served" }, snapshot: { queueDay: { isClosed: false } } })
    },
    pdfkit: function MockPdfDocument() {}
  });

  const { server, baseUrl } = await startServer(vendorRouter, "/api/vendor");

  try {
    const response = await fetch(`${baseUrl}/tenant/demo/queue/call-next`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-tenant-role": "staff"
      },
      body: JSON.stringify({})
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.message, "No waiting tickets in the queue.");
  } finally {
    await stopServer(server);
  }
});

test("vendor queue close and reopen surface duplicate-state conflicts", async () => {
  const queueServiceCalls = [];
  const vendorRouter = requireWithMocks("../src/routes/vendorRoutes.js", {
    "../middleware/auth": buildAuthMock(),
    "../middleware/asyncHandler": buildAsyncHandlerMock(),
    "../repositories/tenants": {
      findTenantBySlug: async () => ({ _id: "tenant-1", slug: "demo", name: "Demo Tenant" })
    },
    "../repositories/storeLocations": {
      findPrimaryLocationByTenantId: async () => ({ _id: "location-1", slug: "ayala", name: "Ayala" }),
      listHoursByLocationId: async () => []
    },
    "../repositories/publicBoardThemes": {
      getResolvedTheme: async () => ({ scope: "location", theme: {} }),
      saveTheme: async () => ({})
    },
    "../repositories/tickets": {
      listClientTickets: async () => [],
      listHistoryTickets: async () => []
    },
    "../repositories/serviceCounters": {
      findCounterByLocationAndSlug: async () => null
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
      getQueueSnapshot: async () => ({ queueDay: { isClosed: false } }),
      closeQueueDay: async () => {
        queueServiceCalls.push("close");
        const error = new Error("This queue day is already closed.");
        error.statusCode = 409;
        throw error;
      },
      reopenQueueDay: async () => {
        queueServiceCalls.push("reopen");
        const error = new Error("There is no closed queue day to reopen.");
        error.statusCode = 404;
        throw error;
      },
      callNextTicket: async () => ({ ticket: { _id: "ticket-1", ticketNumber: "P001", status: "called" }, snapshot: { queueDay: { isClosed: false } } }),
      updateCurrentTicketStatus: async () => ({ ticket: { _id: "ticket-1", ticketNumber: "P001", status: "served" }, snapshot: { queueDay: { isClosed: false } } })
    },
    pdfkit: function MockPdfDocument() {}
  });

  const { server, baseUrl } = await startServer(vendorRouter, "/api/vendor");

  try {
    const closeResponse = await fetch(`${baseUrl}/tenant/demo/queue/close`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-tenant-role": "staff"
      },
      body: JSON.stringify({})
    });
    assert.equal(closeResponse.status, 409);
    const closeBody = await closeResponse.json();
    assert.match(closeBody.message, /already closed/i);

    const reopenResponse = await fetch(`${baseUrl}/tenant/demo/queue/reopen`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-tenant-role": "staff"
      },
      body: JSON.stringify({})
    });
    assert.equal(reopenResponse.status, 404);
    const reopenBody = await reopenResponse.json();
    assert.match(reopenBody.message, /no closed queue day to reopen/i);
    assert.deepEqual(queueServiceCalls, ["close", "reopen"]);
  } finally {
    await stopServer(server);
  }
});

test("public join returns 409 when queue day is closed", async () => {
  const publicRouter = requireWithMocks("../src/routes/publicRoutes.js", {
    "../middleware/auth": buildAuthMock(),
    "../middleware/asyncHandler": buildAsyncHandlerMock(),
    "../repositories/tenants": {
      findTenantBySlug: async () => ({
        _id: "tenant-1",
        slug: "demo",
        name: "Demo Tenant",
        queuePrefix: "P",
        averageServiceMinutes: 5,
        notificationThreshold: 3,
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
      findLocationById: async () => ({
        _id: "location-1",
        tenantId: "tenant-1",
        slug: "ayala",
        name: "Ayala",
        timezone: "Asia/Manila",
        isPrimary: true,
        isActive: true
      }),
      listHoursByLocationId: async () => []
    },
    "../repositories/tickets": {
      findTicketByLookupCode: async () => null
    },
    "../services/queueEvents": {
      publish: () => {}
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
      handleDirectJoin: async () => {
        const error = new Error("This queue day is closed. Reopen the queue to continue operations.");
        error.statusCode = 409;
        error.code = "QUEUE_DAY_CLOSED";
        throw error;
      },
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
        queueDay: { isClosed: true, queueDateKey: "20260606", closedAt: new Date(), reopenedAt: null, closureReason: "Closed for the day" },
        stats: { waitingCount: 0, estimatedWaitMinutes: 0, servedToday: 0 },
        current: null,
        nextUp: [],
        history: [],
        usage: { periodStart: new Date(), periodEnd: null, emailsSentThisPeriod: 0 },
        focusTicket: null
      }),
      cancelTicket: async () => ({})
    }
  });

  const { server, baseUrl } = await startServer(publicRouter, "/api/public");

  try {
    const response = await fetch(`${baseUrl}/tenant/demo/join`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        customerName: "Customer",
        customerEmail: "customer@example.com",
        notifyByEmail: true,
        notifyBySms: false,
        notes: "",
        joinChannel: "online"
      })
    });
    assert.equal(response.status, 409);
    const body = await response.json();
    assert.match(body.message, /queue day is closed/i);
  } finally {
    await stopServer(server);
  }
});
