const test = require("node:test");
const assert = require("node:assert/strict");
const db = require("../src/config/db");
const securityRateLimitService = require("../src/services/securityRateLimitService");
const repository = require("../src/repositories/developerApiRateLimits");

const originalQuery = db.pool.query;
const originalConsume = securityRateLimitService.consume;

test.after(() => {
  db.pool.query = originalQuery;
  securityRateLimitService.consume = originalConsume;
});

test("rate limit settings fall back to configured defaults per environment", async () => {
  db.pool.query = async () => ({ rows: [] });
  const limits = await repository.get("project-1", "sandbox");
  assert.equal(limits.projectId, null);
  assert.equal(limits.environment, "sandbox");
  assert.equal(limits.readLimitPerMinute, 600);
  assert.equal(limits.writeLimitPerMinute, 120);
});

test("rate limit consumption shares one project/environment bucket across keys", async () => {
  const calls = [];
  db.pool.query = async () => ({ rows: [{ developer_project_id: "project-1", environment: "production", read_limit_per_minute: 10, write_limit_per_minute: 4 }] });
  securityRateLimitService.consume = async (input) => { calls.push(input); return { remaining: 3 }; };
  const result = await repository.consume({ projectId: "project-1", environment: "production", kind: "write" });
  assert.equal(result.limit, 4);
  assert.equal(result.windowSeconds, 60);
  assert.equal(calls[0].bucketKey, "developer-api:production:project-1:write");
  assert.equal(calls[0].limit, 4);
});

test("invalid environments and rate limits fail before persistence", async () => {
  await assert.rejects(() => repository.get("project-1", "staging"), { code: "INVALID_API_ENVIRONMENT", statusCode: 400 });
});
