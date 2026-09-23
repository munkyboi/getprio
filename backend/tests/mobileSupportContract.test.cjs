const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const http = require("node:http");

const repositoryRoot = path.resolve(__dirname, "../..");

function requireWithMocks(targetPath, mocks) {
  const resolvedTarget = require.resolve(targetPath);
  const originals = new Map();
  try {
    for (const [requestPath, mockExports] of Object.entries(mocks)) {
      const resolvedDependency = require.resolve(requestPath, { paths: [path.dirname(resolvedTarget)] });
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

test("mobile migration installs QR ids, native push registrations, and one-time OAuth codes", () => {
  const migration = fs.readFileSync(
    path.join(repositoryRoot, "database/migrations/20260830_01_add_mobile_queue_support.sql"),
    "utf8"
  );
  assert.match(migration, /ADD COLUMN IF NOT EXISTS queue_join_id UUID/);
  assert.match(migration, /store_locations_queue_join_id_idx/);
  assert.match(migration, /ALTER COLUMN otp_id DROP NOT NULL/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS mobile_push_registrations/);
  assert.match(migration, /UNIQUE \(user_id, installation_id\)/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS mobile_oauth_codes/);
  assert.match(migration, /code_challenge TEXT NOT NULL/);
});

test("mobile push registration routes bind writes and deactivation to the bearer user", async () => {
  const writes = [];
  const router = requireWithMocks("../mobile/pushRoutes.js", {
    "../src/middleware/auth": {
      authenticate(req, _res, next) {
        req.user = { _id: "customer-7", roles: ["customer"] };
        next();
      }
    },
    "../src/middleware/asyncHandler": (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next),
    "./pushRegistrationRepository": {
      async upsert(input) {
        writes.push({ type: "upsert", input });
        return { id: "registration-1", userId: input.userId, installationId: input.installationId };
      },
      async deactivateForUser(userId, installationId) {
        writes.push({ type: "deactivate", userId, installationId });
        return { id: "registration-1" };
      }
    }
  });
  const app = express();
  app.use(express.json());
  app.use("/api/mobile/push", router);
  app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ message: error.message }));
  const server = await new Promise((resolve) => {
    const nextServer = app.listen(0, () => resolve(nextServer));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/mobile/push`;
  try {
    const registered = await fetch(`${baseUrl}/registrations/install-1`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "fcm-token", platform: "ios", appVersion: "1.0.0", locale: "en-PH" })
    });
    assert.equal(registered.status, 200);
    const deactivated = await fetch(`${baseUrl}/registrations/install-1`, { method: "DELETE" });
    assert.equal(deactivated.status, 200);
    assert.deepEqual(writes, [
      {
        type: "upsert",
        input: {
          userId: "customer-7",
          installationId: "install-1",
          token: "fcm-token",
          platform: "ios",
          appVersion: "1.0.0",
          locale: "en-PH"
        }
      },
      { type: "deactivate", userId: "customer-7", installationId: "install-1" }
    ]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("mobile push delivery retains tokens without exposing them in mapped responses", async () => {
  const row = {
    id: 1,
    user_id: 30,
    installation_id: "install-1",
    token: "fcm-token",
    platform: "ios",
    app_version: "1.0.0",
    locale: "en-PH",
    is_active: true,
    created_at: "2026-09-03T08:34:47.000Z",
    updated_at: "2026-09-03T08:34:47.000Z"
  };
  const repository = requireWithMocks("../mobile/pushRegistrationRepository.js", {
    "../src/config/db": {
      pool: {
        query: async () => ({ rows: [row] })
      }
    }
  });

  const registrations = await repository.listActiveByUserId(30);

  assert.equal(registrations[0].token, "fcm-token");
  assert.equal(repository.mapRegistration(row).token, undefined);
});

test("mobile route wiring keeps OAuth and queue contracts under the mobile namespace", () => {
  const app = fs.readFileSync(path.join(repositoryRoot, "backend/src/app.ts"), "utf8");
  const oauth = fs.readFileSync(path.join(repositoryRoot, "backend/mobile/oauthRoutes.js"), "utf8");
  const sandboxAuth = fs.readFileSync(path.join(repositoryRoot, "backend/mobile/sandboxAuthRoutes.js"), "utf8");
  const push = fs.readFileSync(path.join(repositoryRoot, "backend/mobile/pushRoutes.js"), "utf8");
  const queue = fs.readFileSync(path.join(repositoryRoot, "backend/mobile/queueJoinRoutes.js"), "utf8");
  assert.match(app, /app\.use\("\/api\/mobile\/auth", mobileOAuthRoutes\)/);
  assert.match(app, /app\.use\("\/api\/mobile\/auth", mobileSandboxAuthRoutes\)/);
  assert.match(app, /app\.use\("\/api\/mobile\/push", mobilePushRoutes\)/);
  assert.match(app, /app\.use\("\/api\/v1\/mobile\/auth", mobileOAuthRoutes\)/);
  assert.match(app, /app\.use\("\/api\/v1\/mobile\/auth", mobileSandboxAuthRoutes\)/);
  assert.match(app, /app\.use\("\/api\/v1\/mobile\/push", mobilePushRoutes\)/);
  assert.match(app, /app\.use\("\/api\/v1\/mobile", mobileQueueJoinRoutes\)/);
  assert.match(app, /app\.use\("\/api\/v1\/auth", authRoutes\)/);
  assert.match(app, /app\.use\("\/api\/v1\/account", accountRoutes\)/);
  assert.match(app, /app\.use\("\/api\/v1\/public", publicRoutes\)/);
  assert.ok(app.indexOf('app.use("/api/mobile/auth", mobileOAuthRoutes)') < app.indexOf('app.use("/api/mobile", mobileQueueJoinRoutes)'));
  assert.ok(app.indexOf('app.use("/api/v1/mobile/auth", mobileOAuthRoutes)') < app.indexOf('app.use("/api/v1/mobile", mobileQueueJoinRoutes)'));
  assert.match(sandboxAuth, /router\.post\(\s*"\/login"/);
  assert.match(sandboxAuth, /SANDBOX_HOSTS/);
  assert.match(oauth, /codeChallenge/);
  assert.match(oauth, /codeRepository\.consume/);
  assert.match(oauth, /router\.post\(\s*"\/oauth\/apple"/);
  assert.match(oauth, /exchangeAppleCredential/);
  assert.match(oauth, /mfaFlowService\.issueLoginChallenge/);
  assert.match(oauth, /router\.use\(mobileOAuthLimiter\)/);
  assert.match(oauth, /req\.baseUrl/);
  assert.match(oauth, /exchangeCodeForProfile\(\{ provider, code, redirectUri, requestBody: req\.body \}\)/);
  assert.match(oauth, /const redirectUri =/);
  assert.match(push, /router\.use\(mobilePushLimiter\)/);
  assert.match(queue, /router\.use\(mobileQueueLimiter\)/);
  assert.match(queue, /requireIdempotency\("mobile\.queue_join"\)/);
  assert.match(queue, /\/queue-join\/direct/);
  assert.match(queue, /requireIdempotency\("mobile\.queue_join_direct"\)/);
  assert.match(queue, /userId: req\.user\._id/);
  assert.doesNotMatch(queue, /customerName: req\.body/);
});

test("mobile paid joins configure the PayMongo return target for the app", () => {
  const queue = fs.readFileSync(path.join(repositoryRoot, "backend/mobile/queueJoinRoutes.js"), "utf8");
  assert.match(queue, /mobileReturnUrl/);
  assert.match(queue, /\/payment\/return/);
});

test("authenticated mobile tickets expose only owned, environment-scoped queue resources", async () => {
  const tickets = [
    {
      _id: "101", tenantId: "tenant-1", locationId: "location-1", userId: "customer-7",
      ticketNumber: "PRI-101", status: "waiting", statusReason: null, dateKey: "20260916",
      developerProjectId: null, developerEnvironment: null, externalReference: null,
      createdAt: "2026-09-16T00:00:00.000Z", updatedAt: "2026-09-16T00:01:00.000Z"
    },
    {
      _id: "102", tenantId: "tenant-2", locationId: "location-2", userId: "customer-7",
      ticketNumber: "SBX-102", status: "called", statusReason: null, dateKey: "20260916",
      developerProjectId: "project-2", developerEnvironment: "sandbox", externalReference: "ext-102",
      serviceCounterId: "counter-2", createdAt: "2026-09-15T00:00:00.000Z", updatedAt: "2026-09-15T00:01:00.000Z"
    }
  ];
  const router = requireWithMocks("../mobile/ticketRoutes.js", {
    "../src/middleware/auth": {
      authenticate(req, _res, next) { req.user = { _id: "customer-7" }; next(); }
    },
    "../src/middleware/asyncHandler": (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next),
    "../src/repositories/tickets": {
      async listMobileTicketsForUser(_userId, options) {
        return { tickets: options.environment === "sandbox" ? [tickets[1]] : tickets, nextCursor: null };
      },
      async findMobileTicketForUser(id) { return tickets.find((ticket) => ticket._id === String(id)) || null; },
      async listWaitingTickets() { return [tickets[0]]; }
    },
    "../src/repositories/developerQueues": {
      async listMobileInvitationsForUser() { return []; },
      async acceptMobileInvitation() { return null; }
    },
    "../src/repositories/tenants": { async findTenantById(id) { return { _id: id, name: `Queue ${id}`, publicProfileDisplayName: `Public ${id}` }; } },
    "../src/repositories/storeLocations": { async findLocationById(id) { return { _id: id, name: `Location ${id}`, slug: `location-${id}` }; } },
    "../src/repositories/serviceCounters": { async findCounterById(id) { return { _id: id, locationId: "location-2", name: "Counter 2" }; } }
  });
  const app = express();
  app.set("trust proxy", true);
  app.use(express.json());
  app.use("/api/v1/mobile", router);
  app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ message: error.message }));
  const server = await new Promise((resolve) => { const nextServer = app.listen(0, () => resolve(nextServer)); });
  try {
    const production = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/mobile/tickets?view=active`);
    assert.equal(production.status, 200);
    const productionBody = await production.json();
    assert.equal(productionBody.tickets.length, 2);
    assert.equal(productionBody.tickets[0].source, "first_party");
    assert.equal(productionBody.tickets[0].queue_position.people_ahead, 0);
    assert.equal(productionBody.tickets[1].called_counter.name, "Counter 2");
    assert.equal(production.headers.get("cache-control"), "no-store");

    const sandbox = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/mobile/tickets`, { headers: { "x-forwarded-host": "sandbox.getprio.online" } });
    assert.equal(sandbox.status, 200);
    assert.equal((await sandbox.json()).tickets[0].source, "developer_api");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("mobile Sandbox tickets include independent Developer API records linked by recipient email", async () => {
  const developerTicket = {
    _id: "11111111-1111-4111-8111-111111111111",
    isDeveloperApiTicket: true,
    ticketNumber: "MAIN-0001",
    displayLabel: "A-001",
    status: "waiting",
    statusReason: null,
    developerProjectId: "project-1",
    developerEnvironment: "sandbox",
    queueName: "Main queue",
    profileName: "My EMR",
    externalReference: "visit-1",
    verificationCode: "AB12CD34",
    createdAt: "2026-09-16T00:00:00.000Z",
    updatedAt: "2026-09-16T00:00:00.000Z"
  };
  const calls = [];
  const router = requireWithMocks("../mobile/ticketRoutes.js", {
    "../src/middleware/auth": {
      authenticate(req, _res, next) { req.user = { _id: "customer-7", email: "sandbox@example.com" }; next(); }
    },
    "../src/middleware/asyncHandler": (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next),
    "../src/repositories/tickets": {
      async linkDeveloperTicketsForUser(userId, email) { calls.push(["link", userId, email]); },
      async listMobileTicketsForUser() { return { tickets: [], nextCursor: null }; },
      async listDeveloperTicketsForUser() { return { tickets: [developerTicket], nextCursor: null }; },
      async findDeveloperTicketForUser(id, userId) { calls.push(["find", id, userId]); return developerTicket; },
      async listWaitingTickets() { return []; }
    },
    "../src/repositories/tenants": {},
    "../src/repositories/storeLocations": {},
    "../src/repositories/serviceCounters": {},
    "../src/repositories/developerQueues": {
      async listMobileInvitationsForUser() { return []; },
      async acceptMobileInvitation() { return null; }
    }
  });
  const app = express();
  app.set("trust proxy", true);
  app.use(express.json());
  app.use("/api/v1/mobile", router);
  app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ message: error.message }));
  const server = await new Promise((resolve) => { const nextServer = app.listen(0, () => resolve(nextServer)); });
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/mobile/tickets`, { headers: { "x-forwarded-host": "sandbox-api.getprio.online" } });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.tickets[0].id, developerTicket._id);
    assert.equal(body.tickets[0].source, "developer_api");
    assert.equal(body.tickets[0].profile.queue_name, "My EMR");
    assert.equal(body.tickets[0].profile.location_name, "Main queue");
    assert.deepEqual(calls, []);

    const detail = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/mobile/tickets/${developerTicket._id}`, { headers: { "x-forwarded-host": "sandbox-api.getprio.online" } });
    assert.equal(detail.status, 200);
    assert.equal((await detail.json()).ticket.id, developerTicket._id);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("mobile ticket invitations are scoped by email and can be accepted", async () => {
  const invitation = {
    id: "123e4567-e89b-42d3-a456-426614174000",
    ticketNumber: "QUEUE-0001",
    displayLabel: "Johnny",
    externalReference: "visit-1",
    verificationCode: "AB12CD34",
    status: "waiting",
    environment: "sandbox",
    profileDisplayName: "Sandbox profile",
    queueDisplayName: "Sandbox queue",
    queueSlug: "main",
    createdAt: "2026-09-22T00:00:00.000Z",
    updatedAt: "2026-09-22T00:00:00.000Z"
  };
  const router = requireWithMocks("../mobile/ticketRoutes.js", {
    "../src/middleware/auth": {
      authenticate(req, _res, next) { req.user = { _id: "customer-7" }; next(); }
    },
    "../src/middleware/asyncHandler": (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next),
    "../src/repositories/tickets": {
      async listMobileTicketsForUser() { return { tickets: [], nextCursor: null }; },
      async listWaitingTickets() { return []; }
    },
    "../src/repositories/developerQueues": {
      async listMobileInvitationsForUser(userId, environment) {
        assert.equal(userId, "customer-7");
        assert.equal(environment, "sandbox");
        return [invitation];
      },
      async acceptMobileInvitation(ticketId, userId, environment) {
        assert.equal(ticketId, invitation.id);
        assert.equal(userId, "customer-7");
        assert.equal(environment, "sandbox");
        return invitation;
      }
    },
    "../src/repositories/tenants": { async findTenantById() { return null; } },
    "../src/repositories/storeLocations": { async findLocationById() { return null; } },
    "../src/repositories/serviceCounters": { async findCounterById() { return null; } }
  });
  const app = express();
  app.set("trust proxy", true);
  app.use(express.json());
  app.use("/api/v1/mobile", router);
  app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ message: error.message }));
  const server = await new Promise((resolve) => { const nextServer = app.listen(0, () => resolve(nextServer)); });
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1/mobile`;
    const pending = await fetch(`${baseUrl}/ticket-invitations`, { headers: { "x-forwarded-host": "sandbox.getprio.online" } });
    const pendingBody = await pending.json();
    assert.equal(pending.status, 200, JSON.stringify(pendingBody));
    assert.deepEqual(pendingBody.invitations[0], {
      id: invitation.id,
      ticket_number: "QUEUE-0001",
      source: "developer_api",
      display_label: "Johnny",
      external_reference: "visit-1",
      verification_code: "AB12CD34",
      status: "waiting",
      status_reason: null,
      profile: { queue_name: "Sandbox profile", location_name: "Sandbox queue", location_slug: "main" },
      queue_position: null,
      called_counter: null,
      estimated_wait_minutes: null,
      can_cancel: false,
      tracking_status: "active",
      issued_at: invitation.createdAt,
      updated_at: invitation.updatedAt,
      developer_environment: "sandbox",
      invitation_pending: true
    });

    const accepted = await fetch(`${baseUrl}/ticket-invitations/${invitation.id}/accept`, {
      method: "POST",
      headers: { "x-forwarded-host": "sandbox.getprio.online", "content-type": "application/json" },
      body: "{}"
    });
    assert.equal(accepted.status, 200);
    assert.equal((await accepted.json()).ticket.ticket_number, "QUEUE-0001");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("mobile queue resolve reports open availability and an inactive-plan reason", async () => {
  const queueJoinId = "123e4567-e89b-42d3-a456-426614174000";
  let hasActivePlan = true;
  let queueOpen = false;
  const paymentJoinCalls = [];
  const otpPayloads = [];
  const subscriptionError = () => Object.assign(
    new Error("This queue is not accepting online joins until the vendor activates a subscription plan."),
    { statusCode: 403 }
  );
  const router = requireWithMocks("../mobile/queueJoinRoutes.js", {
    "../src/config/env": {
      appBaseUrl: "http://localhost:5173",
      mobileQrBaseUrl: "https://192.168.1.22:5173"
    },
    "../src/middleware/auth": {
      authenticate(req, _res, next) {
        req.user = { _id: "customer-7", email: "customer@example.com", name: "Customer Seven", roles: ["customer"] };
        next();
      }
    },
    "../src/middleware/asyncHandler": (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next),
    "../src/middleware/idempotency": {
      requireIdempotency: () => (_req, _res, next) => next()
    },
    "../src/repositories/tenants": {
      async findTenantById() {
        return {
          _id: "tenant-14",
          name: "BOSS LOT",
          slug: "bosslot",
          publicProfileDisplayName: "Boss Lot Wellness",
          publicProfileCategory: "Health and Wellness",
          publicProfileDescription: "Fast, friendly service.",
          publicProfileImageUrl: "https://cdn.example.com/vendor-card.webp",
          isActive: true
        };
      },
      async findTenantBySlug() {
        return {
          _id: "tenant-14",
          name: "BOSS LOT",
          slug: "bosslot",
          isActive: true
        };
      }
    },
    "../src/repositories/storeLocations": {
      async findLocationByQueueJoinId() {
        return {
          _id: "location-15",
          tenantId: "tenant-14",
          name: "Main location",
          slug: "main",
          queueJoinId,
          queueLifecycleMode: "enforced",
          isActive: true
        };
      },
      async findLocationByTenantAndSlug() {
        return {
          _id: "location-15",
          tenantId: "tenant-14",
          name: "Main location",
          slug: "main",
          queueJoinId,
          queueLifecycleMode: "enforced",
          isActive: true
        };
      },
      async findPrimaryLocationByTenantId() {
        return {
          _id: "location-15",
          tenantId: "tenant-14",
          name: "Main location",
          slug: "main",
          queueJoinId,
          queueLifecycleMode: "enforced",
          isActive: true
        };
      }
    },
    "../src/services/queueFeeService": {
      async getQueueFeeForTenant() {
        if (!hasActivePlan) throw subscriptionError();
        return {
          enabled: true,
          amountCents: 2000,
          currency: "PHP",
          displayAmount: "PHP 20.00"
        };
      }
    },
    "../src/services/queueJoinOtpService": {
      async requestJoinOtp({ payload }) {
        otpPayloads.push(payload);
        return { otpId: String(otpPayloads.length), deliveryTarget: payload.customerEmail };
      },
      async verifyJoinOtp({ otpId, code }) {
        if (code !== "123456") throw Object.assign(new Error("Incorrect code"), { statusCode: 400 });
        return otpPayloads[Number(otpId) - 1];
      },
      async resendJoinOtp({ otpId }) {
        return { otpId, deliveryTarget: "customer@example.com" };
      }
    },
    "../src/repositories/queueJoinOtps": {
      async findOtpById(id) {
        return { tenantId: "tenant-14", payload: id === "99" ? { userId: "another-customer" } : otpPayloads[Number(id) - 1] };
      }
    },
    "../src/services/queueJoinPaymentService": {
      async handleVerifiedJoin({ payload }) {
        paymentJoinCalls.push(payload);
        return {
          requiresPayment: true,
          payment: { id: "payment-1" },
          checkoutSession: { checkoutUrl: "https://paymongo.example/checkout/1" },
          queueFee: { amountCents: 2000, currency: "PHP" }
        };
      }
    },
    "../src/repositories/queueJoinPayments": {},
    "../src/services/entitlementAdmissionService": {
      async resolvePublicCapabilities() {
        return { queue: hasActivePlan, branding: true };
      }
    },
    "../src/services/storeHoursService": {
      async assertLocationOpenForCustomerJoin() {
        throw Object.assign(new Error("Recurring hours are closed."), { statusCode: 403 });
      }
    },
    "../src/services/queueService": {
      async assertQueueIntakeOpen() {
        if (!queueOpen) {
          throw Object.assign(new Error("The queue has not been opened by staff."), {
            statusCode: 409,
            code: "QUEUE_DAY_UNOPENED"
          });
        }
        return { state: "open", intakeMode: "accepting" };
      },
      async getQueueSnapshot() {
        if (!hasActivePlan) throw subscriptionError();
        return {
          tenant: {
            name: "Boss Lot Wellness",
            publicProfileDescription: "Fast, friendly service.",
            publicProfileCategory: "Health and Wellness"
          },
          queueDay: { state: "open", intakeMode: "accepting" },
          location: {
            id: "location-15",
            name: "Main location",
            slug: "main",
            city: "Quezon City",
            country: "Philippines",
            openStatus: { isOpen: true, summary: "Open 24 hours" }
          },
          businessProfileTheme: {
            scope: "tenant",
            theme: {
              logoUrl: "https://cdn.example.com/logo.webp",
              logoFit: "contain",
              backgroundImageUrl: "https://cdn.example.com/cover.webp",
              backgroundImageFit: "cover"
            }
          }
        };
      }
    },
    "../src/utils/phone": {
      normalizePhilippineMobileNumber: (value) => value
    }
  });
  const app = express();
  app.use(express.json());
  app.use("/api/mobile", router);
  app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ message: error.message }));
  const server = await new Promise((resolve) => {
    const nextServer = app.listen(0, () => resolve(nextServer));
  });

  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api/mobile/queue-join/resolve?id=${queueJoinId}`
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.joinable, false);
    assert.equal(body.unavailableReason, "The queue has not been opened by staff.");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(body.vendorSlug, "bosslot");
    assert.equal(body.locationName, "Main location");

    queueOpen = true;
    const unavailableResponse = await fetch(
      `http://127.0.0.1:${server.address().port}/api/mobile/queue-join/resolve?id=${queueJoinId}`
    );
    assert.equal(unavailableResponse.status, 200);
    const openBody = await unavailableResponse.json();
    assert.equal(openBody.joinable, true);
    assert.equal(openBody.unavailableReason, null);
    assert.equal(unavailableResponse.headers.get("cache-control"), "no-store");
    assert.equal(openBody.vendorName, "BOSS LOT");
    assert.equal(openBody.vendorSlug, "bosslot");
    assert.equal(openBody.locationName, "Main location");

    const joinResponse = await fetch(
      `http://127.0.0.1:${server.address().port}/api/mobile/queue-join`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: queueJoinId })
      }
    );
    assert.equal(joinResponse.status, 201);
    assert.equal((await joinResponse.json()).otpRequired, true);
    assert.equal(paymentJoinCalls.length, 0);
    assert.equal(otpPayloads[0].joinChannel, "qr");

    const directJoinResponse = await fetch(
      `http://127.0.0.1:${server.address().port}/api/mobile/queue-join/direct`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantSlug: "bosslot", locationSlug: "main" })
      }
    );
    assert.equal(directJoinResponse.status, 201);
    assert.equal((await directJoinResponse.json()).otpRequired, true);
    assert.equal(paymentJoinCalls.length, 0);
    assert.equal(otpPayloads[1].joinChannel, "online");
    assert.equal(otpPayloads[1].locationSlug, "main");
    const postOtp = (action, body) => fetch(`http://127.0.0.1:${server.address().port}/api/mobile/queue-join/otp/${action}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    });
    assert.equal((await postOtp("verify", { otpId: "99", code: "123456" })).status, 404);
    assert.equal((await postOtp("resend", { otpId: "99" })).status, 404);
    assert.equal((await postOtp("verify", { otpId: "2", code: "000000" })).status, 400);
    assert.equal(paymentJoinCalls.length, 0);
    queueOpen = false;
    assert.equal((await postOtp("verify", { otpId: "2", code: "123456" })).status, 409);
    assert.equal(paymentJoinCalls.length, 0);
    queueOpen = true;
    assert.equal((await postOtp("resend", { otpId: "2" })).status, 201);
    const verified = await postOtp("verify", { otpId: "2", code: "123456" });
    assert.equal(verified.status, 201);
    assert.equal((await verified.json()).paymentRequired, true);
    assert.equal(paymentJoinCalls.length, 1);
    assert.equal(paymentJoinCalls[0].locationSlug, "main");
    assert.equal(paymentJoinCalls[0].mobileReturnUrl, "https://192.168.1.22:5173/payment/return");

    hasActivePlan = false;
    const inactivePlanResponse = await fetch(
      `http://127.0.0.1:${server.address().port}/api/mobile/queue-join/resolve?id=${queueJoinId}`
    );
    assert.equal(inactivePlanResponse.status, 200);
    const unavailableBody = await inactivePlanResponse.json();
    assert.equal(unavailableBody.joinable, false);
    assert.equal(
      unavailableBody.unavailableReason,
      "This queue is not accepting online joins until the vendor activates a subscription plan."
    );
    assert.equal(unavailableBody.vendorName, "BOSS LOT");
    assert.equal(unavailableBody.vendorSlug, "bosslot");
    assert.equal(unavailableBody.locationName, "Main location");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

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
    const payload = JSON.stringify(body);
    const request = http.request({
      host: "127.0.0.1",
      port: server.address().port,
      path: "/api/v1/mobile/ticket-links/preview",
      method: "POST",
      headers: { host, "content-type": "application/json", "content-length": Buffer.byteLength(payload) }
    }, (response) => {
      let text = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { text += chunk; });
      response.on("end", () => resolve({
        status: response.statusCode,
        headers: response.headers,
        json: () => JSON.parse(text)
      }));
    });
    request.on("error", reject);
    request.end(payload);
  });
}

test("mobile ticket-link preview returns safe context for the matching environment", async () => {
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

test("mobile ticket-link acceptance requires idempotency and returns only the linked context", async () => {
  const serviceCalls = [];
  const router = requireWithMocks("../mobile/ticketLinkRoutes.js", {
    "../src/middleware/auth": {
      authenticate(req, _res, next) {
        req.user = { _id: "17", roles: ["customer"] };
        next();
      }
    },
    "../src/middleware/asyncHandler": (handler) => (req, res, next) =>
      Promise.resolve(handler(req, res, next)).catch(next),
    "../src/middleware/idempotency": {
      requireIdempotency(scope) {
        return (req, _res, next) => {
          assert.equal(scope, "mobile.ticket_links.accept");
          assert.equal(req.get("Idempotency-Key"), "accept-1");
          next();
        };
      }
    },
    "../src/services/mobileTicketLinkService": {
      async acceptPrivateLink(input) {
        serviceCalls.push(input);
        return {
          link: { expiresAt: "2026-09-16T01:00:00.000Z" },
          ticket: { ticketNumber: "S-042", tenantId: "tenant-1", locationId: "location-1", status: "called" }
        };
      }
    },
    "../src/repositories/tenants": {
      async findTenantById(id) {
        assert.equal(id, "tenant-1");
        return { name: "Sandbox Clinic" };
      }
    },
    "../src/repositories/storeLocations": {
      async findLocationById(id) {
        assert.equal(id, "location-1");
        return { name: "Test Branch" };
      }
    }
  });
  const app = express();
  app.use(express.json());
  app.use("/api/v1/mobile", router);
  app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ code: error.code, message: error.message }));
  const server = await new Promise((resolve) => {
    const nextServer = app.listen(0, () => resolve(nextServer));
  });
  try {
    const response = await new Promise((resolve, reject) => {
      const payload = JSON.stringify({ token: "token-value" });
      const request = http.request({
        host: "127.0.0.1",
        port: server.address().port,
        path: "/api/v1/mobile/ticket-links/accept",
        method: "POST",
        headers: {
          host: "sandbox.getprio.online",
          "content-type": "application/json",
          "content-length": Buffer.byteLength(payload),
          "idempotency-key": "accept-1"
        }
      }, (result) => {
        let text = "";
        result.setEncoding("utf8");
        result.on("data", (chunk) => { text += chunk; });
        result.on("end", () => resolve({ status: result.statusCode, headers: result.headers, body: JSON.parse(text) }));
      });
      request.on("error", reject);
      request.end(payload);
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.deepEqual(response.body, {
      linked: true,
      ticket_number: "S-042",
      queue_name: "Sandbox Clinic",
      location_name: "Test Branch",
      status: "called",
      expires_at: "2026-09-16T01:00:00.000Z"
    });
    assert.deepEqual(serviceCalls, [{ token: "token-value", environment: "sandbox", userId: "17" }]);
    assert.equal(JSON.stringify(response.body).includes("token-value"), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
