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

test("public booking slots endpoint returns customer-safe computed slots", async () => {
  const capturedRequests = [];
  const router = requireWithMocks("../src/routes/publicRoutes.js", {
    "../middleware/auth": { maybeAuthenticate: (_req, _res, next) => next() },
    "../middleware/asyncHandler": buildAsyncHandlerMock(),
    "../repositories/tenants": {},
    "../repositories/storeLocations": {},
    "../repositories/publicBoardThemes": {},
    "../repositories/vendorServices": {},
    "../repositories/tickets": {},
    "../repositories/platform": {},
    "../services/queueEvents": {},
    "../services/turnstileService": {},
    "../services/queueJoinOtpService": {},
    "../services/queueJoinPaymentService": {},
    "../services/queueFeeService": {},
    "../services/storeHoursService": {},
    "../services/notificationService": {},
    "../services/customerTicketAccess": {},
    "../services/queueService": {},
    "../services/bookingService": {
      listBookingSlots: async (request) => {
        capturedRequests.push(request);
        return [
          {
            startAt: "2026-07-06T01:00:00.000Z",
            endAt: "2026-07-06T02:00:00.000Z",
            remainingCapacity: 1,
            isAvailable: true
          }
        ];
      }
    }
  });

  const { server, baseUrl } = await startServer(router, "/api/public");

  try {
    const response = await fetch(`${baseUrl}/vendors/demo/locations/main/services/consultation/slots?date=2026-07-06&bookingQuantity=2`);
    assert.equal(response.status, 200);
    assert.deepEqual(capturedRequests, [
      {
        tenantSlug: "demo",
        locationSlug: "main",
        serviceSlug: "consultation",
        date: "2026-07-06",
        bookingQuantity: "2"
      }
    ]);
    assert.deepEqual(await response.json(), {
      slots: [
        {
          startAt: "2026-07-06T01:00:00.000Z",
          endAt: "2026-07-06T02:00:00.000Z",
          remainingCapacity: 1,
          isAvailable: true
        }
      ]
    });
  } finally {
    await stopServer(server);
  }
});
