const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { createTenantQueueSettingsService } = require("../src/services/tenantQueueSettingsService");
const ledger = require("../src/repositories/resourceLedger");
const databaseUrl = process.env.RESOURCE_LEDGER_TEST_DATABASE_URL;

test("tenant settings and branch revisions are atomic on PostgreSQL", { skip: !databaseUrl }, async t => {
  const url = new URL(databaseUrl);
  assert.equal(url.hostname, "127.0.0.1");
  assert.ok(["/getprio_test", "/getprio_ledger_test"].includes(url.pathname));
  const schema = `tenant_settings_${randomUUID().replaceAll("-", "")}`;
  const { Pool } = require("pg");
  const pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema} -c statement_timeout=5000`, application_name: schema, max: 8 });
  let fault = null;
  let barrier = null;
  const wrappedPool = { connect: async () => {
    const client = await pool.connect();
    return { release: () => client.release(), query: async (sql, args) => {
      if (fault === "rollback_completion" && sql === "COMMIT") return client.query("ROLLBACK");
      if (fault && sql.includes(fault)) throw new Error("settings fault");
      const result = await client.query(sql, args);
      if (barrier && sql.includes(barrier.marker)) { barrier.reached(); await barrier.pending; }
      return result;
    } };
  } };
  const resolveLocation = async (tenant, slug, { client }) => {
    const { rows } = await client.query("SELECT id::text AS id FROM store_locations WHERE tenant_id=$1 AND slug=$2", [tenant._id, slug || "main"]);
    if (!rows[0]) return null;
    return { _id: rows[0].id };
  };
  const service = createTenantQueueSettingsService({ pool: wrappedPool });
  const context = { tenantId: "1", actorId: "1", locationSlug: "main", resolveLocation };
  const save = (tenantChanges = {}, ownerChanges = {}, overrides = {}) => service.update({ ...context, ...overrides,
    prepare: async (tenant, actor) => ({ tenantChanges, ownerChanges: { name: actor.name, displayName: actor.displayName || null, ...ownerChanges } }) });
  const revisions = async () => (await pool.query("SELECT location_id::text,revision::text FROM resource_ledger_scopes ORDER BY location_id")).rows;
  const columns = (repository, constant, types) => {
    const source = fs.readFileSync(path.resolve(__dirname, `../src/repositories/${repository}.js`), "utf8");
    return source.match(new RegExp(`const ${constant} = \x60([\\s\\S]*?)\x60;`))[1].split(",")
      .map(value => value.trim().replace(`${repository}.`, "")).map(name => `${name} ${types[name] || "TEXT"}`).join(",");
  };
  const tenantTypes = { id: "BIGINT PRIMARY KEY", average_service_minutes: "INTEGER", notification_threshold: "INTEGER",
    auto_pause_enabled: "BOOLEAN", auto_pause_threshold: "INTEGER", auto_resume_enabled: "BOOLEAN", auto_resume_vacancy_percent: "INTEGER",
    is_active: "BOOLEAN", business_category_id: "BIGINT" };
  const locationColumns = columns("storeLocations", "LOCATION_COLUMNS", { id: "BIGINT", tenant_id: "BIGINT" })
    .split(",").filter(column => !["id", "tenant_id", "slug"].includes(column.trim().split(" ")[0])).join(",");
  const userTypes = { id: "BIGINT PRIMARY KEY", roles: "TEXT[]", email_verified: "BOOLEAN", deletion_requested_at: "TIMESTAMPTZ", platform_access_suspended_at: "TIMESTAMPTZ" };
  async function reset() {
    fault = null; barrier = null;
    await pool.query(`TRUNCATE users,tenants,store_locations,tenant_memberships,tenant_membership_locations,oauth_accounts,resource_ledger_scopes,resource_allocations CASCADE;
      INSERT INTO users(id,name,display_name,roles,email,email_verified) VALUES(1,'Owner',NULL,'{}','owner@example.test',TRUE),(2,'Staff',NULL,'{}','staff@example.test',TRUE);
      INSERT INTO tenants(id,name,slug,queue_prefix,average_service_minutes,notification_threshold,auto_pause_enabled,auto_resume_enabled,is_active)
      VALUES(1,'Studio','studio','P',5,3,FALSE,FALSE,TRUE),(2,'Other','other','O',7,3,FALSE,FALSE,TRUE);
      INSERT INTO store_locations VALUES(10,1,'main'),(11,1,'branch'),(20,2,'main');
      INSERT INTO tenant_memberships VALUES(1,1,1,'owner',TRUE),(2,1,2,'owner',TRUE),(3,2,1,'staff',TRUE);
      INSERT INTO resource_ledger_scopes(tenant_id,location_id) VALUES(1,10),(1,11),(2,20);
      INSERT INTO resource_allocations VALUES(1,1,10,'held');`);
  }
  async function transaction() { const client = await pool.connect(); await client.query("BEGIN"); return client; }
  async function waiter(fragment) {
    for (let attempt = 0; attempt < 300; attempt++) {
      const result = await pool.query("SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock' AND query LIKE $2", [schema, `%${fragment}%`]);
      if (result.rowCount) return;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.fail(`No lock waiter for ${fragment}`);
  }
  function hold(marker) {
    let reached, release;
    const entered = new Promise(resolve => reached = resolve);
    const pending = new Promise(resolve => release = resolve);
    barrier = { marker, reached, pending };
    return { entered, release: () => { barrier = null; release(); } };
  }
  try {
    await pool.query(`CREATE SCHEMA ${schema};
      CREATE TABLE users(${columns("users", "USER_COLUMNS", userTypes)});
      CREATE TABLE tenants(${columns("tenants", "TENANT_COLUMNS", tenantTypes)});
      CREATE TABLE store_locations(id BIGINT PRIMARY KEY,tenant_id BIGINT REFERENCES tenants(id),slug TEXT,${locationColumns});
      CREATE TABLE tenant_memberships(id BIGINT PRIMARY KEY,user_id BIGINT REFERENCES users(id),tenant_id BIGINT REFERENCES tenants(id),role TEXT,is_active BOOLEAN);
      CREATE TABLE tenant_membership_locations(tenant_membership_id BIGINT,location_id BIGINT,assignment_source TEXT,assigned_by_user_id BIGINT);
      CREATE TABLE oauth_accounts(user_id BIGINT,provider TEXT,provider_user_id TEXT,email TEXT,email_verified BOOLEAN,linked_at TIMESTAMPTZ);
      CREATE TABLE resource_ledger_scopes(tenant_id BIGINT,location_id BIGINT,revision BIGINT DEFAULT 1,tracking_enabled BOOLEAN DEFAULT FALSE,writer_coverage_complete BOOLEAN DEFAULT FALSE,UNIQUE(tenant_id,location_id));
      CREATE TABLE resource_allocations(id BIGINT,tenant_id BIGINT,location_id BIGINT,state TEXT);`);
    await t.test("policy updates advance every owned branch once and preserve held work", async () => {
      await reset(); const result = await save({ queuePrefix: "AB", averageServiceMinutes: 15 }, { name: "Updated" });
      assert.equal(result.tenant.queuePrefix, "AB"); assert.equal(result.owner.name, "Updated");
      assert.deepEqual(await revisions(), [{ location_id: "10", revision: "2" }, { location_id: "11", revision: "2" }, { location_id: "20", revision: "1" }]);
      assert.equal((await pool.query("SELECT state FROM resource_allocations")).rows[0].state, "held");
      assert.equal((await pool.query("SELECT 1 FROM resource_ledger_scopes WHERE tracking_enabled OR writer_coverage_complete")).rowCount, 0);
    });
    await t.test("identical policy, profile-only and notification-only saves do not advance revisions", async () => {
      await reset(); await save({ queuePrefix: "P", averageServiceMinutes: 5 });
      await save({ name: "Renamed", notificationThreshold: 9 }, { displayName: "Owner Display" });
      assert.deepEqual((await revisions()).map(row => row.revision), ["1", "1", "1"]);
    });
    for (const stage of ["UPDATE tenants", "UPDATE users", "UPDATE resource_ledger_scopes", "COMMIT", "rollback_completion"]) {
      await t.test(`failure at ${stage} rolls back tenant profile and revisions`, async () => {
        await reset(); fault = stage;
        await assert.rejects(save({ averageServiceMinutes: 20 }, { name: "Wrong" })); fault = null;
        assert.equal((await pool.query("SELECT average_service_minutes FROM tenants WHERE id=1")).rows[0].average_service_minutes, 5);
        assert.equal((await pool.query("SELECT name FROM users WHERE id=1")).rows[0].name, "Owner");
        assert.deepEqual((await revisions()).map(row => row.revision), ["1", "1", "1"]);
      });
    }
    await t.test("revocation after branch lock wait rejects the write", async () => {
      await reset(); const blocker = await transaction();
      try {
        await blocker.query("SELECT id FROM store_locations WHERE id=10 FOR UPDATE");
        const pending = save({ averageServiceMinutes: 20 }); const rejected = assert.rejects(pending, { statusCode: 403 });
        await waiter("ORDER BY store_locations.id FOR NO KEY UPDATE");
        await pool.query("UPDATE users SET platform_access_suspended_at=NOW() WHERE id=1");
        await blocker.query("COMMIT"); await rejected;
        assert.deepEqual((await revisions()).map(row => row.revision), ["1", "1", "1"]);
      } finally { await blocker.query("ROLLBACK"); blocker.release(); }
    });
    await t.test("contact permissions are rechecked but ordinary admin queue edits remain allowed", async () => {
      await reset(); await pool.query("UPDATE tenant_memberships SET role='admin' WHERE id=1");
      await assert.rejects(save({ name: "Denied" }, {}, { requiresContactPermission: true }), { statusCode: 403 });
      await save({ averageServiceMinutes: 9 });
      assert.equal((await revisions())[0].revision, "2");
    });
    await t.test("tenant and actor fallbacks are read after lock waits without stale overwrite", async () => {
      await reset(); const blocker = await transaction();
      try {
        await blocker.query("SELECT id FROM tenants WHERE id=1 FOR UPDATE");
        const pending = service.update({ ...context, prepare: async (tenant, actor) => ({
          tenantChanges: { name: tenant.name, averageServiceMinutes: 12 }, ownerChanges: { name: actor.name } }) });
        await waiter("SELECT id FROM tenants WHERE id=$1 FOR UPDATE");
        await blocker.query("UPDATE tenants SET name='Fresh' WHERE id=1");
        await blocker.query("UPDATE users SET name='Fresh Owner' WHERE id=1");
        await blocker.query("COMMIT"); const result = await pending;
        assert.equal(result.tenant.name, "Fresh"); assert.equal(result.owner.name, "Fresh Owner");
      } finally { await blocker.query("ROLLBACK"); blocker.release(); }
    });
    await t.test("branch insertion during discovery rejects then reloads to include new scope", async () => {
      await reset(); const blocker = await transaction();
      try {
        await blocker.query("SELECT id FROM tenants WHERE id=1 FOR UPDATE");
        const pending = save({ averageServiceMinutes: 12 }); const rejected = assert.rejects(pending, { statusCode: 409 });
        await waiter("SELECT id FROM tenants WHERE id=$1 FOR UPDATE");
        await blocker.query("INSERT INTO store_locations VALUES(12,1,'new')"); await blocker.query("COMMIT"); await rejected;
        assert.equal((await pool.query("SELECT average_service_minutes FROM tenants WHERE id=1")).rows[0].average_service_minutes, 5);
        await save({ averageServiceMinutes: 12 });
        assert.deepEqual((await revisions()).map(row => row.revision), ["2", "2", "2", "1"]);
      } finally { await blocker.query("ROLLBACK"); blocker.release(); }
    });
    await t.test("same-user cross-tenant profile writes serialize without a SHARE upgrade cycle", async () => {
      await reset(); const gate = hold("SELECT id FROM users WHERE id=$1 FOR NO KEY UPDATE");
      const first = save({ averageServiceMinutes: 12 }, { name: "First" }); await gate.entered;
      const second = save({ averageServiceMinutes: 14 }, {}, { tenantId: "2" });
      await waiter("SELECT id FROM users WHERE id=$1 FOR NO KEY UPDATE"); gate.release();
      const results = await Promise.all([first, second]);
      assert.equal(results[1].owner.name, "First");
      assert.deepEqual((await revisions()).map(row => row.revision), ["2", "2", "2"]);
    });
    await t.test("scope writer waits observe matching settings and ledger revisions", async () => {
      await reset(); const gate = hold("UPDATE tenants");
      const settings = save({ averageServiceMinutes: 18 }); await gate.entered;
      const observed = ledger.withScopeTransaction({ pool, tenantId: "1", locationId: "10", actorUserId: "1", authorize: async () => true },
        async client => (await client.query("SELECT t.average_service_minutes,s.revision::text FROM tenants t JOIN resource_ledger_scopes s ON s.tenant_id=t.id WHERE s.location_id=10")).rows[0]);
      await waiter("FROM store_locations"); gate.release(); await settings;
      assert.deepEqual(await observed, { average_service_minutes: 18, revision: "2" });
    });
    await t.test("all intake-policy fields invalidate once while empty vendors invent no scopes", async () => {
      for (const changes of [{ autoPauseEnabled: true, autoPauseThreshold: 6 }, { autoResumeEnabled: true, autoResumeVacancyPercent: 20 }]) {
        await reset(); await save(changes); await save(changes);
        assert.deepEqual((await revisions()).map(row => row.revision), ["2", "2", "1"]);
      }
      await reset(); await pool.query("DELETE FROM resource_ledger_scopes WHERE tenant_id=2; DELETE FROM store_locations WHERE tenant_id=2");
      await save({ averageServiceMinutes: 14 }, {}, { tenantId: "2", locationSlug: undefined });
      assert.deepEqual((await revisions()).map(row => row.revision), ["1", "1"]);
    });
    await t.test("foreign selected locations are rejected before mutation", async () => {
      await reset();
      await assert.rejects(save({ averageServiceMinutes: 19 }, {}, { resolveLocation: async () => ({ _id: "20" }) }), { statusCode: 404 });
      assert.deepEqual((await revisions()).map(row => row.revision), ["1", "1", "1"]);
    });
    await t.test("accepted membership remains locked through policy profile and revision commit", async () => {
      await reset(); const gate = hold("UPDATE tenants");
      const settings = save({ averageServiceMinutes: 16 }); await gate.entered;
      const revoke = pool.query("UPDATE tenant_memberships SET is_active=FALSE WHERE id=1");
      await waiter("UPDATE tenant_memberships"); gate.release(); await settings; await revoke;
      assert.equal((await revisions())[0].revision, "2");
      await assert.rejects(save({ averageServiceMinutes: 17 }), { statusCode: 403 });
    });
    await t.test("a prior scoped reader completes before the settings writer advances", async () => {
      await reset(); let reached, release;
      const entered = new Promise(resolve => reached = resolve);
      const pending = new Promise(resolve => release = resolve);
      const observed = ledger.withScopeTransaction({ pool, tenantId: "1", locationId: "10", actorUserId: "1", authorize: async () => true }, async client => {
        const row = (await client.query("SELECT t.average_service_minutes,s.revision::text FROM tenants t JOIN resource_ledger_scopes s ON s.tenant_id=t.id WHERE s.location_id=10")).rows[0];
        reached(); await pending; return row;
      });
      await entered; const settings = save({ averageServiceMinutes: 19 });
      await waiter("ORDER BY store_locations.id FOR NO KEY UPDATE"); release();
      assert.deepEqual(await observed, { average_service_minutes: 5, revision: "1" });
      await settings; assert.equal((await revisions())[0].revision, "2");
    });
    await t.test("exact bigint tenant and actor identities use the caller's transaction", async () => {
      await reset();
      await pool.query(`INSERT INTO users(id,name,roles,email,email_verified) VALUES
        (9007199254740993,'Big Owner','{}','big@example.test',TRUE),(9007199254740992,'Neighbor','{}','neighbor@example.test',TRUE);
        INSERT INTO tenants(id,name,slug,queue_prefix,average_service_minutes,auto_pause_enabled,auto_resume_enabled)
        VALUES(9007199254740995,'Big','big','B',5,FALSE,FALSE),(9007199254740994,'Neighbor','neighbor','N',7,FALSE,FALSE);
        INSERT INTO store_locations VALUES(9007199254740997,9007199254740995,'main'),(9007199254740996,9007199254740994,'main');
        INSERT INTO tenant_memberships VALUES(4,9007199254740993,9007199254740995,'owner',TRUE);`);
      const result = await save({ averageServiceMinutes: 17 }, { name: "Exact" }, { tenantId: "9007199254740995", actorId: "9007199254740993", locationSlug: undefined,
        resolveLocation: (tenant, _slug, options) => require("../src/repositories/storeLocations").findPrimaryLocationByTenantId(tenant._id, options) });
      assert.equal(result.tenant._id, "9007199254740995"); assert.equal(result.owner._id, "9007199254740993");
      assert.equal((await pool.query("SELECT average_service_minutes FROM tenants WHERE id=9007199254740994")).rows[0].average_service_minutes, 7);
      assert.equal((await pool.query("SELECT name FROM users WHERE id=9007199254740992")).rows[0].name, "Neighbor");
      await assert.rejects(save({}, {}, { tenantId: Number("9007199254740995") }), { statusCode: 400 });
      const client = await transaction();
      try {
        const user = await require("../src/repositories/users").updateUser("9007199254740993", { avatarUrl: "https://example.test/avatar.png" }, { client });
        assert.equal(user.avatarUrl, "https://example.test/avatar.png");
        await client.query("ROLLBACK");
        assert.equal((await pool.query("SELECT avatar_url FROM users WHERE id=9007199254740993")).rows[0].avatar_url, null);
      } finally { await client.query("ROLLBACK"); client.release(); }
    });
  } finally { await pool.query(`DROP SCHEMA ${schema} CASCADE`); await pool.end(); }
});
