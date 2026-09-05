const test = require("node:test");
const assert = require("node:assert/strict");
const { listRecords } = require("../src/repositories/platformRecords");

test("pagination bounds reject malformed and excessive input before querying", async () => {
  for (const options of [{ page: "NaN" }, { page: "-1" }, { limit: "0" }, { limit: "101" }, { page: "1.5" }, { tenantId: "1 OR TRUE" }, { snapshot: "bad" }, { from: "yesterday" }, { from: "2026-02-31" }, { from: "2026-09-05", to: "2026-09-01" }, { outcome: "unknown" }]) {
    await assert.rejects(listRecords("audit", options, { query: () => assert.fail("Invalid input reached SQL") }), { statusCode: 400 });
  }
});

test("tenant search uses parameters, matches owner ID, and pages without fetching the full table", async () => {
  let call;
  const response = await listRecords("tenants", { page: "2", limit: "2", search: "O'Reilly_%", status: "active", plan: "free" }, {
    query: async (sql, values) => { call = { sql, values }; return { rows: [{ id: "3", userId: "92" }, { id: "2" }, { id: "1" }] }; }
  });
  assert.equal(response.items.length, 2);
  assert.equal(response.items[0].userId, "92");
  assert.equal(response.pagination.hasNext, true);
  assert.match(call.sql, /owner_account.user_id::text ILIKE/);
  assert.match(call.sql, /membership.role = 'owner' AND membership.is_active = TRUE/);
  assert.match(call.sql, /ORDER BY records.id DESC LIMIT \$4 OFFSET \$5/);
  assert.doesNotMatch(call.sql, /O'Reilly/);
  assert.deepEqual(call.values, [true, "free", "%O'Reilly\\_\\%%", 3, 2]);
});

test("role filter includes active vendor memberships as well as global roles", async () => {
  let sql;
  const result = await listRecords("users", { role: "staff" }, { query: async (query) => { sql = query; return { rows: [] }; } });
  assert.match(sql, /ANY\(records.roles\)/);
  assert.match(sql, /membership.is_active = TRUE AND membership.role = \$1/);
  assert.equal(result.pagination.hasNext, false);
  await assert.rejects(listRecords("users", { role: "superuser" }), { statusCode: 400 });
});

test("audit browsing freezes new inserts and filters dates, tenant and outcome", async () => {
  let call;
  const result = await listRecords("audit", { page: "2", limit: "25", snapshot: "900", tenantId: "7", outcome: "success", from: "2026-09-01", to: "2026-09-05" }, {
    query: async (sql, values) => { call = { sql, values }; return { rows: [{ id: "850" }] }; }
  });
  assert.match(call.sql, /records.id <= \$5/);
  assert.match(call.sql, /INTERVAL '1 day'/);
  assert.doesNotMatch(call.sql, /records.metadata|before_state|after_state/);
  assert.deepEqual(call.values, ["success", "7", "2026-09-01T00:00:00Z", "2026-09-05T00:00:00Z", "900", 26, 25]);
  assert.equal(result.pagination.snapshot, "900");
  assert.equal(result.pagination.hasNext, false);
});
