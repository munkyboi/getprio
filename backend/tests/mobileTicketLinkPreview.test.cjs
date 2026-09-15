const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const http = require("node:http");

function requireWithMocks(targetPath, mocks) {
  const resolvedTarget = require.resolve(targetPath);
  const originals = new Map();
  try {
    for (const [requestPath, mockExports] of Object.entries(mocks)) {
      const resolvedDependency = require.resolve(requestPath, { paths: [require("node:path").dirname(resolvedTarget)] });
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
    for (const [resolvedDependency, original] of originals.entries()) {
      if (original) require.cache[resolvedDependency] = original;
      else delete require.cache[resolvedDependency];
    }
  }
}

async function startPreviewServer(serviceResult, overrides = {}) {
  const serviceCalls = [];
  const router = requireWithMocks("../mobile/ticketLinkRoutes.js", {
    "../src/middleware/auth": {
      authenticate(req, _res, next) {
        req.user = { _id: "customer-1", roles: ["customer"] };
        next();
      }
    },
    "../src/middleware/asyncHandler": (handler) => (req, res, next) =>
      Promise.resolve(handler(req, res, next)).catch(next),
    "../src/services/mobileTicketLinkService": {
      async previewPrivateLink(input) {
        serviceCalls.push(input);
        if (overrides.serviceError) throw overrides.serviceError;
        return serviceResult;
      }
    },
    "../src/repositories/tenants": {
      async findTenantById(id) {
        assert.equal(id, "tenant-1");
        return overrides.tenant || { _id: "tenant-1", name: "Acme Clinic" };
      }
    },
    "../src/repositories/storeLocations": {
      async findLocationById(id) {
        assert.equal(id, "location-1");
        return overrides.location || { _id: "location-1", name: "Main Branch" };
      }
    }
  });
  const app = express();
  app.use(express.json());
  app.use("/api/v1/mobile", router);
  app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({
    code: error.code,
    message: error.message
  }));
  const server = await new Promise((resolve) => {
    const nextServer = app.listen(0, () => resolve(nextServer));
  });
  return { server, serviceCalls };
}

function requestPreview(server, host, body) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: "127.0.0.1",
      port: server.address().port,
      path: "/api/v1/mobile/ticket-links/preview",
      method: "POST",
      headers: {
        host,
        "content-type": "application/json",
        "content-length": Buffer.byteLength(JSON.stringify(body))
      }
    }, (response) => {
      let payload = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { payload += chunk; });
      response.on("end", () => resolve({
        status: response.statusCode,
        headers: response.headers,
        json: () => JSON.parse(payload)
      }));
    });
    request.on("error", reject);
    request.end(JSON.stringify(body));
  });
}

test("mobile ticket-link preview requires auth, resolves the environment and returns safe context", async () => {
  const { server, serviceCalls } = await startPreviewServer({
    link: { expiresAt: "2026-09-16T01:00:00.000Z" },
    ticket: {
      ticketNumber: "A-042",
      tenantId: "tenant-1",
      locationId: "location-1",
      status: "waiting",
      customerEmail: "private@example.com"
    }
  });
  try {
    const response = await requestPreview(server, "getprio.online", { token: "token-value" });
    assert.equal(response.status, 200);
    assert.deepEqual(response.json(), {
      ticket_number: "A-042",
      queue_name: "Acme Clinic",
      location_name: "Main Branch",
      status: "waiting",
      expires_at: "2026-09-16T01:00:00.000Z"
    });
    assert.equal(response.headers["cache-control"], "no-store");
    assert.deepEqual(serviceCalls, [{ token: "token-value", environment: "production" }]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("mobile ticket-link preview maps unavailable proofs to a generic response", async () => {
  const unavailable = Object.assign(new Error("internal reason"), { code: "INTERNAL_ONLY", statusCode: 409 });
  const { server } = await startPreviewServer(null, { serviceError: unavailable });
  try {
    const response = await requestPreview(server, "sandbox.getprio.online", { token: "expired-token" });
    assert.equal(response.status, 404);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.deepEqual(response.json(), {
      code: "TICKET_LINK_UNAVAILABLE",
      message: "This ticket link can’t be used. Please request a new link."
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
