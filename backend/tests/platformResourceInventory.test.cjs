const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { randomUUID } = require("node:crypto");
const express = require("express");
const { rateLimit } = require("express-rate-limit");
const { createCsrfProtection } = require("../src/middleware/csrfProtection");
const {
  LOCAL_ACCESS_COOKIE,
  CSRF_COOKIE,
  signCsrfToken,
} = require("../src/services/browserSessionService");
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
test("resource HTTP route denies non-admin roles, accepts only protected scalar body scope/window and disables caching", async () => {
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
  app.use(rateLimit({ windowMs: 60000, limit: 120 }));
  app.use(express.json());
  app.use(
    createCsrfProtection({
      allowedOrigins: ["https://platform.getprio.online"],
      csrfSecret: "resource-test",
      authCookieSecure: false,
    }),
  );
  app.use((req, _res, next) => {
    req.user = { _id: "1", roles: [req.get("x-test-role")] };
    req.auth = { session: { _id: "1" } };
    next();
  });
  app.use("/resource", module.exports);
  app.use((error, _req, res, _next) =>
    res
      .status(error.statusCode || 500)
      .json({ message: error.message, code: error.code }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const root = `http://127.0.0.1:${server.address().port}/resource`;
  const post = (role, body = {}) => ({
    method: "POST",
    headers: { "x-test-role": role, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  try {
    for (const role of [
      "customer",
      "vendor",
      "staff",
      "platform_release_observer",
    ])
      for (const path of ["/report", "/scopes"]) {
        const response = await fetch(root + path, post(role));
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
      const response = await fetch(
        `${root}/report?${query}`,
        post("platform_admin"),
      );
      assert.equal(response.status, 400);
      assert.equal(response.headers.get("cache-control"), "no-store");
    }
    for (const body of [
      { sourceBinding: "client" },
      { tenantId: ["1", "2"] },
      { limits: "1" },
      [],
    ])
      assert.equal(
        (await fetch(root + "/report", post("platform_admin", body))).status,
        400,
      );
    assert.equal(
      (await fetch(root + "/scopes?q=private", post("platform_admin"))).status,
      400,
    );
    assert.equal(
      (
        await fetch(
          root + "/scopes",
          post("platform_admin", { q: ["one", "two"] }),
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await fetch(root + "/report", {
          headers: { "x-test-role": "platform_admin" },
        })
      ).status,
      404,
    );
    assert.equal(calls.length, 0);
    const input = {
      tenantId: "1",
      locationId: "10",
      windowFrom: "2026-10-12T00:00:00Z",
      windowTo: "2026-10-12T01:00:00Z",
    };
    assert.equal(
      (await fetch(root + "/report", post("platform_admin", input))).status,
      200,
    );
    const csrfToken = signCsrfToken("1", "resource-test");
    for (const path of ["/report", "/scopes"]) {
      const request = post(
        "platform_admin",
        path === "/report" ? input : { q: "Vendor" },
      );
      request.headers.origin = "https://platform.getprio.online";
      request.headers.cookie = `${LOCAL_ACCESS_COOKIE}=local-session; ${CSRF_COOKIE}=${encodeURIComponent(csrfToken)}`;
      const before = calls.length;
      const denied = await fetch(root + path, request);
      assert.equal(denied.status, 403);
      assert.equal((await denied.json()).code, "CSRF_VALIDATION_FAILED");
      assert.equal(
        calls.length,
        before,
        "CSRF denial must not invoke private reads",
      );
      request.headers["x-csrf-token"] = csrfToken;
      assert.equal((await fetch(root + path, request)).status, 200);
    }
    assert.equal(calls[0].user._id, "1");
    assert.equal(calls[0].session._id, "1");
    assert.deepEqual(calls[0].input, input);
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
            { statusCode: 404, code: "resource_report_location_not_found" },
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
