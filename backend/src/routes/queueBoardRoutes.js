const express = require("express");
const crypto = require("node:crypto");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate, userHasTenantAccess, assertTenantPermission } = require("../middleware/auth");
const permissions = require("../services/permissions");
const tenants = require("../repositories/tenants");
const locations = require("../repositories/storeLocations");
const assignments = require("../repositories/tenantMembershipLocations");
const { getAuthorizedTenant, getLocationForTenant } = require("./vendorRouteHelpers");
const access = require("../services/queueBoardAccess");
const { boardSnapshot } = require("../services/queueBoardProjection");
const { parseCookies } = require("../services/browserSessionService");
const { getQueueSnapshot } = require("../services/queueService");
const entitlement = require("../services/entitlementAdmissionService");
const env = require("../config/env");
const audit = require("../services/securityAuditService");
const publicRouter = express.Router();
const vendorRouter = express.Router();
const pairingLimiter = rateLimit({ windowMs: 60000, limit: 10, standardHeaders: true, legacyHeaders: false, keyGenerator: (req) => ipKeyGenerator(req.ip) });
// Access polling is separate from snapshot/stream reads so multiple venue displays
// sharing one IP can renew their browser grants without exhausting read capacity.
const accessLimiter = rateLimit({ windowMs: 60000, limit: 900, standardHeaders: true, legacyHeaders: false, keyGenerator: (req) => ipKeyGenerator(req.ip) });
const readLimiter = rateLimit({ windowMs: 60000, limit: 90, standardHeaders: true, legacyHeaders: false, keyGenerator: (req) => ipKeyGenerator(req.ip) });
function cookieName(boardId) { return `${env.authCookieSecure ? "__Host-" : ""}prio_board_${boardId}`; }
function browserSecret(req, boardId) { return parseCookies(req.headers.cookie)[cookieName(boardId)] || ""; }
function noStore(_req, res, next) { res.set("Cache-Control", "no-store"); res.set("Referrer-Policy", "no-referrer"); next(); }
publicRouter.use(noStore);
vendorRouter.use(noStore, authenticate);
async function boardForRequest(req) {
  const board = await access.findBoard(req.params.boardId);
  const capabilities = await entitlement.resolvePublicCapabilities(String(board.tenant_id));
  if (!capabilities.queue) throw Object.assign(new Error("Queue board unavailable."), { statusCode: 404 });
  return board;
}
async function snapshotFor(board) {
  const tenant = await tenants.findTenantBySlug(board.tenant_slug);
  const location = await locations.findLocationByTenantAndSlug(String(board.tenant_id), board.slug);
  return boardSnapshot(await getQueueSnapshot(tenant, { location }));
}
publicRouter.get("/:boardId/access", accessLimiter, asyncHandler(async (req, res) => {
  const board = await boardForRequest(req);
  const allowed = await access.canRead(board, browserSecret(req, board.queue_board_id));
  if (allowed && !board.queue_board_public) {
    const secret = browserSecret(req, board.queue_board_id);
    const expiry = await access.grantExpiry(board, secret);
    if (expiry) res.cookie(cookieName(board.queue_board_id), secret, { httpOnly: true, secure: env.authCookieSecure,
      sameSite: "strict", path: "/", maxAge: Math.max(0, new Date(expiry).getTime() - Date.now()) });
  }
  res.json({ allowed, isPublic: board.queue_board_public, locationName: board.name });
}));
publicRouter.post("/:boardId/pairing", pairingLimiter, asyncHandler(async (req, res) => {
  // Pairing is anonymous but only our first-party origin may initialize its cookie.
  if (req.headers.origin !== new URL(env.appBaseUrl).origin) throw Object.assign(new Error("Pairing origin rejected."), { statusCode: 403 });
  const board = await boardForRequest(req);
  const existing = browserSecret(req, board.queue_board_id);
  const secret = /^[a-f0-9]{64}$/.test(existing) ? existing : crypto.randomBytes(32).toString("hex");
  const pairing = await access.requestPairing(board, secret);
  res.cookie(cookieName(board.queue_board_id), secret, { httpOnly: true, secure: env.authCookieSecure,
    sameSite: "strict", path: "/", maxAge: 30 * 86400000 });
  res.status(201).json({ ...pairing, locationName: board.name,
    approvalUrl: `${env.appBaseUrl.replace(/\/$/, "")}/dashboard/queue?boardPairing=${pairing.code}` });
}));
publicRouter.get("/:boardId/queue", readLimiter, asyncHandler(async (req, res) => {
  const board = await boardForRequest(req);
  if (!await access.canRead(board, browserSecret(req, board.queue_board_id))) return res.status(403).json({ message: "Display approval required." });
  const snapshot = await snapshotFor(board);
  const current = await boardForRequest(req);
  if (!await access.canRead(current, browserSecret(req, current.queue_board_id))) return res.status(403).json({ message: "Display approval required." });
  res.json(snapshot);
}));
publicRouter.get("/:boardId/stream", readLimiter, asyncHandler(async (req, res) => {
  let board = await boardForRequest(req);
  if (!await access.canRead(board, browserSecret(req, board.queue_board_id))) return res.status(403).json({ message: "Display approval required." });
  res.set({ "Content-Type": "text/event-stream", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  res.flushHeaders();
  let closed = false;
  let running = false;
  const send = async () => {
    if (running || closed) return;
    running = true;
    try {
      board = await boardForRequest(req);
      if (!await access.canRead(board, browserSecret(req, board.queue_board_id))) throw new Error("Access revoked");
      const snapshot = await snapshotFor(board);
      // Recheck after asynchronous snapshot reads before emitting any data.
      board = await boardForRequest(req);
      if (!await access.canRead(board, browserSecret(req, board.queue_board_id))) throw new Error("Access revoked");
      if (!closed) res.write(`data: ${JSON.stringify(snapshot)}\n\n`);
    } catch {
      if (!closed) { res.write("event: access-revoked\ndata: {}\n\n"); res.end(); }
      closed = true;
      clearInterval(timer);
    } finally { running = false; }
  };
  const timer = setInterval(() => { void send(); }, 2000);
  req.on("close", () => { closed = true; clearInterval(timer); });
  await send();
}));
async function vendorContext(req, management = false) {
  const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug, tenants, userHasTenantAccess);
  assertTenantPermission(req.user, tenant._id, management ? "tenant.settings.manage" : "tenant.queue.operate");
  const location = await getLocationForTenant(tenant, req.query.location);
  if (!location) throw Object.assign(new Error("Select a location."), { statusCode: 400 });
  if (!permissions.userHasPermission(req.user, "tenant.settings.manage", { tenantId: tenant._id })
    && !await assignments.userHasLocationAssignment(req.user._id, tenant._id, location._id)) {
    throw Object.assign(new Error("You are not assigned to this location."), { statusCode: 403 });
  }
  await entitlement.admit({ tenantId: tenant._id, featureKey: "queue" });
  return location;
}
vendorRouter.get("/:tenantSlug/queue-board", asyncHandler(async (req, res) => {
  const location = await vendorContext(req, true);
  res.json(await access.settings(location._id));
}));
vendorRouter.patch("/:tenantSlug/queue-board", asyncHandler(async (req, res) => {
  const location = await vendorContext(req, true);
  const value = await access.updateSettings(location._id, req.body.isPublic, req.body.rotate);
  await recordChange(req, location, "queue_board.settings.update", { isPublic: value.isPublic, rotated: req.body.rotate === true });
  res.json(value);
}));
vendorRouter.get("/:tenantSlug/queue-board/pairing/:code", pairingLimiter, asyncHandler(async (req, res) => {
  const location = await vendorContext(req);
  const request = await access.pairingForLocation(location._id, req.params.code);
  res.json({ locationName: location.name, matchCode: request.match_code, expiresAt: request.expires_at });
}));
vendorRouter.post("/:tenantSlug/queue-board/pairing/:code/approve", pairingLimiter, asyncHandler(async (req, res) => {
  const location = await vendorContext(req);
  const display = await access.approve(location._id, req.params.code, req.body.displayName, req.user._id);
  await recordChange(req, location, "queue_board.display.approve", { displayId: display.id });
  res.json(display);
}));
vendorRouter.post("/:tenantSlug/queue-board/displays/:id/:action", asyncHandler(async (req, res) => {
  const location = await vendorContext(req, true);
  if (!["revoke", "renew"].includes(req.params.action)) return res.sendStatus(404);
  await access.changeGrant(location._id, req.params.id, req.params.action === "renew");
  await recordChange(req, location, `queue_board.display.${req.params.action}`, { displayId: req.params.id });
  res.json(await access.settings(location._id));
}));
async function recordChange(req, location, action, metadata) {
  await audit.record({ actorId: req.user._id, actorRole: "vendor", tenantId: location.tenantId,
    sessionId: req.auth?.sessionId, action, resourceType: "queue_board", resourceId: String(location._id),
    outcome: "success", metadata });
}
module.exports = { publicRouter, vendorRouter };
