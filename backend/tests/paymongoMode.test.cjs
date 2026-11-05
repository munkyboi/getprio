const test = require("node:test");
const assert = require("node:assert/strict");

const { resolvePaymongoCredentials, resolvePaymongoMode } = require("../src/config/env");

test("PayMongo mode accepts explicit sandbox and live values", () => {
  assert.equal(resolvePaymongoMode({ PAYMONGO_MODE: "sandbox", PAYMONGO_SECRET_KEY: "sk_test_key" }), "sandbox");
  assert.equal(resolvePaymongoMode({ PAYMONGO_MODE: "LIVE", PAYMONGO_SECRET_KEY: "sk_live_key" }), "live");
});

test("PayMongo mode infers legacy configuration from the secret key", () => {
  assert.equal(resolvePaymongoMode({ PAYMONGO_SECRET_KEY: "sk_test_key" }), "sandbox");
  assert.equal(resolvePaymongoMode({ PAYMONGO_SECRET_KEY: "sk_live_key" }), "live");
  assert.equal(resolvePaymongoMode({}), "live");
});

test("PayMongo credentials select the configured environment", () => {
  const source = {
    PAYMONGO_SANDBOX_SECRET_KEY: "sk_test_sandbox",
    PAYMONGO_SANDBOX_WEBHOOK_SECRET: "sandbox-webhook",
    PAYMONGO_LIVE_SECRET_KEY: "sk_live_live",
    PAYMONGO_LIVE_WEBHOOK_SECRET: "live-webhook",
  };

  assert.deepEqual(resolvePaymongoCredentials(source, "sandbox"), {
    secretKey: "sk_test_sandbox",
    webhookSecret: "sandbox-webhook",
  });
  assert.deepEqual(resolvePaymongoCredentials(source, "live"), {
    secretKey: "sk_live_live",
    webhookSecret: "live-webhook",
  });
});

test("PayMongo credentials retain legacy variables as a fallback", () => {
  assert.deepEqual(resolvePaymongoCredentials({ PAYMONGO_SECRET_KEY: "sk_test_legacy", PAYMONGO_WEBHOOK_SECRET: "legacy-webhook" }, "sandbox"), {
    secretKey: "sk_test_legacy",
    webhookSecret: "legacy-webhook",
  });
});

test("PayMongo mode rejects unsupported values", () => {
  assert.throws(
    () => resolvePaymongoMode({ PAYMONGO_MODE: "staging" }),
    /PAYMONGO_MODE must be either sandbox or live/
  );
});
