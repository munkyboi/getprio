const test = require("node:test");
const assert = require("node:assert/strict");
const { requireWithMocks } = require("./testSupport.cjs");

function fixture() {
  const calls = [];
  const memberships = new Map();
  const client = { query: async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes("INSERT INTO tenant_memberships")) {
      assert.equal(typeof params[0], "string");
      assert.equal(typeof params[1], "string");
      assert.match(sql, /ON CONFLICT \(user_id, tenant_id\) DO UPDATE/);
      memberships.set(`${params[0]}:${params[1]}`, {
        user_id: params[0], tenant_id: params[1], role: params[2], is_active: params[3]
      });
      return { rows: [] };
    }
    if (sql.includes("FROM users WHERE id = $1")) {
      return { rows: [{ id: params[0], name: "Existing account", roles: [] }] };
    }
    if (sql.includes("FROM oauth_accounts")) return { rows: [] };
    if (sql.includes("FROM tenant_memberships")) {
      return { rows: [...memberships.values()].filter(row => params[0].includes(row.user_id)) };
    }
    throw new Error("Unexpected repository query.");
  } };
  const users = requireWithMocks("../src/repositories/users", {
    "../config/db": { pool: { query: async () => { throw new Error("Unexpected default client."); } } }
  });
  return { calls, memberships, client, users };
}

test("membership insertion preserves adjacent BIGINT user and tenant identities through hydration", async () => {
  const { calls, memberships, client, users } = fixture();
  const ids = ["9007199254740992", "9007199254740993"];
  for (const userId of ids) {
    for (const tenantId of ids) {
      const user = await users.addTenantMembership(userId, tenantId, "staff", { client });
      assert.equal(user._id, userId);
      assert.ok(user.tenantMemberships.some(row => row.tenantId === tenantId));
    }
  }
  assert.equal(memberships.size, 4);
  assert.deepEqual(calls.filter(call => call.sql.includes("INSERT INTO tenant_memberships"))
    .map(call => call.params.slice(0, 2)), ids.flatMap(userId => ids.map(tenantId => [userId, tenantId])));
  assert.ok(calls.filter(call => call.sql.includes("FROM users WHERE id = $1"))
    .every(call => ids.includes(call.params[0])));
});

test("membership insertion keeps numeric callers, default role and active upsert behavior", async () => {
  const { calls, memberships, client, users } = fixture();
  const user = await users.addTenantMembership(7, 4, undefined, { client });
  assert.deepEqual(calls[0].params, ["7", "4", "staff", true]);
  assert.deepEqual(user.tenantMemberships, [{ tenantId: "4", role: "staff", isActive: true }]);
  memberships.get("7:4").is_active = false;
  const updated = await users.addTenantMembership("7", "4", "admin", { client });
  assert.equal(memberships.size, 1);
  assert.deepEqual(updated.tenantMemberships, [{ tenantId: "4", role: "admin", isActive: true }]);
});

test("membership insertion uses the default pool when no transaction client is supplied", async () => {
  const { client, calls } = fixture();
  const users = requireWithMocks("../src/repositories/users", { "../config/db": { pool: client } });
  const user = await users.addTenantMembership("9223372036854775807", "9007199254740993", "owner");
  assert.deepEqual(calls[0].params, ["9223372036854775807", "9007199254740993", "owner", true]);
  assert.equal(user._id, "9223372036854775807");
  assert.equal(user.tenantMemberships[0].tenantId, "9007199254740993");
});

test("membership insertion propagates database rejection without hydrating success", async () => {
  const { users } = fixture();
  const failure = new Error("Membership write rejected.");
  let calls = 0;
  const client = { query: async () => { calls++; throw failure; } };
  await assert.rejects(users.addTenantMembership("9007199254740993", "1", "staff", { client }),
    error => error === failure);
  assert.equal(calls, 1);
});
