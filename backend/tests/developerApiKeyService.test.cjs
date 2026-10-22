const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createApiKey,
  hashApiKey,
  normalizeEnvironment
} = require("../src/services/developerApiKeyService");
const { getApiEnvironment, requireApiScope } = require("../src/middleware/developerApiKeyAuth");

test("developer API keys use environment-specific prefixes and one-way hashes", () => {
  const sandbox = createApiKey("sandbox");
  const production = createApiKey("production");

  assert.match(sandbox.value, /^gpk_sbx_[A-Za-z0-9_-]{43}$/);
  assert.match(production.value, /^gpk_live_[A-Za-z0-9_-]{43}$/);
  assert.equal(sandbox.environment, "sandbox");
  assert.equal(sandbox.secretHash, hashApiKey(sandbox.value));
  assert.notEqual(sandbox.secretHash, sandbox.value);
  assert.notEqual(sandbox.value, production.value);
});

test("developer API key environment validation fails closed", () => {
  assert.equal(normalizeEnvironment("SANDBOX"), "sandbox");
  assert.throws(
    () => normalizeEnvironment("staging"),
    (error) => error.statusCode === 400 && error.code === "INVALID_KEY_ENVIRONMENT"
  );
});

test("developer API key middleware maps API hosts and enforces scopes", () => {
  assert.equal(getApiEnvironment({ hostname: "sandbox-api.getprio.online", headers: {} }), "sandbox");
  assert.equal(getApiEnvironment({ hostname: "api.getprio.online", headers: {} }), "production");
  assert.equal(getApiEnvironment({ hostname: "localhost", headers: {} }), "unknown");

  const allow = requireApiScope("queues:write");
  const deny = requireApiScope("webhooks:write");
  const request = { apiKey: { scopes: ["queues:read", "queues:write"] } };
  let allowed = false;
  allow(request, {}, (error) => { allowed = !error; });
  assert.equal(allowed, true);
  let denied;
  deny(request, {}, (error) => { denied = error; });
  assert.equal(denied.code, "API_SCOPE_REQUIRED");
});
