const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const databaseUrl = process.env.AI_POLICY_TEST_DATABASE_URL;
test(
  "PostgreSQL AI policy authority, concurrency, audit and disable boundary",
  { skip: !databaseUrl },
  async (t) => {
    const url = new URL(databaseUrl);
    assert.equal(url.hostname, "127.0.0.1");
    assert.ok(
      ["/getprio_ai_policy_test", "/getprio_test"].includes(url.pathname),
    );
    const { Pool } = require("pg");
    const schema = `ai_policy_${randomUUID().replaceAll("-", "")}`;
    const pool = new Pool({
      connectionString: databaseUrl,
      options: `-c search_path=${schema}`,
      application_name: schema,
      max: 8,
    });
    const fakeDb = {
      pool,
      withTransaction: async (callback) => {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const result = await callback(client);
          await client.query("COMMIT");
          return result;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      },
    };
    const dbPath = require.resolve("../src/config/db");
    const originalDb = require.cache[dbPath];
    require.cache[dbPath] = {
      id: dbPath,
      filename: dbPath,
      loaded: true,
      exports: fakeDb,
    };
    const service = require("../src/services/platformAiInferenceService");
    const user = { _id: "1", roles: ["platform_admin"] };
    const session = {
      _id: "1",
      primaryAuthenticatedAt: new Date(),
      mfaVerifiedAt: new Date(),
    };
    const draft = {
      requestedMode: "private_shadow",
      timeoutMs: 100,
      freshnessMs: 1000,
      pilots: [
        { tenantId: "1", locationId: "10", requestedMode: "private_shadow" },
      ],
    };
    const reason = "Review private pilot controls";
    async function preview(policy = draft, auditReason = reason) {
      return service.preview({
        user,
        session,
        draft: policy,
        reason: auditReason,
      });
    }
    function save(p, extra = {}) {
      return service.update({
        user,
        session,
        draft: p.policy,
        reason,
        expectedRevision: p.revision,
        confirmationToken: p.confirmation.token,
        operationKey: randomUUID(),
        ...extra,
      });
    }
    async function waitForLock(fragment) {
      for (let i = 0; i < 200; i++) {
        const result = await pool.query(
          `SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock' AND query LIKE $2`,
          [schema, `%${fragment}%`],
        );
        if (result.rows.length) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.fail(`Expected lock wait: ${fragment}`);
    }
    try {
      await pool.query(`CREATE SCHEMA ${schema}`);
      await pool.query(`CREATE TABLE users(id BIGINT PRIMARY KEY,roles TEXT[],deletion_requested_at TIMESTAMPTZ,platform_access_suspended_at TIMESTAMPTZ,mfa_enabled BOOLEAN);
      CREATE TABLE tenants(id BIGINT PRIMARY KEY,name TEXT);
      CREATE TABLE store_locations(id BIGINT PRIMARY KEY,tenant_id BIGINT,name TEXT);
      CREATE TABLE auth_sessions(id BIGINT PRIMARY KEY,user_id BIGINT,status TEXT,surface TEXT,primary_authenticated_at TIMESTAMPTZ,mfa_verified_at TIMESTAMPTZ,expires_at TIMESTAMPTZ,absolute_expires_at TIMESTAMPTZ,inactivity_expires_at TIMESTAMPTZ);
      CREATE TABLE tickets(id BIGINT PRIMARY KEY,status TEXT);
      CREATE TABLE resource_allocations(id BIGINT PRIMARY KEY,released_at TIMESTAMPTZ);
      INSERT INTO users VALUES(1,ARRAY['platform_admin'],NULL,NULL,TRUE);
      INSERT INTO tenants VALUES(1,'Test vendor'); INSERT INTO store_locations VALUES(10,1,'Test location');
      INSERT INTO auth_sessions VALUES(1,1,'active','app',clock_timestamp(),clock_timestamp(),clock_timestamp()+interval '1 hour',NULL,NULL);
      INSERT INTO tickets VALUES(1,'waiting'); INSERT INTO resource_allocations VALUES(1,NULL);`);
      for (const migration of [
        "20260804_02_add_mfa_and_privileged_confirmations.sql",
        "20260804_04_add_idempotency_and_security_audit.sql",
        "20261012_add_ai_inference_policy.sql",
      ]) {
        await pool.query(
          fs.readFileSync(
            path.resolve(__dirname, "../../database/migrations", migration),
            "utf8",
          ),
        );
      }
      await t.test(
        "disabled defaults and truthful empty diagnostics",
        async () => {
          const status = await service.read(user);
          assert.equal(status.policy.requestedMode, "off");
          assert.equal(status.effectiveMode, "off");
          assert.equal(status.capture.status, "not_integrated");
          assert.equal(status.diagnostics.lastEvidenceAt, null);
          await assert.rejects(
            service.read({ roles: ["customer"] }),
            /permission/,
          );
          assert.equal(
            (await service.searchScopes(user, "Test")).scopes[0].locationId,
            "10",
          );
          assert.equal(
            (await service.searchScopes(user, "no-match")).scopes.length,
            0,
          );
          await assert.rejects(
            service.searchScopes({ roles: ["customer"] }, "Test"),
            /permission/,
          );
          const boundary = service.createBoundary({
            authorize: async () => true,
          });
          assert.equal(
            (await boundary.admit({ tenantId: "1", locationId: "10" })).allowed,
            false,
          );
          await assert.rejects(
            service
              .createBoundary({ authorize: async () => false })
              .admit({ tenantId: "1", locationId: "10" }),
            /denied/,
          );
        },
      );
      await t.test(
        "concurrent idempotent retry saves one policy/audit/receipt",
        async () => {
          const p = await preview(),
            operationKey = randomUUID();
          const results = await Promise.all([
            save(p, { operationKey }),
            save(p, { operationKey }),
          ]);
          assert.deepEqual(
            JSON.parse(JSON.stringify(results[0])),
            JSON.parse(JSON.stringify(results[1])),
          );
          assert.equal(results[0].policy.revision, "2");
          assert.equal(results[0].effectiveMode, "off");
          assert.equal(
            (
              await pool.query(
                "SELECT COUNT(*)::int AS count FROM security_audit_events",
              )
            ).rows[0].count,
            1,
          );
          await assert.rejects(
            save(p, { operationKey, draft: { ...draft, timeoutMs: 101 } }),
            /already used/,
          );
          await assert.rejects(save(p), /policy changed/);
        },
      );
      await t.test(
        "scope mismatch and audit failure leave confirmation/policy intact",
        async () => {
          const mismatch = await preview({
            ...draft,
            pilots: [{ tenantId: "2", locationId: "10", requestedMode: "off" }],
          });
          await assert.rejects(save(mismatch), /does not belong/);
          const p = await preview();
          await pool.query(
            "ALTER TABLE security_audit_events ADD CONSTRAINT test_audit_failure CHECK (action_key <> 'platform.ai_inference.policy.update') NOT VALID",
          );
          await assert.rejects(save(p), /test_audit_failure/);
          assert.equal((await service.read(user)).policy.revision, "2");
          const confirmation = (
            await pool.query(
              "SELECT used_at FROM privileged_transaction_confirmations WHERE preview_revision=$1 ORDER BY id DESC LIMIT 1",
              [p.revision],
            )
          ).rows[0];
          assert.equal(confirmation.used_at, null);
          await pool.query(
            "ALTER TABLE security_audit_events DROP CONSTRAINT test_audit_failure",
          );
          await save(p);
        },
      );
      await t.test(
        "authority revoked before locks is rejected, including idempotent replay",
        async () => {
          const p = await preview(),
            operationKey = randomUUID();
          await save(p, { operationKey });
          for (const [table, statement, restore, fragment] of [
            [
              "users",
              "UPDATE users SET roles=ARRAY['customer'] WHERE id=1",
              "UPDATE users SET roles=ARRAY['platform_admin'] WHERE id=1",
              "FROM users",
            ],
            [
              "auth_sessions",
              "UPDATE auth_sessions SET status='revoked' WHERE id=1",
              "UPDATE auth_sessions SET status='active' WHERE id=1",
              "FROM auth_sessions",
            ],
          ]) {
            const revoker = await pool.connect();
            try {
              await revoker.query("BEGIN");
              await revoker.query(statement);
              const blocked = save(p, { operationKey });
              const checked = assert.rejects(
                blocked,
                /permission|no longer active/,
              );
              await waitForLock(fragment);
              await revoker.query("COMMIT");
              await checked;
              await pool.query(restore);
            } finally {
              await revoker.query("ROLLBACK");
              revoker.release();
            }
            assert.ok(table);
          }
          await pool.query(
            "UPDATE users SET platform_access_suspended_at=clock_timestamp() WHERE id=1",
          );
          await assert.rejects(save(p, { operationKey }), /authority/);
          await pool.query(
            "UPDATE users SET platform_access_suspended_at=NULL WHERE id=1",
          );
          await pool.query(
            "UPDATE auth_sessions SET mfa_verified_at=clock_timestamp()-interval '11 minutes' WHERE id=1",
          );
          await assert.rejects(save(p, { operationKey }), /security code/);
          await pool.query(
            "UPDATE auth_sessions SET mfa_verified_at=clock_timestamp() WHERE id=1",
          );
          await pool.query(
            "UPDATE auth_sessions SET expires_at=clock_timestamp()-interval '1 minute' WHERE id=1",
          );
          await assert.rejects(save(p, { operationKey }), /expired/);
          await pool.query(
            "UPDATE auth_sessions SET expires_at=clock_timestamp()+interval '1 hour' WHERE id=1",
          );
        },
      );
      await t.test(
        "acceptance share lock serializes global disable; no operational rows change",
        async () => {
          const p = await preview({ ...draft, requestedMode: "off" });
          const acceptance = await pool.connect();
          try {
            await acceptance.query("BEGIN");
            const boundary = service.createBoundary({
              authorize: async () => true,
            });
            assert.equal(
              await boundary.accept(
                {
                  scope: { tenantId: "1", locationId: "10" },
                  allowed: true,
                  revision: p.revision,
                },
                acceptance,
              ),
              false,
            );
            const disabling = save(p);
            await waitForLock("FROM ai_inference_policy");
            await acceptance.query("COMMIT");
            const result = await disabling;
            assert.equal(result.policy.requestedMode, "off");
            assert.equal(result.pilots[0].effectiveMode, "off");
          } finally {
            await acceptance.query("ROLLBACK");
            acceptance.release();
          }
          assert.equal(
            (await pool.query("SELECT status FROM tickets WHERE id=1")).rows[0]
              .status,
            "waiting",
          );
          assert.equal(
            (
              await pool.query(
                "SELECT released_at FROM resource_allocations WHERE id=1",
              )
            ).rows[0].released_at,
            null,
          );
        },
      );
    } finally {
      await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await pool.end();
      if (originalDb) require.cache[dbPath] = originalDb;
      else delete require.cache[dbPath];
    }
  },
);
