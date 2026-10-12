const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { randomUUID } = require("node:crypto");
const express = require("express");
const permissions = require("../src/services/permissions");
const reportModule = require("../src/services/resourceInventoryReconciliationReport");
function loadService(pool) {
  const module = { exports: {} };
  vm.runInNewContext(
    fs.readFileSync(
      require.resolve("../src/services/platformResourceInventoryService"),
      "utf8",
    ),
    {
      module,
      require: (name) =>
        ({
          "../config/db": { pool },
          "./permissions": permissions,
          "./resourceInventoryReconciliationReport": reportModule,
        })[name],
    },
  );
  return module.exports.createPlatformResourceInventoryService;
}
test("resource HTTP route denies non-admin roles, forwards only scalar scope/window and disables caching", async () => {
  const calls = [];
  const service = {
    PERMISSION: "platform.resource_inventory.read",
    read: async (input) => {
      calls.push(input);
      return { readiness: "not_ready" };
    },
    searchScopes: async (input) => {
      calls.push(input);
      return { scopes: [] };
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(
    fs.readFileSync(
      require.resolve("../src/routes/platformResourceInventoryRoutes"),
      "utf8",
    ),
    {
      module,
      require: (name) =>
        ({
          express,
          "../middleware/asyncHandler": (fn) => (req, res, next) =>
            Promise.resolve(fn(req, res, next)).catch(next),
          "../middleware/auth": {
            requirePlatformPermission: (permission) => (req, _res, next) => {
              try {
                permissions.assertPermission(req.user, permission);
                next();
              } catch (error) {
                next(error);
              }
            },
          },
          "../services/platformResourceInventoryService": service,
        })[name],
    },
  );
  const app = express();
  app.use((req, _res, next) => {
    req.user = { _id: "1", roles: [req.get("x-test-role")] };
    req.auth = { session: { _id: "1" } };
    next();
  });
  app.use("/resource", module.exports);
  app.use((error, _req, res, _next) =>
    res.status(error.statusCode || 500).json({ message: error.message }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const root = `http://127.0.0.1:${server.address().port}/resource`;
  try {
    for (const role of [
      "customer",
      "vendor",
      "staff",
      "platform_release_observer",
    ])
      for (const path of ["/report", "/scopes"]) {
        const response = await fetch(root + path, {
          headers: { "x-test-role": role },
        });
        assert.equal(response.status, 403);
        assert.equal(response.headers.get("cache-control"), "no-store");
      }
    assert.equal(calls.length, 0);
    for (const query of [
      "tenantId=1&tenantId=2",
      "sourceBinding=evil",
      "limits=1",
      "locationId[]=10",
      "windowFrom[sql]=evil",
    ]) {
      const response = await fetch(`${root}/report?${query}`, {
        headers: { "x-test-role": "platform_admin" },
      });
      assert.equal(response.status, 400);
      assert.equal(response.headers.get("cache-control"), "no-store");
    }
    for (const query of ["q=one&q=two", "limit=1000"])
      assert.equal(
        (
          await fetch(`${root}/scopes?${query}`, {
            headers: { "x-test-role": "platform_admin" },
          })
        ).status,
        400,
      );
    assert.equal(calls.length, 0);
    assert.equal(
      (
        await fetch(
          `${root}/report?tenantId=1&locationId=10&windowFrom=2026-10-12T00%3A00%3A00Z&windowTo=2026-10-12T01%3A00%3A00Z`,
          { headers: { "x-test-role": "platform_admin" } },
        )
      ).status,
      200,
    );
    assert.equal(calls[0].user._id, "1");
    assert.equal(calls[0].session._id, "1");
    assert.deepEqual(Object.keys(calls[0].input).sort(), [
      "locationId",
      "tenantId",
      "windowFrom",
      "windowTo",
    ]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
const url = process.env.RESOURCE_LEDGER_TEST_DATABASE_URL;
test(
  "PostgreSQL resource operator authority is refreshed for search, scope and unavailable report delivery",
  { skip: !url },
  async (t) => {
    const target = new URL(url);
    assert.equal(target.hostname, "127.0.0.1");
    assert.ok(
      ["/getprio_test", "/getprio_ledger_test"].includes(target.pathname),
    );
    const { Pool } = require("pg");
    const schema = `resource_operator_${randomUUID().replaceAll("-", "")}`;
    const pool = new Pool({
      connectionString: url,
      options: `-c search_path=${schema}`,
      max: 4,
    });
    const user = { _id: "1", roles: ["platform_admin"] },
      session = { _id: "1" };
    const factory = loadService(pool);
    const service = factory({ pool });
    const input = () => ({
      tenantId: "1",
      locationId: "10",
      windowFrom: new Date(Date.now() - 60000).toISOString(),
      windowTo: new Date(Date.now() + 60000).toISOString(),
    });
    const reset = async () =>
      pool.query(`UPDATE users SET roles=ARRAY['platform_admin'],deletion_requested_at=NULL,platform_access_suspended_at=NULL,mfa_enabled=TRUE;
    UPDATE auth_sessions SET status='active',surface='app',mfa_verified_at=clock_timestamp(),expires_at=clock_timestamp()+interval '1 hour',absolute_expires_at=NULL,inactivity_expires_at=NULL;`);
    try {
      await pool.query(`CREATE SCHEMA ${schema}; CREATE TABLE users(id BIGINT,roles TEXT[],deletion_requested_at TIMESTAMPTZ,platform_access_suspended_at TIMESTAMPTZ,mfa_enabled BOOLEAN);
      CREATE TABLE auth_sessions(id BIGINT,user_id BIGINT,status TEXT,surface TEXT,mfa_verified_at TIMESTAMPTZ,expires_at TIMESTAMPTZ,absolute_expires_at TIMESTAMPTZ,inactivity_expires_at TIMESTAMPTZ);
      CREATE TABLE tenants(id BIGINT,name TEXT);CREATE TABLE store_locations(id BIGINT,tenant_id BIGINT,name TEXT);
      INSERT INTO users VALUES(1,ARRAY['platform_admin'],NULL,NULL,TRUE);
      INSERT INTO auth_sessions VALUES(1,1,'active','app',now(),now()+interval '1 hour',NULL,NULL);
      INSERT INTO tenants VALUES(1,'Test'),(2,'Other');INSERT INTO store_locations VALUES(10,1,'Main'),(20,2,'Other');`);
      await t.test(
        "missing ledger storage yields private unavailable data, not zero counts or activation",
        async () => {
          const result = await service.read({ user, session, input: input() });
          assert.equal(result.scanStatus, "unavailable");
          assert.equal(result.counts, null);
          assert.equal(result.inventory, null);
          assert.equal(result.readiness, "not_ready");
          assert.equal(result.snapshot, null);
          assert.equal(result.authoritativeInventoryComplete, false);
          assert.equal(
            result.scope.sourceBinding,
            "getprio-platform-resource-inventory-v1",
          );
        },
      );
      await t.test(
        "scope search is freshly authorized, exactly bounded, and preserves identifiers as strings",
        async () => {
          assert.equal(
            (await service.searchScopes({ user, session, query: "Main" }))
              .scopes[0].locationId,
            "10",
          );
          await pool.query(
            "INSERT INTO store_locations SELECT n,1,'Main '||n FROM generate_series(100,151) n",
          );
          const result = await service.searchScopes({
            user,
            session,
            query: "Main",
          });
          assert.equal(result.scopes.length, 50);
          assert.equal(result.limited, true);
        },
      );
      await t.test(
        "mismatched tenant/location fails closed and clients cannot override trusted configuration",
        async () => {
          await assert.rejects(
            service.read({
              user,
              session,
              input: { ...input(), tenantId: "2" },
            }),
            { statusCode: 403 },
          );
          await assert.rejects(
            service.read({
              user,
              session,
              input: { ...input(), sourceBinding: "client" },
            }),
            { statusCode: 400 },
          );
          await assert.rejects(
            service.read({
              user,
              session,
              input: {
                ...input(),
                windowTo: new Date(Date.now() + 9 * 3600000).toISOString(),
              },
            }),
            { statusCode: 400 },
          );
        },
      );
      const revocations = [
        "UPDATE users SET roles=ARRAY['customer']",
        "UPDATE users SET platform_access_suspended_at=now()",
        "UPDATE users SET deletion_requested_at=now()",
        "UPDATE users SET mfa_enabled=FALSE",
        "UPDATE auth_sessions SET status='revoked'",
        "UPDATE auth_sessions SET surface='developer'",
        "UPDATE auth_sessions SET mfa_verified_at=NULL",
        "UPDATE auth_sessions SET expires_at=now()-interval '1 second'",
        "UPDATE auth_sessions SET absolute_expires_at=now()-interval '1 second'",
        "UPDATE auth_sessions SET inactivity_expires_at=now()-interval '1 second'",
      ];
      for (const sql of revocations)
        await t.test(
          `revocation before and during unavailable read: ${sql}`,
          async () => {
            await reset();
            await pool.query(sql);
            await assert.rejects(
              service.searchScopes({ user, session, query: "" }),
              { statusCode: 403 },
            );
            await assert.rejects(
              service.read({ user, session, input: input() }),
              { statusCode: 403 },
            );
            await reset();
            const revoking = factory({
              pool,
              createReport: (options) => async (scope) => {
                const result =
                  await reportModule.createResourceInventoryReconciliationReport(
                    options,
                  )(scope);
                await pool.query(sql);
                return result;
              },
            });
            await assert.rejects(
              revoking.read({ user, session, input: input() }),
              { statusCode: 403 },
            );
          },
        );
      await reset();
      await t.test(
        "wrong session ownership and non-admin roles are rejected",
        async () => {
          await assert.rejects(
            service.read({ user, session: { _id: "2" }, input: input() }),
            { statusCode: 403 },
          );
          for (const role of [
            "customer",
            "vendor",
            "platform_release_observer",
          ])
            await assert.rejects(
              service.searchScopes({
                user: { ...user, roles: [role] },
                session,
                query: "",
              }),
              { statusCode: 403 },
            );
        },
      );
    } finally {
      await pool.query(`DROP SCHEMA ${schema} CASCADE`);
      await pool.end();
    }
  },
);
