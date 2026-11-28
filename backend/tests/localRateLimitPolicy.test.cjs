const test = require("node:test");
const assert = require("node:assert/strict");
const { isLocalDevelopmentProfile, localRateLimit } = require("../src/services/localRateLimitPolicy");

const localCore = {
  NODE_ENV: "development",
  LOCAL_API_PROFILE: "core",
  LOCAL_API_ORIGIN: "http://127.0.0.1:5091/"
};

test("local loopback profiles receive the relaxed request budget", () => {
  assert.equal(isLocalDevelopmentProfile(localCore), true);
  assert.equal(localRateLimit(1_000, 10_000, localCore), 10_000);
  assert.equal(localRateLimit(1_000, 10_000, {
    nodeEnv: "development",
    localApiProfile: "core",
    localApiOrigin: "http://127.0.0.1:5091"
  }), 10_000);
});

test("production and non-loopback profiles retain the production budget", () => {
  assert.equal(localRateLimit(1_000, 10_000, { ...localCore, NODE_ENV: "production" }), 1_000);
  assert.equal(localRateLimit(1_000, 10_000, { ...localCore, LOCAL_API_ORIGIN: "https://api.getprio.online/" }), 1_000);
  assert.equal(localRateLimit(1_000, 10_000, { ...localCore, LOCAL_API_PROFILE: "" }), 1_000);
});
