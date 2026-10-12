const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const express = require("express");
const projection = require("../src/services/queueBoardProjection");

test("board HTTP reads and streams enforce grants; staff cannot publish or approve another location", async () => {
  let allowed = false;
  const boardId = "063b7899-ffbe-482c-9564-91a5a6c79be0";
  const board = { id: "1", tenant_id: "1", queue_board_id: boardId, tenant_slug: "vendor", slug: "main", name: "Main", queue_board_public: false };
  const snapshot = { tenant: { slug: "vendor" }, location: { slug: "main" },
    calledTickets: [{ id: "1", ticketNumber: "P001", serviceCounterId: "2", customerName: "Private" }],
    nextUp: [{ id: "2", ticketNumber: "P002", lookupCode: "SECRET" }] };
  const denied = () => { throw Object.assign(new Error("Denied"), { statusCode: 403 }); };
  const mocks = {
    express,
    "node:crypto": require("node:crypto"),
    "express-rate-limit": { rateLimit: () => (_req, _res, next) => next(), ipKeyGenerator: (ip) => ip },
    "../middleware/asyncHandler": (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next),
    "../middleware/auth": { authenticate: (req, _res, next) => { req.user = { _id: "1", role: req.headers["x-role"] || "staff" }; next(); }, userHasTenantAccess: () => true,
      assertTenantPermission: (user, _id, permission) => { if (permission === "tenant.settings.manage" && user.role !== "admin") denied(); } },
    "../services/permissions": { userHasPermission: (user) => user.role === "admin" },
    "../repositories/tenants": { findTenantBySlug: async () => ({ _id: "1", slug: "vendor" }) },
    "../repositories/storeLocations": { findLocationByTenantAndSlug: async () => ({ _id: "1" }) },
    "../repositories/tenantMembershipLocations": { userHasLocationAssignment: async (_user, _tenant, locationId) => locationId === "1" },
    "./vendorRouteHelpers": { getAuthorizedTenant: async () => ({ _id: "1" }), getLocationForTenant: async (_tenant, slug) => ({ _id: slug === "other" ? "2" : "1", tenantId: "1", name: "Main" }) },
    "../services/queueBoardAccess": { findBoard: async () => board, canRead: async () => allowed,
      requestPairing: async () => ({ code: "a".repeat(32), matchCode: "123456" }), settings: async () => ({ boardId }),
      grantExpiry: async () => new Date(Date.now() + 29 * 86400000),
      pairingForLocation: async () => ({ match_code: "123456" }), approve: async () => ({ id: "grant" }) },
    "../services/queueBoardProjection": projection,
    "../services/browserSessionService": { parseCookies: () => ({}) },
    "../services/queueService": { getQueueSnapshot: async () => snapshot },
    "../services/entitlementAdmissionService": { admit: async () => {}, resolvePublicCapabilities: async () => ({ queue: true }) },
    "../config/env": { appBaseUrl: "https://getprio.online", authCookieSecure: true },
    "../services/securityAuditService": { record: async () => {} }
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../src/routes/queueBoardRoutes.js"), "utf8"), {
    module, require: (name) => { if (!(name in mocks)) throw new Error(`Unexpected dependency ${name}`); return mocks[name]; },
    URL, setInterval, clearInterval
  });
  const app = express(); app.use(express.json());
  app.use("/board", module.exports.publicRouter); app.use("/vendor", module.exports.vendorRouter);
  app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ message: error.message }));
  const server = app.listen(0, "127.0.0.1"); await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/board/${boardId}/queue`)).status, 403);
    assert.equal((await fetch(`${base}/board/${boardId}/stream`)).status, 403);
    const rejectedOrigin = await fetch(`${base}/board/${boardId}/pairing`, { method: "POST", headers: { Origin: "https://attacker.example" } });
    assert.equal(rejectedOrigin.status, 403);
    const pairing = await fetch(`${base}/board/${boardId}/pairing`, { method: "POST", headers: { Origin: "https://getprio.online" } });
    assert.equal(pairing.status, 201); assert.match(pairing.headers.get("set-cookie"), /HttpOnly/); assert.match(pairing.headers.get("set-cookie"), /SameSite=Strict/); assert.match(pairing.headers.get("set-cookie"), /Secure/);
    assert.equal(pairing.headers.get("cache-control"), "no-store");
    assert.equal((await fetch(`${base}/vendor/vendor/queue-board?location=main`)).status, 403);
    assert.equal((await fetch(`${base}/vendor/vendor/queue-board/pairing/${"a".repeat(32)}?location=other`)).status, 403);
    const approval = await fetch(`${base}/vendor/vendor/queue-board/pairing/${"a".repeat(32)}/approve?location=main`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName: "TV" }) });
    assert.equal(approval.status, 200);
    allowed = true;
    const refreshed = await fetch(`${base}/board/${boardId}/access`);
    assert.match(refreshed.headers.get("set-cookie"), /Max-Age=25055\d\d/);
    const read = await fetch(`${base}/board/${boardId}/queue`);
    assert.equal(read.status, 200); assert.doesNotMatch(await read.text(), /Private|SECRET/);
    const controller = new AbortController();
    const stream = await fetch(`${base}/board/${boardId}/stream`, { signal: controller.signal });
    const reader = stream.body.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    assert.match(first, /P001/); assert.doesNotMatch(first, /Private|SECRET/);
    allowed = false;
    const revoked = new TextDecoder().decode((await reader.read()).value);
    assert.match(revoked, /access-revoked/); assert.doesNotMatch(revoked, /P001/);
    controller.abort();
    assert.equal((await fetch(`${base}/board/${boardId}/queue`)).status, 403);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
