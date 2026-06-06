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
  return requireWithMocks("../src/routes/publicRoutes.js", {
    "../middleware/auth": buildPublicAuthMock(),
    "../middleware/asyncHandler": buildAsyncHandlerMock(),
    "../repositories/tenants": {
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
      findLocationById: async () => ({
        _id: "location-1",
        tenantId: "tenant-1",
        slug: "ayala",
        name: "Ayala",
        timezone: "Asia/Manila",
        isPrimary: true,
        isActive: true
      })
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
