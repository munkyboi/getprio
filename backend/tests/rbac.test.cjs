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
  assert.equal(permissions.userHasPermission(ownerUser, "tenant.settings.manage", { tenantId: "tenant-1" }), true);
  assert.equal(permissions.userHasPermission(ownerUser, "tenant.billing.manage", { tenantId: "tenant-1" }), true);
  assert.equal(permissions.userHasPermission(platformAdmin, "platform.users.read"), true);
  assert.equal(permissions.userHasPermission(platformAdmin, "platform.plans.manage"), true);
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
