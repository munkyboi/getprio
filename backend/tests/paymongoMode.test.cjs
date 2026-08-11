const test = require("node:test");
const assert = require("node:assert/strict");

const { resolvePaymongoMode } = require("../src/config/env");

test("PayMongo mode accepts explicit sandbox and live values", () => {
  assert.equal(resolvePaymongoMode({ PAYMONGO_MODE: "sandbox", PAYMONGO_SECRET_KEY: "sk_test_key" }), "sandbox");
  assert.equal(resolvePaymongoMode({ PAYMONGO_MODE: "LIVE", PAYMONGO_SECRET_KEY: "sk_live_key" }), "live");
});

test("PayMongo mode infers legacy configuration from the secret key", () => {
  assert.equal(resolvePaymongoMode({ PAYMONGO_SECRET_KEY: "sk_test_key" }), "sandbox");
  assert.equal(resolvePaymongoMode({ PAYMONGO_SECRET_KEY: "sk_live_key" }), "live");
  assert.equal(resolvePaymongoMode({}), "live");
});

test("PayMongo mode rejects unsupported values", () => {
  assert.throws(
    () => resolvePaymongoMode({ PAYMONGO_MODE: "staging" }),
    /PAYMONGO_MODE must be either sandbox or live/
  );
});
