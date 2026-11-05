const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const env = require("../src/config/env");
const { authenticateDeveloper } = require("../src/middleware/developerAuth");

function runMiddleware(request) {
  return new Promise((resolve) => {
    authenticateDeveloper(request, {}, (error) => resolve(error || null));
  });
}

test("developer middleware rejects an ordinary app session token", async () => {
  const request = {
    headers: {
      authorization: `Bearer ${jwt.sign({ sub: "1", session_id: "12", roles: ["customer"] }, env.jwtSecret)}`
    }
  };

  const error = await runMiddleware(request);
  assert.equal(error?.statusCode, 401);
  assert.equal(error?.message, "Developer session is no longer valid.");
});

test("developer middleware requires credentials", async () => {
  const error = await runMiddleware({ headers: {} });
  assert.equal(error?.statusCode, 401);
  assert.equal(error?.message, "Developer authentication required.");
});
