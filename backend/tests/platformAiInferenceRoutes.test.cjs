const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const fs = require("node:fs");
const vm = require("node:vm");
const { assertPermission } = require("../src/services/permissions");
const { normalizePolicy } = require("../src/services/aiInferencePolicy");

test("AI controller denies other roles before reading/writing and disables HTTP caching", async () => {
  const calls = [];
  const service = Object.fromEntries(
    ["read", "searchScopes", "preview", "update"].map((name) => [
      name,
      async (input) => {
        if (name === "preview" || name === "update") normalizePolicy(input.draft);
        calls.push([name, input]);
        return { operation: name };
      },
    ]),
  );
  const module = { exports: {} };
  vm.runInNewContext(
    fs.readFileSync(
      require.resolve("../src/routes/platformAiInferenceRoutes"),
      "utf8",
    ),
    {
      module,
      require: (name) =>
        ({
          express,
          "../middleware/asyncHandler": (fn) => (req, res, next) =>
            Promise.resolve(fn(req, res, next)).catch(next),
          "../middleware/auth": {
            requirePlatformPermission: (permission) => (req, _res, next) => {
              try {
                assertPermission(req.user, permission);
                next();
              } catch (error) {
                next(error);
              }
            },
          },
          "../services/platformAiInferenceService": service,
        })[name],
    },
  );
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { _id: "1", roles: [req.get("x-test-role")] };
    req.auth = { session: { _id: "1" } };
    next();
  });
  app.use("/ai", module.exports);
  app.use((error, _req, res, _next) =>
    res.status(error.statusCode || 500).json({ message: error.message }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const root = `http://127.0.0.1:${server.address().port}/ai`;
  try {
    for (const role of [
      "customer",
      "vendor_admin",
      "vendor_staff",
      "platform_release_observer",
    ]) {
      for (const [path, method] of [
        ["", "GET"],
        ["/scopes", "GET"],
        ["/preview", "POST"],
        ["/policy", "POST"],
      ]) {
        const response = await fetch(root + path, {
          method,
          headers: { "x-test-role": role, "content-type": "application/json" },
          ...(method === "POST" ? { body: "{}" } : {}),
        });
        assert.equal(response.status, 403);
        assert.equal(response.headers.get("cache-control"), "no-store");
      }
    }
    assert.equal(calls.length, 0);
    const result = await fetch(root, {
      headers: { "x-test-role": "platform_admin" },
    });
    assert.equal(result.status, 200);
    assert.equal((await result.json()).operation, "read");
    const write = await fetch(root + "/policy", {
      method: "POST",
      headers: {
        "x-test-role": "platform_admin",
        "content-type": "application/json",
        "idempotency-key": "test-key-123",
        "x-transaction-confirmation": "confirmed",
      },
      body: JSON.stringify({
          policy: { requestedMode: 'off', timeoutMs: 100, freshnessMs: 1000, pilots: [] },
        reason: "Review policy",
        expectedRevision: "2",
      }),
    });
    assert.equal(write.status, 200);
    assert.equal(calls.at(-1)[1].operationKey, "test-key-123");
    assert.equal(calls.at(-1)[1].confirmationToken, "confirmed");
    for (const path of ['/preview', '/policy']) {
      const empty = await fetch(root + path, { method: 'POST', headers: { 'x-test-role': 'platform_admin' } });
      assert.equal(empty.status, 400);
      assert.match((await empty.json()).message, /policy field/);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
