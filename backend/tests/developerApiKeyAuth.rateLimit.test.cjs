const test = require("node:test");
const assert = require("node:assert/strict");
const developerProjects = require("../src/repositories/developerProjects");
const developerApiRateLimits = require("../src/repositories/developerApiRateLimits");
const { authenticateDeveloperApiKey } = require("../src/middleware/developerApiKeyAuth");

const originals = {
  findApiKeyByHash: developerProjects.findApiKeyByHash,
  touchApiKey: developerProjects.touchApiKey,
  consume: developerApiRateLimits.consume
};

test.after(() => {
  developerProjects.findApiKeyByHash = originals.findApiKeyByHash;
  developerProjects.touchApiKey = originals.touchApiKey;
  developerApiRateLimits.consume = originals.consume;
});

test("developer API auth emits project-wide read rate-limit headers", async () => {
  developerProjects.findApiKeyByHash = async () => ({ id: "key-1", projectId: "project-1", createdByUserId: "7", environment: "sandbox", scopes: ["queues:read"], status: "active", projectStatus: "active", accountStatus: "active" });
  developerProjects.touchApiKey = async () => {};
  developerApiRateLimits.consume = async (input) => { assert.deepEqual(input, { projectId: "project-1", environment: "sandbox", kind: "read" }); return { limit: 600, remaining: 599, windowSeconds: 60 }; };
  const headers = {};
  let nextError;
  await authenticateDeveloperApiKey({ hostname: "sandbox-api.getprio.online", method: "GET", headers: { "x-api-key": "gpk_sbx_test" } }, { setHeader(name, value) { headers[name] = value; } }, (error) => { nextError = error; });
  assert.equal(nextError, undefined);
  assert.equal(headers["RateLimit-Limit"], "600");
  assert.equal(headers["RateLimit-Remaining"], "599");
});

test("developer API auth propagates Retry-After when the project budget is exhausted", async () => {
  developerProjects.findApiKeyByHash = async () => ({ id: "key-1", projectId: "project-1", createdByUserId: "7", environment: "sandbox", scopes: ["queues:write"], status: "active", projectStatus: "active", accountStatus: "active" });
  developerApiRateLimits.consume = async () => { const error = new Error("rate limited"); error.statusCode = 429; error.code = "RATE_LIMITED"; error.retryAfterSeconds = 17; error.rateLimit = { limit: 120, windowSeconds: 60 }; throw error; };
  const headers = {};
  let nextError;
  await authenticateDeveloperApiKey({ hostname: "sandbox-api.getprio.online", method: "POST", headers: { "x-api-key": "gpk_sbx_test" } }, { setHeader(name, value) { headers[name] = value; } }, (error) => { nextError = error; });
  assert.equal(nextError.code, "RATE_LIMITED");
  assert.equal(headers["Retry-After"], "17");
  assert.equal(headers["RateLimit-Remaining"], "0");
});
