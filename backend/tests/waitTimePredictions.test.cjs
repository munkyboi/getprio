const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");

test("API environment resolver exports the configured realm and defaults to production", () => {
  const env = require("../src/config/env");

  assert.equal(env.resolveApiEnvironment({ API_ENVIRONMENT: "sandbox" }), "sandbox");
  assert.equal(env.resolveApiEnvironment({}), "production");
  assert.equal(env.apiEnvironment, env.resolveApiEnvironment(process.env));
});

test("prediction capture records an outcome when a call wins the snapshot-insert race", async (t) => {
  const db = require("../src/config/db");
  const repository = require("../src/repositories/waitTimePredictions");
  const originalWithTransaction = db.withTransaction;
  const observedAt = new Date("2026-09-29T10:00:00.000Z");
  const calledAt = new Date("2026-09-29T10:02:00.000Z");
  const queries = [];
  const client = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (sql.includes("SELECT status, called_at, updated_at, date_key")) {
        return {
          rows: [{
            status: "called",
            called_at: calledAt,
            updated_at: calledAt,
            date_key: "20260929"
          }]
        };
      }
      if (sql.includes("INSERT INTO wait_time_prediction_samples")) {
        return { rowCount: 1 };
      }
      if (sql.includes("UPDATE wait_time_prediction_samples")) {
        return { rowCount: 1 };
      }
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  db.withTransaction = (callback) => callback(client);
  t.after(() => {
    db.withTransaction = originalWithTransaction;
  });

  const recorded = await repository.recordPrediction({
    ticketId: 7,
    tenantId: 8,
    locationId: 9,
    queueDateKey: "20260929",
    predictorVersion: "baseline-v1",
    featureHash: "feature-hash",
    sampleBucket: observedAt,
    observedAt,
    features: { position: 2 },
    predictedWaitMinutes: 10
  });

  assert.equal(recorded, true);
  assert.equal(queries.length, 3);
  assert.equal(queries[1].params[7], observedAt);
  assert.equal(queries[2].params[1], "called");
  assert.equal(queries[2].params[2], calledAt);
});

test("prediction capture discards an observation taken after the ticket was called", async (t) => {
  const db = require("../src/config/db");
  const repository = require("../src/repositories/waitTimePredictions");
  const originalWithTransaction = db.withTransaction;
  const observedAt = new Date("2026-09-29T10:02:00.000Z");
  let insertCount = 0;
  const client = {
    async query(sql) {
      if (sql.includes("SELECT status, called_at, updated_at, date_key")) {
        return {
          rows: [{
            status: "called",
            called_at: new Date("2026-09-29T10:01:00.000Z"),
            updated_at: new Date("2026-09-29T10:01:00.000Z"),
            date_key: "20260929"
          }]
        };
      }
      if (sql.includes("INSERT INTO wait_time_prediction_samples")) {
        insertCount += 1;
        return { rowCount: 1 };
      }
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  db.withTransaction = (callback) => callback(client);
  t.after(() => {
    db.withTransaction = originalWithTransaction;
  });

  const recorded = await repository.recordPrediction({
    ticketId: 7,
    tenantId: 8,
    queueDateKey: "20260929",
    observedAt,
    sampleBucket: observedAt,
    features: { position: 2 }
  });

  assert.equal(recorded, false);
  assert.equal(insertCount, 0);
});

test("prediction captured during Queue Day rollover is censored", async (t) => {
  const db = require("../src/config/db");
  const repository = require("../src/repositories/waitTimePredictions");
  const originalWithTransaction = db.withTransaction;
  const observedAt = new Date("2026-09-29T23:59:00.000Z");
  const updatedAt = new Date("2026-09-30T00:01:00.000Z");
  const queries = [];
  const client = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (sql.includes("SELECT status, called_at, updated_at, date_key")) {
        return {
          rows: [{ status: "waiting", called_at: null, updated_at: updatedAt, date_key: "20260930" }]
        };
      }
      if (sql.includes("INSERT INTO wait_time_prediction_samples")) {
        return { rowCount: 1 };
      }
      if (sql.includes("UPDATE wait_time_prediction_samples")) {
        return { rowCount: 1 };
      }
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  db.withTransaction = (callback) => callback(client);
  t.after(() => {
    db.withTransaction = originalWithTransaction;
  });

  const recorded = await repository.recordPrediction({
    ticketId: 7,
    tenantId: 8,
    queueDateKey: "20260929",
    observedAt,
    sampleBucket: observedAt,
    features: { position: 2 }
  });

  assert.equal(recorded, true);
  assert.equal(queries[2].params[1], "censored");
  assert.equal(queries[2].params[2], updatedAt);
});

test("authoritative Queue Day close censors outstanding prediction samples", () => {
  const lifecycle = fs.readFileSync(
    path.join(root, "backend/src/services/queueDayLifecycleService.js"),
    "utf8"
  );
  const closeOutcomesStart = lifecycle.indexOf("async function closeTicketOutcomes");
  const closeLockedStart = lifecycle.indexOf("async function closeLockedQueueDay", closeOutcomesStart);
  const closeOutcomes = lifecycle.slice(closeOutcomesStart, closeLockedStart);

  assert.match(closeOutcomes, /env\.waitTimePredictionCaptureEnabled/);
  assert.match(closeOutcomes, /recordOutcome\(ticket\.id, "censored", \{ client \}\)/);
});

test("audit vendor coverage starts with eligible vendors so zero-sample vendors count", () => {
  const audit = fs.readFileSync(
    path.join(root, "scripts/wait-time-prediction-audit.mjs"),
    "utf8"
  );

  assert.match(audit, /WITH eligible_vendors AS/);
  assert.match(audit, /LEFT JOIN wait_time_prediction_samples AS samples/);
  assert.match(audit, /COUNT\(\*\) FILTER \(WHERE completed_samples > 0\)/);
  assert.match(audit, /COUNT\(\*\) FILTER \(WHERE completed_samples < 30\)/);
});
