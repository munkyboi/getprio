const test = require("node:test");
const assert = require("node:assert/strict");
const developerProjects = require("../src/repositories/developerProjects");
const developerApiRateLimits = require("../src/repositories/developerApiRateLimits");
const { authenticateDeveloperApiKey, getApiKey } = require("../src/middleware/developerApiKeyAuth");

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

test("developer API auth accepts the Bearer transport", async () => {
  developerProjects.findApiKeyByHash = async (hash) => {
    assert.ok(hash);
    return {
      id: "key-1",
      projectId: "project-1",
      environment: "sandbox",
      scopes: ["queues:read"],
      status: "active",
      projectStatus: "active",
      accountStatus: "active",
      createdByUserId: "7"
    };
  };
  developerProjects.touchApiKey = async () => {};
  developerApiRateLimits.consume = async () => ({ limit: 600, remaining: 599, windowSeconds: 60 });

  const request = {
    hostname: "sandbox-api.getprio.online",
    method: "GET",
    headers: { authorization: "Bearer gpk_sbx_test" }
  };
  const headers = {};
  let nextError;
  await authenticateDeveloperApiKey(request, { setHeader(name, value) { headers[name] = value; } }, (error) => {
    nextError = error;
  });

  assert.equal(nextError, undefined);
  assert.equal(request.apiKey.id, "key-1");
  assert.equal(headers["RateLimit-Limit"], "600");
  assert.equal(getApiKey(request), "gpk_sbx_test");
});

test("developer API auth rejects ambiguous Bearer and legacy credentials", async () => {
  const request = {
    hostname: "sandbox-api.getprio.online",
    method: "GET",
    headers: {
      authorization: "Bearer gpk_sbx_test",
      "x-api-key": "gpk_sbx_legacy"
    }
  };
  let nextError;
  await authenticateDeveloperApiKey(request, { setHeader() {} }, (error) => {
    nextError = error;
  });

  assert.equal(nextError.code, "API_AUTH_AMBIGUOUS");
  assert.equal(nextError.statusCode, 400);
});

test("developer API auth rejects malformed Bearer credentials", async () => {
  const request = {
    hostname: "sandbox-api.getprio.online",
    method: "GET",
    headers: { authorization: "Basic gpk_sbx_test" }
  };
  let nextError;
  await authenticateDeveloperApiKey(request, { setHeader() {} }, (error) => {
    nextError = error;
  });

  assert.equal(nextError.code, "API_KEY_INVALID");
  assert.equal(nextError.statusCode, 401);
});
