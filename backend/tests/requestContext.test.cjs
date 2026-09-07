const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createRequestContextMiddleware,
  getRequestContext
} = require("../src/middleware/requestContext");

test("request context returns a correlation id and server rollout cohort", async () => {
  const middleware = createRequestContextMiddleware({ rolloutCohort: "internal" });
  const request = { headers: { "x-correlation-id": "smoke-run-12345678" } };
  const responseHeaders = new Map();
  const response = { setHeader: (name, value) => responseHeaders.set(name, value) };

  await new Promise((resolve) => {
    middleware(request, response, () => {
      assert.deepEqual(getRequestContext(), {
        correlationId: "smoke-run-12345678",
        rolloutCohort: "internal"
      });
      resolve();
    });
  });

  assert.equal(responseHeaders.get("X-Correlation-ID"), "smoke-run-12345678");
  assert.equal(request.context.rolloutCohort, "internal");
});

test("request context rejects client-authored cohort and invalid correlation ids", async () => {
  const middleware = createRequestContextMiddleware({ rolloutCohort: "off" });
  const request = {
    headers: {
      "x-correlation-id": "contains spaces",
      "x-rollout-cohort": "production"
    }
  };
  const response = { setHeader() {} };

  await new Promise((resolve) => middleware(request, response, resolve));

  assert.match(request.context.correlationId, /^[0-9a-f-]{36}$/);
  assert.equal(request.context.rolloutCohort, "off");
});
