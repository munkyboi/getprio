const test = require("node:test");
const assert = require("node:assert/strict");
const developerProjects = require("../src/repositories/developerProjects");
const developerApiRateLimits = require("../src/repositories/developerApiRateLimits");
const developerApiKeyActivity = require("../src/repositories/developerApiKeyActivity");
const { authenticateDeveloperApiKey } = require("../src/middleware/developerApiKeyAuth");

const originals = {
  findApiKeyByHash: developerProjects.findApiKeyByHash,
  touchApiKey: developerProjects.touchApiKey,
  consume: developerApiRateLimits.consume,
  record: developerApiKeyActivity.record
};

test.after(() => {
  developerProjects.findApiKeyByHash = originals.findApiKeyByHash;
  developerProjects.touchApiKey = originals.touchApiKey;
  developerApiRateLimits.consume = originals.consume;
  developerApiKeyActivity.record = originals.record;
});

test("recognized API-key responses are counted when the response finishes", async () => {
  const events = [];
  let finish;
  developerProjects.findApiKeyByHash = async () => ({ id: "key-1", projectId: "project-1", environment: "sandbox", scopes: ["queues:write"], status: "active", projectStatus: "active", accountStatus: "active", createdByUserId: "7" });
  developerProjects.touchApiKey = async () => {};
  developerApiRateLimits.consume = async () => ({ limit: 120, remaining: 119, windowSeconds: 60 });
  developerApiKeyActivity.record = async (event) => events.push(event);
  const response = { statusCode: 429, setHeader() {}, once(event, listener) { assert.equal(event, "finish"); finish = listener; } };
  let nextError;
  const request = { hostname: "sandbox-api.getprio.online", method: "POST", headers: { authorization: "Bearer gpk_sbx_test" } };
  await authenticateDeveloperApiKey(request, response, (error) => { nextError = error; });
  assert.equal(nextError, undefined);
  assert.equal(events.length, 0);
  finish();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, [{ apiKeyId: "key-1", kind: "write", statusCode: 429, authFailure: false }]);
});

test("known revoked keys record a sanitized authentication-failure counter", async () => {
  const events = [];
  developerProjects.findApiKeyByHash = async () => ({ id: "key-2", projectId: "project-1", environment: "sandbox", scopes: [], status: "revoked", projectStatus: "active", accountStatus: "active", createdByUserId: "7" });
  developerApiKeyActivity.record = async (event) => events.push(event);
  let nextError;
  await authenticateDeveloperApiKey(
    { hostname: "sandbox-api.getprio.online", method: "GET", headers: { "x-api-key": "gpk_sbx_revoked" } },
    { setHeader() {} },
    (error) => { nextError = error; }
  );
  assert.equal(nextError.statusCode, 401);
  assert.equal(nextError.code, "API_KEY_INVALID");
  assert.deepEqual(events, [{ apiKeyId: "key-2", kind: "read", statusCode: 401, authFailure: true }]);
});
