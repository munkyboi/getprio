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
