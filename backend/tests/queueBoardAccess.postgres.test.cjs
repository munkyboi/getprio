const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");

test("queue board pairing is browser-bound, single-use, location scoped and revocable in PostgreSQL", { skip: !process.env.QUEUE_BOARD_TEST_DATABASE_URL }, async () => {
  const schema = `queue_board_test_${process.pid}`;
  const admin = new Pool({ connectionString: process.env.QUEUE_BOARD_TEST_DATABASE_URL });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new Pool({ connectionString: process.env.QUEUE_BOARD_TEST_DATABASE_URL, options: `-c search_path=${schema}`, max: 6 });
  const dbPath = require.resolve("../src/config/db");
  const original = require.cache[dbPath];
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
    pool, withTransaction: async (callback) => {
      const client = await pool.connect();
      try { await client.query("BEGIN"); const value = await callback(client); await client.query("COMMIT"); return value; }
      catch (error) { await client.query("ROLLBACK"); throw error; }
      finally { client.release(); }
    }
  } };
  const access = require("../src/services/queueBoardAccess");
  try {
    await pool.query(`CREATE TABLE users(id bigint PRIMARY KEY); INSERT INTO users VALUES(1);
      CREATE TABLE tenants(id bigint PRIMARY KEY,slug text,is_active boolean); INSERT INTO tenants VALUES(1,'test',true);
      CREATE TABLE store_locations(id bigint PRIMARY KEY,tenant_id bigint,name text,slug text,is_active boolean);
      INSERT INTO store_locations VALUES(1,1,'First','first',true),(2,1,'Second','second',true);`);
    const migration = fs.readFileSync(path.join(__dirname, "../../database/migrations/20261012_add_secure_queue_boards.sql"), "utf8");
    await pool.query(migration); await pool.query(migration);
    const settings = await access.settings(1);
    assert.equal(settings.isPublic, false);
    const board = await access.findBoard(settings.boardId);
    const secret = "a".repeat(64);
    assert.equal(await access.canRead(board, secret), false);
    const request = await access.requestPairing(board, secret);
    assert.equal(request.code.length, 32);
    assert.equal((await access.pairingForLocation(1, request.code)).match_code, request.matchCode);
    await assert.rejects(access.pairingForLocation(2, request.code), { statusCode: 404 });
    const concurrent = await Promise.allSettled([access.approve(1, request.code, "TV", 1), access.approve(1, request.code, "TV duplicate", 1)]);
    assert.equal(concurrent.filter((value) => value.status === "fulfilled").length, 1);
    assert.equal(await access.canRead(board, secret), true);
    assert.equal(await access.canRead(board, "b".repeat(64)), false);
    await assert.rejects(access.approve(1, request.code, "Replay", 1), { statusCode: 404 });
    const grant = (await access.settings(1)).displays[0];
    await assert.rejects(access.changeGrant(2, grant.id, false), { statusCode: 404 });
    await pool.query("UPDATE queue_board_display_grants SET expires_at=now()-interval '1 second'");
    assert.equal(await access.canRead(board, secret), false);
    await access.changeGrant(1, grant.id, true);
    assert.equal(await access.canRead(board, secret), true);
    await access.changeGrant(1, grant.id, false);
    assert.equal(await access.canRead(board, secret), false);
    await assert.rejects(access.changeGrant(1, grant.id, true), { statusCode: 404 });
    await access.updateSettings(1, true, false);
    assert.equal(await access.canRead(await access.findBoard(settings.boardId), ""), true);
    await access.updateSettings(1, false, false);
    assert.equal(await access.canRead(await access.findBoard(settings.boardId), ""), false);
    const expired = await access.requestPairing(board, secret);
    await pool.query("UPDATE queue_board_pairing_requests SET expires_at=now()-interval '1 second'");
    await assert.rejects(access.approve(1, expired.code, "Expired", 1), { statusCode: 404 });
    const rotating = await access.requestPairing(board, secret);
    const rotated = await access.updateSettings(1, undefined, true);
    assert.notEqual(rotated.boardId, settings.boardId);
    await assert.rejects(access.findBoard(settings.boardId), { statusCode: 404 });
    await assert.rejects(access.approve(1, rotating.code, "Old URL", 1), { statusCode: 404 });
    await assert.rejects(access.findBoard("bad-id"), { statusCode: 404 });
    const stored = await pool.query("SELECT secret_hash FROM queue_board_display_grants");
    assert.notEqual(stored.rows[0].secret_hash, secret);
  } finally {
    await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end();
    if (original) require.cache[dbPath] = original; else delete require.cache[dbPath];
  }
});
