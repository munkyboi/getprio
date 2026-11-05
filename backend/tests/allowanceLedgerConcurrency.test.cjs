const test = require("node:test");
const assert = require("node:assert/strict");
const { Pool } = require("pg");

const db = require("../src/config/db");
const env = require("../src/config/env");
const allowanceLedger = require("../src/repositories/allowanceLedger");

function getTestDatabaseUrl() {
  const databaseUrl = process.env.ALLOWANCE_TEST_DATABASE_URL || env.databaseUrl;
  if (!databaseUrl) return null;
  const hostname = new URL(databaseUrl).hostname;
  if (process.env.ALLOWANCE_TEST_DATABASE_URL || ["127.0.0.1", "localhost", "::1"].includes(hostname)) {
    return databaseUrl;
  }
  return null;
}

async function createSchema(pool, schema) {
  await pool.query(`CREATE SCHEMA ${schema}`);
  await pool.query(`
    CREATE TABLE ${schema}.usage_accounts (
      id BIGSERIAL PRIMARY KEY,
      tenant_id BIGINT NOT NULL,
      resource_key TEXT NOT NULL,
      UNIQUE (tenant_id, resource_key)
    );
    CREATE TABLE ${schema}.subscription_allowance_periods (
      id BIGSERIAL PRIMARY KEY,
      subscription_id BIGINT NOT NULL,
      period_start TIMESTAMPTZ NOT NULL,
      period_end TIMESTAMPTZ NOT NULL,
      UNIQUE (subscription_id, period_start)
    );
    CREATE TABLE ${schema}.allowance_operations (
      id BIGSERIAL PRIMARY KEY,
      usage_account_id BIGINT NOT NULL,
      allowance_period_id BIGINT,
      operation_key TEXT NOT NULL,
      operation_type TEXT NOT NULL,
      signed_units INTEGER NOT NULL,
      subject_type TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      actor_user_id BIGINT,
      reason TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      reverses_operation_id BIGINT,
      UNIQUE (usage_account_id, operation_key)
    );
    CREATE TABLE ${schema}.allowance_allocations (
      id BIGSERIAL PRIMARY KEY,
      operation_id BIGINT NOT NULL,
      source_type TEXT NOT NULL,
      allowance_period_id BIGINT,
      credit_lot_id BIGINT,
      units INTEGER NOT NULL
    );
    CREATE TABLE ${schema}.usage_credit_lots (
      id BIGSERIAL PRIMARY KEY,
      tenant_id BIGINT NOT NULL,
      resource_key TEXT NOT NULL,
      granted_units INTEGER NOT NULL,
      revoked_units INTEGER NOT NULL DEFAULT 0,
      frozen_units INTEGER NOT NULL DEFAULT 0,
      source_type TEXT NOT NULL,
      status TEXT NOT NULL,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE ${schema}.allowance_reservations (
      id BIGSERIAL PRIMARY KEY,
      usage_account_id BIGINT NOT NULL,
      allowance_period_id BIGINT,
      reservation_key TEXT NOT NULL,
      subject_type TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      units INTEGER NOT NULL,
      status TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      committed_operation_id BIGINT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (usage_account_id, reservation_key)
    );
    CREATE TABLE ${schema}.allowance_reservation_allocations (
      id BIGSERIAL PRIMARY KEY,
      reservation_id BIGINT NOT NULL,
      source_type TEXT NOT NULL,
      allowance_period_id BIGINT,
      credit_lot_id BIGINT,
      units INTEGER NOT NULL
    );
    CREATE TABLE ${schema}.allowance_warning_claims (
      id BIGSERIAL PRIMARY KEY,
      usage_account_id BIGINT NOT NULL,
      allowance_period_id BIGINT NOT NULL,
      threshold_percent INTEGER NOT NULL,
      UNIQUE (usage_account_id, allowance_period_id, threshold_percent)
    );
  `);
}

test("concurrent reservation and consumption cannot overbook the final Queue Ticket unit", async (t) => {
  const databaseUrl = getTestDatabaseUrl();
  if (!databaseUrl) {
    t.skip("Set ALLOWANCE_TEST_DATABASE_URL to run the PostgreSQL concurrency test.");
    return;
  }

  const schema = `allowance_race_${process.pid}_${Date.now()}`;
  const adminPool = new Pool({ connectionString: databaseUrl });
  const testPool = new Pool({
    connectionString: databaseUrl,
    max: 20,
    options: `-c search_path=${schema}`
  });
  const originalWithTransaction = db.withTransaction;

  try {
    await createSchema(adminPool, schema);
    db.withTransaction = async (callback) => {
      const client = await testPool.connect();
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
    };

    const periodStart = new Date("2026-08-01T00:00:00.000Z");
    const periodEnd = new Date("2026-09-01T00:00:00.000Z");
    const expiresAt = new Date("2099-01-01T00:00:00.000Z");
    const attempts = await Promise.all(
      Array.from({ length: 50 }, (_, index) => allowanceLedger.reserve({
        tenantId: 1,
        subscriptionId: 1,
        resourceKey: "queueTickets",
        limit: 1,
        units: 1,
        reservationKey: `final-unit-${index}`,
        subjectType: "queue_join_payment",
        subjectId: index + 1,
        periodStart,
        periodEnd,
        expiresAt
      }))
    );

    assert.equal(attempts.filter((attempt) => attempt.reserved).length, 1);
    assert.equal(attempts.filter((attempt) => !attempt.reserved && attempt.available === 0).length, 49);

    const state = await testPool.query(`
      SELECT
        (SELECT COUNT(*)::INTEGER FROM allowance_reservations WHERE status = 'active') AS reservations,
        (SELECT COUNT(*)::INTEGER FROM allowance_reservation_allocations) AS allocations,
        (SELECT COALESCE(SUM(units), 0)::INTEGER FROM allowance_reservation_allocations) AS units
    `);
    assert.deepEqual(state.rows[0], { reservations: 1, allocations: 1, units: 1 });

    const consumptionAttempts = await Promise.all(
      Array.from({ length: 50 }, (_, index) => allowanceLedger.consumeBase({
        tenantId: 2,
        subscriptionId: 2,
        resourceKey: "queueTickets",
        limit: 1,
        units: 1,
        operationKey: `free-join-${index}`,
        subjectType: "queue_ticket",
        subjectId: index + 1,
        reason: "Concurrent free queue join",
        periodStart,
        periodEnd
      }))
    );

    assert.equal(consumptionAttempts.filter((attempt) => attempt.consumed).length, 1);
    assert.equal(consumptionAttempts.filter((attempt) => !attempt.consumed && attempt.available === 0).length, 49);
    const consumptionState = await testPool.query(`
      SELECT COUNT(*)::INTEGER AS operations, COALESCE(SUM(units), 0)::INTEGER AS units
      FROM allowance_allocations allocation
      JOIN allowance_operations operation ON operation.id = allocation.operation_id
      JOIN usage_accounts account ON account.id = operation.usage_account_id
      WHERE account.tenant_id = 2
    `);
    assert.deepEqual(consumptionState.rows[0], { operations: 1, units: 1 });
  } finally {
    db.withTransaction = originalWithTransaction;
    await testPool.end();
    await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await adminPool.end();
  }
});
