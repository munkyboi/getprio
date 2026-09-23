const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { Pool } = require("pg");
const parseConnectionString = require("pg-connection-string");

const databaseUrl = process.env.DEVELOPER_DELETION_TEST_DATABASE_URL;

test("developer profile and queue deletion against disposable PostgreSQL", { skip: !databaseUrl }, async () => {
  const parsed = new URL(databaseUrl);
  assert.equal(parsed.pathname, "/getprio_developer_deletion_test", "Use only the disposable developer deletion database");
  const routingParameters = [
    "host", "port", "user", "password", "database", "dbname", "service",
    "ssl", "sslmode", "sslcert", "sslkey", "sslrootcert", "uselibpqcompat"
  ];
  assert.deepEqual(
    routingParameters.filter((name) => parsed.searchParams.has(name)),
    [],
    "The disposable database URL must not override connection routing through query parameters"
  );
  const effectiveConnection = parseConnectionString.parseIntoClientConfig(databaseUrl);
  assert.ok(["localhost", "127.0.0.1"].includes(effectiveConnection.host));
  assert.equal(effectiveConnection.database, "getprio_developer_deletion_test");

  const pool = new Pool({ connectionString: databaseUrl, ssl: false });
  const db = {
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
    }
  };
  const dbModulePath = require.resolve("../src/config/db");
  const queueModulePath = require.resolve("../src/repositories/developerQueues");
  const projectsModulePath = require.resolve("../src/repositories/developerProjects");
  const originalModules = new Map([
    [dbModulePath, require.cache[dbModulePath]],
    [queueModulePath, require.cache[queueModulePath]],
    [projectsModulePath, require.cache[projectsModulePath]]
  ]);
  delete require.cache[queueModulePath];
  delete require.cache[projectsModulePath];
  require.cache[dbModulePath] = {
    id: dbModulePath,
    filename: dbModulePath,
    loaded: true,
    exports: db
  };
  const suffix = crypto.randomUUID();
  const fixture = {};
  let developerQueues;
  let developerProjects;

  try {
    developerQueues = require("../src/repositories/developerQueues");
    developerProjects = require("../src/repositories/developerProjects");
    fixture.user = (await db.pool.query(
      `INSERT INTO users (name, username, email, email_verified)
       VALUES ($1, $2, $3, TRUE) RETURNING id`,
      ["Developer deletion fixture", `developer-deletion-${suffix}`, `${suffix}@example.invalid`]
    )).rows[0].id;
    fixture.account = (await db.pool.query(
      `INSERT INTO developer_accounts (owner_user_id) VALUES ($1) RETURNING id`,
      [fixture.user]
    )).rows[0].id;
    await db.pool.query(
      `INSERT INTO developer_account_memberships (developer_account_id, user_id, role)
       VALUES ($1, $2, 'owner')`,
      [fixture.account, fixture.user]
    );
    fixture.project = (await db.pool.query(
      `INSERT INTO developer_projects (developer_account_id, name, created_by_user_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [fixture.account, `Deletion fixture ${suffix}`, fixture.user]
    )).rows[0].id;
    fixture.profile = (await db.pool.query(
      `INSERT INTO developer_api_profiles
         (developer_project_id, environment, slug, display_name, created_by_user_id)
       VALUES ($1, 'sandbox', 'primary', 'Primary profile', $2) RETURNING id`,
      [fixture.project, fixture.user]
    )).rows[0].id;
    fixture.secondaryProfile = (await db.pool.query(
      `INSERT INTO developer_api_profiles
         (developer_project_id, environment, slug, display_name, created_by_user_id)
       VALUES ($1, 'sandbox', 'secondary', 'Secondary profile', $2) RETURNING id`,
      [fixture.project, fixture.user]
    )).rows[0].id;
    fixture.queue = (await db.pool.query(
      `INSERT INTO developer_api_queues (developer_api_profile_id, slug, display_name)
       VALUES ($1, 'main', 'Main queue') RETURNING id`,
      [fixture.profile]
    )).rows[0].id;

    fixture.selectedKey = (await db.pool.query(
      `INSERT INTO developer_api_keys
         (developer_project_id, name, environment, key_prefix, secret_hash, scopes, profile_slugs, created_by_user_id)
       VALUES ($1, 'Selected profile key', 'sandbox', 'dpk_test_selected', $2,
         ARRAY['profiles:read']::TEXT[], ARRAY['primary', 'secondary']::TEXT[], $3)
       RETURNING id`,
      [fixture.project, `selected-${suffix}`, fixture.user]
    )).rows[0].id;
    fixture.profileOnlyKey = (await db.pool.query(
      `INSERT INTO developer_api_keys
         (developer_project_id, name, environment, key_prefix, secret_hash, scopes, profile_slugs, created_by_user_id)
       VALUES ($1, 'Profile-only key', 'sandbox', 'dpk_test_profile_only', $2,
         ARRAY['profiles:read']::TEXT[], ARRAY['primary']::TEXT[], $3)
       RETURNING id`,
      [fixture.project, `profile-only-${suffix}`, fixture.user]
    )).rows[0].id;

    const keyChanges = await developerProjects.revokeKeysForDeletedProfile(fixture.project, "sandbox", "primary");
    assert.deepEqual(
      keyChanges.map(({ id, revoked, remainingProfileCount }) => ({ id, revoked, remainingProfileCount })).sort((a, b) => a.id.localeCompare(b.id)),
      [
        { id: String(fixture.profileOnlyKey), revoked: true, remainingProfileCount: 0 },
        { id: String(fixture.selectedKey), revoked: false, remainingProfileCount: 1 }
      ].sort((a, b) => a.id.localeCompare(b.id))
    );

    const selectedKey = (await db.pool.query(
      "SELECT status, profile_slugs FROM developer_api_keys WHERE id = $1",
      [fixture.selectedKey]
    )).rows[0];
    assert.equal(selectedKey.status, "active");
    assert.deepEqual(selectedKey.profile_slugs, ["secondary"]);
    const profileOnlyKey = (await db.pool.query(
      "SELECT status, profile_slugs, revoke_reason FROM developer_api_keys WHERE id = $1",
      [fixture.profileOnlyKey]
    )).rows[0];
    assert.equal(profileOnlyKey.status, "revoked");
    assert.equal(profileOnlyKey.profile_slugs, null);
    assert.equal(profileOnlyKey.revoke_reason, "profile deleted");

    const removedProfile = await developerQueues.deleteProfile(fixture.profile);
    assert.equal(removedProfile.slug, "primary");
    assert.equal((await db.pool.query("SELECT id FROM developer_api_queues WHERE id = $1", [fixture.queue])).rowCount, 0);
    assert.equal((await db.pool.query("SELECT id FROM developer_api_profiles WHERE id = $1", [fixture.profile])).rowCount, 0);

    fixture.historyProfile = (await db.pool.query(
      `INSERT INTO developer_api_profiles
         (developer_project_id, environment, slug, display_name, created_by_user_id)
       VALUES ($1, 'sandbox', 'history', 'History profile', $2) RETURNING id`,
      [fixture.project, fixture.user]
    )).rows[0].id;
    fixture.historyQueue = (await db.pool.query(
      `INSERT INTO developer_api_queues (developer_api_profile_id, slug, display_name)
       VALUES ($1, 'history', 'History queue') RETURNING id`,
      [fixture.historyProfile]
    )).rows[0].id;
    fixture.ticket = (await db.pool.query(
      `INSERT INTO developer_api_tickets
         (developer_project_id, environment, developer_api_profile_id, developer_api_queue_id,
          ticket_number, sequence, verification_code, status)
       VALUES ($1, 'sandbox', $2, $3, $4, 1, $5, 'served') RETURNING id`,
      [fixture.project, fixture.historyProfile, fixture.historyQueue, `H-${suffix}`, crypto.randomBytes(4).toString("hex").toUpperCase()]
    )).rows[0].id;
    fixture.historyKey = (await db.pool.query(
      `INSERT INTO developer_api_keys
         (developer_project_id, name, environment, key_prefix, secret_hash, scopes, profile_slugs, created_by_user_id)
       VALUES ($1, 'History profile key', 'sandbox', 'dpk_test_history', $2,
         ARRAY['profiles:read']::TEXT[], ARRAY['history']::TEXT[], $3)
       RETURNING id`,
      [fixture.project, `history-${suffix}`, fixture.user]
    )).rows[0].id;

    await assert.rejects(
      () => developerQueues.deleteQueue(fixture.historyQueue),
      (error) => error.code === "23503"
    );
    await assert.rejects(
      () => db.withTransaction(async (client) => {
        await developerProjects.revokeKeysForDeletedProfile(fixture.project, "sandbox", "history", { client });
        await developerQueues.deleteProfile(fixture.historyProfile, { client });
      }),
      (error) => error.code === "23503"
    );
    const historyKey = (await db.pool.query(
      "SELECT status, profile_slugs, revoked_at, revoke_reason FROM developer_api_keys WHERE id = $1",
      [fixture.historyKey]
    )).rows[0];
    assert.equal(historyKey.status, "active");
    assert.deepEqual(historyKey.profile_slugs, ["history"]);
    assert.equal(historyKey.revoked_at, null);
    assert.equal(historyKey.revoke_reason, null);
    assert.equal((await db.pool.query("SELECT id FROM developer_api_profiles WHERE id = $1", [fixture.historyProfile])).rowCount, 1);
    assert.equal((await db.pool.query("SELECT id FROM developer_api_queues WHERE id = $1", [fixture.historyQueue])).rowCount, 1);
  } finally {
    try {
      if (fixture.ticket) await db.pool.query("DELETE FROM developer_api_tickets WHERE id = $1", [fixture.ticket]);
      if (fixture.project) await db.pool.query("DELETE FROM developer_projects WHERE id = $1", [fixture.project]);
      if (fixture.account) await db.pool.query("DELETE FROM developer_accounts WHERE id = $1", [fixture.account]);
      if (fixture.user) await db.pool.query("DELETE FROM users WHERE id = $1", [fixture.user]);
    } finally {
      await db.pool.end();
      for (const [modulePath, originalModule] of originalModules) {
        if (originalModule) require.cache[modulePath] = originalModule;
        else delete require.cache[modulePath];
      }
    }
  }
});
