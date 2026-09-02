const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");

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

test("mobile route wiring keeps OAuth and queue contracts under the mobile namespace", () => {
  const app = fs.readFileSync(path.join(repositoryRoot, "backend/src/app.ts"), "utf8");
  const oauth = fs.readFileSync(path.join(repositoryRoot, "backend/mobile/oauthRoutes.js"), "utf8");
  const queue = fs.readFileSync(path.join(repositoryRoot, "backend/mobile/queueJoinRoutes.js"), "utf8");
  assert.match(app, /app\.use\("\/api\/mobile\/auth", mobileOAuthRoutes\)/);
  assert.match(app, /app\.use\("\/api\/mobile\/push", mobilePushRoutes\)/);
  assert.match(oauth, /codeChallenge/);
  assert.match(oauth, /codeRepository\.consume/);
  assert.match(queue, /requireIdempotency\("mobile\.queue_join"\)/);
  assert.match(queue, /userId: req\.user\._id/);
  assert.doesNotMatch(queue, /customerName: req\.body/);
});

test("mobile paid joins configure the PayMongo return target for the app", () => {
  const queue = fs.readFileSync(path.join(repositoryRoot, "backend/mobile/queueJoinRoutes.js"), "utf8");
  assert.match(queue, /mobileReturnUrl/);
  assert.match(queue, /\/payment\/return/);
});

test("mobile queue resolve reports open availability and an inactive-plan reason", async () => {
  const queueJoinId = "123e4567-e89b-42d3-a456-426614174000";
  let hasActivePlan = true;
  let queueOpen = false;
  const paymentJoinCalls = [];
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
        req.user = { _id: "customer-7", name: "Customer Seven", roles: ["customer"] };
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
    assert.equal(paymentJoinCalls.length, 1);
    assert.equal(
      paymentJoinCalls[0].mobileReturnUrl,
      "https://192.168.1.22:5173/payment/return"
    );

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
