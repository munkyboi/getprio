const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { listRecords } = require("../src/repositories/platformRecords");

// Opt in with a local PostgreSQL container. Every table is temporary and every
// invocation rolls back; existing application tables and records are untouched.
const container = process.env.PLATFORM_RECORDS_POSTGRES_CONTAINER;
const fixture = `BEGIN;
CREATE TEMP TABLE users (id bigint, name text, username text, email text, roles text[], created_at timestamptz);
CREATE TEMP TABLE tenants (id bigint, name text, slug text, is_active boolean, created_at timestamptz);
CREATE TEMP TABLE tenant_memberships (id bigint, user_id bigint, tenant_id bigint, role text, is_active boolean);
CREATE TEMP TABLE tenant_subscriptions (id bigint, tenant_id bigint, plan_slug text, status text, updated_at timestamptz);
CREATE TEMP TABLE tickets (id bigint, tenant_id bigint);
CREATE TEMP TABLE security_audit_events (id bigint, actor_user_id bigint, occurred_at timestamptz, action_key text, outcome text, resource_type text, resource_id text, reason text, tenant_id bigint);
INSERT INTO users VALUES (1,'Owner','owner','owner@example.test',ARRAY['customer'],NOW()), (2,'Staff','staff','staff@example.test',ARRAY['customer'],NOW());
INSERT INTO tenants VALUES (11,'Pool','pool',true,NOW()), (12,'Clinic','clinic',false,NOW());
INSERT INTO tenant_memberships VALUES (1,1,11,'owner',true), (2,2,11,'staff',true);
INSERT INTO tenant_subscriptions VALUES (1,11,'free','active',NOW());
INSERT INTO tickets VALUES (1,11),(2,11);
INSERT INTO security_audit_events SELECT n,1,'2026-09-05T12:00:00Z','account.update','success','user','1','Review',11 FROM generate_series(1,63) n;
`;
const literal = (value) => typeof value === "number" || typeof value === "boolean" ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
const client = {
  query: async (sql, values) => {
    const input = `${fixture} PREPARE records_query AS SELECT COALESCE(json_agg(result),'[]'::json) FROM (${sql}) result;
      EXECUTE records_query(${values.map(literal).join(",")}); ROLLBACK;`;
    const output = execFileSync("docker", ["exec", "-i", container, "sh", "-c", 'psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'], { input, encoding: "utf8" });
    return { rows: JSON.parse(output.trim()) };
  }
};

test("PostgreSQL executes tenant, membership and audit pagination against isolated fixtures", { skip: !container }, async () => {
  const tenants = await listRecords("tenants", { search: "1", status: "active", plan: "free" }, client);
  assert.equal(tenants.items.length, 1);
  assert.equal(tenants.items[0].userId, "1");
  assert.equal(tenants.items[0].ticketCount, 2);
  const users = await listRecords("users", { role: "staff" }, client);
  assert.deepEqual(users.items.map((row) => row.id), ["2"]);
  const audit = await listRecords("audit", { page: "2", snapshot: "60", from: "2026-09-05", to: "2026-09-05", tenantId: "11", outcome: "success" }, client);
  assert.equal(audit.items[0].id, "35");
  assert.equal(audit.items.at(-1).id, "11");
  assert.equal(audit.pagination.hasNext, true);
  const empty = await listRecords("audit", { search: "O'Reilly_%" }, client);
  assert.deepEqual(empty.items, []);
});
