const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeApiPath } = require("../src/middleware/apiPath");

test("normalizes legacy and v1 API paths to the same middleware route", () => {
  for (const path of [
    "/api/auth/mfa/verify?from=mobile",
    "/api/v1/auth/mfa/verify?from=mobile"
  ]) {
    assert.equal(normalizeApiPath(path), "/auth/mfa/verify");
  }
  assert.equal(normalizeApiPath("/api/account/delete"), "/account/delete");
  assert.equal(normalizeApiPath("/api/v1/account/delete"), "/account/delete");
});
