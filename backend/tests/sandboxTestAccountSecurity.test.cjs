const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  assertRequestAllowed,
  isSupportedSandboxRoute
} = require("../src/services/sandboxTestAccountAccess");

const sandboxUser = {
  isSandboxTestAccount: true,
  sandboxTestAccountExpiresAt: new Date(Date.now() + 60_000)
};

test("Sandbox test accounts are limited to Sandbox mobile and auth routes", () => {
  assert.doesNotThrow(() => assertRequestAllowed(sandboxUser, {
    hostname: "sandbox-api.getprio.online",
    headers: { "x-getprio-ingress-host": "sandbox-api.getprio.online" },
    originalUrl: "/api/v1/mobile/tickets"
  }));
  assert.doesNotThrow(() => assertRequestAllowed(sandboxUser, {
    hostname: "sandbox-api.getprio.online",
    headers: { "x-getprio-ingress-host": "sandbox-api.getprio.online" },
    originalUrl: "/api/auth/me"
  }));
  assert.throws(() => assertRequestAllowed(sandboxUser, {
    hostname: "sandbox-api.getprio.online",
    headers: { "x-getprio-ingress-host": "sandbox-api.getprio.online" },
    originalUrl: "/api/account/bookings"
  }), (error) => error.code === "SANDBOX_TEST_ACCOUNT_ROUTE_NOT_ALLOWED" && error.statusCode === 403);
  assert.throws(() => assertRequestAllowed(sandboxUser, {
    hostname: "sandbox-api.getprio.online",
    headers: { "x-getprio-ingress-host": "api.getprio.online" },
    originalUrl: "/api/v1/mobile/tickets"
  }), (error) => error.code === "SANDBOX_TEST_ACCOUNT_ONLY" && error.statusCode === 401);
  assert.throws(() => assertRequestAllowed(sandboxUser, {
    hostname: "sandbox-api.getprio.online",
    originalUrl: "/api/v1/mobile/tickets"
  }), (error) => error.code === "SANDBOX_TEST_ACCOUNT_ONLY" && error.statusCode === 401);
  assert.throws(() => assertRequestAllowed({ ...sandboxUser, sandboxTestAccountExpiresAt: null }, {
    hostname: "sandbox-api.getprio.online",
    headers: { "x-getprio-ingress-host": "sandbox-api.getprio.online" },
    originalUrl: "/api/v1/mobile/tickets"
  }), (error) => error.code === "SANDBOX_TEST_ACCOUNT_EXPIRED" && error.statusCode === 401);
  assert.equal(isSupportedSandboxRoute({ originalUrl: "/api/v1/mobile/push/registrations/device-1" }), true);
});

test("Sandbox reset and push delivery contain the review fixes", () => {
  const repository = fs.readFileSync(path.join(__dirname, "../src/repositories/developerTestAccounts.js"), "utf8");
  const projects = fs.readFileSync(path.join(__dirname, "../src/repositories/developerProjects.js"), "utf8");
  const delivery = fs.readFileSync(path.join(__dirname, "../mobile/mobilePushOutboxDeliveryRepository.js"), "utf8");
  const directDelivery = fs.readFileSync(path.join(__dirname, "../mobile/pushRegistrationRepository.js"), "utf8");
  const ticketLinks = fs.readFileSync(path.join(__dirname, "../mobile/ticketLinkRoutes.js"), "utf8");
  const developerTickets = fs.readFileSync(path.join(__dirname, "../src/repositories/tickets.js"), "utf8");
  const routes = fs.readFileSync(path.join(__dirname, "../src/routes/developerProjectRoutes.js"), "utf8");
  const portal = fs.readFileSync(path.join(__dirname, "../../developer-portal/src/DeveloperWorkspace.tsx"), "utf8");
  const portalStyles = fs.readFileSync(path.join(__dirname, "../../developer-portal/src/DeveloperWorkspace.css"), "utf8");
  const authRoutes = fs.readFileSync(path.join(__dirname, "../src/routes/authRoutes.js"), "utf8");
  assert.match(repository, /mfa_enabled = FALSE, email_mfa_enabled = FALSE, mfa_required = FALSE/);
  assert.match(repository, /DELETE FROM auth_mfa_challenges/);
  assert.match(repository, /failed_login_count = 0/);
  assert.match(repository, /account_locked_until = NULL/);
  assert.ok(authRoutes.indexOf("const passwordMatches") < authRoutes.indexOf("assertSandboxTestAccountRequest(user, req)"));
  assert.match(ticketLinks, /sandbox-api\.getprio\.online/);
  assert.match(developerTickets, /linkDeveloperTicketsForUser/);
  assert.match(developerTickets, /listDeveloperTicketsForUser/);
  assert.match(projects, /status = 'revoked'/);
  assert.match(projects, /developer_project_archived/);
  assert.match(delivery, /sandbox_test_account_expires_at <= NOW\(\)/);
  assert.match(delivery, /test_project\.status IS DISTINCT FROM 'active'/);
  assert.match(directDelivery, /account_user\.sandbox_test_account_expires_at <= NOW\(\)/);
  assert.match(directDelivery, /test_project\.status IS DISTINCT FROM 'active'/);
  assert.match(delivery, /status = 'stale'/);
  assert.match(routes, /const passwordHash = await bcrypt\.hash\(password, 10\);/);
  assert.doesNotMatch(routes, /bcrypt\.hashSync\(password, 10\)/);
  assert.match(portal, /disabled=\{provisioningBusy\}/);
  assert.match(portal, /recipient email/);
  assert.match(portalStyles, /@media \(min-width: 48em\)/);
  assert.match(portalStyles, /data-api-theme="light"\] \.developer-workspace-test-account/);
});
