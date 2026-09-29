#!/usr/bin/env node

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const env = require("../backend/src/config/env");

if (!String(process.env.DATABASE_URL || "").trim()) {
  throw new Error("DATABASE_URL is required. No database connection was opened.");
}

const db = require("../backend/src/config/db");

async function runAudit() {
  const client = await db.pool.connect();
  let transactionOpen = false;

  try {
    await client.query("BEGIN READ ONLY");
    transactionOpen = true;

    const target = await client.query("SELECT current_database() AS database_name");
    const table = await client.query("SELECT to_regclass('public.wait_time_prediction_samples') AS table_name");

    if (!table.rows[0]?.table_name) {
      console.log(JSON.stringify({
        database: target.rows[0].database_name,
        tableAvailable: false,
        captureEnabled: env.waitTimePredictionCaptureEnabled,
        message: "Apply the wait-time prediction migration before auditing samples."
      }, null, 2));
      return;
    }

    const summary = await client.query(`
      SELECT
        predictor_version,
        COUNT(*)::int AS total_samples,
        COUNT(*) FILTER (WHERE outcome_type = 'called')::int AS completed_samples,
        COUNT(*) FILTER (WHERE outcome_type = 'censored')::int AS censored_samples,
        COUNT(*) FILTER (WHERE outcome_type IS NULL)::int AS pending_samples,
        COUNT(DISTINCT tenant_id) FILTER (WHERE outcome_type = 'called')::int AS vendors_with_completed_samples,
        COUNT(DISTINCT location_id) FILTER (WHERE outcome_type = 'called')::int AS locations_with_completed_samples,
        MIN(sampled_at) AS first_sample_at,
        MAX(sampled_at) AS latest_sample_at,
        ROUND(AVG(ABS(predicted_wait_minutes - outcome_wait_minutes))
          FILTER (WHERE outcome_type = 'called'), 2) AS mean_absolute_error_minutes,
        ROUND(AVG(outcome_wait_minutes - predicted_wait_minutes)
          FILTER (WHERE outcome_type = 'called'), 2) AS mean_signed_error_minutes,
        ROUND(100 * AVG((ABS(predicted_wait_minutes - outcome_wait_minutes) <= 5)::int)
          FILTER (WHERE outcome_type = 'called'), 1) AS within_five_minutes_percent
      FROM wait_time_prediction_samples
      GROUP BY predictor_version
      ORDER BY predictor_version
    `);

    const vendorCoverage = await client.query(`
      WITH per_vendor AS (
        SELECT tenant_id, COUNT(*)::int AS completed_samples
        FROM wait_time_prediction_samples
        WHERE outcome_type = 'called'
        GROUP BY tenant_id
      )
      SELECT
        COUNT(*)::int AS vendors_with_completed_samples,
        COUNT(*) FILTER (WHERE completed_samples < 30)::int AS vendors_below_30_samples,
        COUNT(*) FILTER (WHERE completed_samples BETWEEN 30 AND 99)::int AS vendors_with_30_to_99_samples,
        COUNT(*) FILTER (WHERE completed_samples >= 100)::int AS vendors_with_at_least_100_samples,
        MIN(completed_samples)::int AS fewest_samples_for_a_vendor,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY completed_samples) AS median_samples_per_vendor
      FROM per_vendor
    `);

    const positionCoverage = await client.query(`
      WITH labeled AS (
        SELECT
          CASE
            WHEN (features->>'position') ~ '^[0-9]+$'
              AND (features->>'position')::int <= 1 THEN 'position_1'
            WHEN (features->>'position') ~ '^[0-9]+$'
              AND (features->>'position')::int BETWEEN 2 AND 3 THEN 'position_2_to_3'
            WHEN (features->>'position') ~ '^[0-9]+$'
              AND (features->>'position')::int >= 4 THEN 'position_4_plus'
            ELSE 'position_unknown'
          END AS position_group,
          predicted_wait_minutes,
          outcome_wait_minutes
        FROM wait_time_prediction_samples
        WHERE outcome_type = 'called'
      )
      SELECT
        position_group,
        COUNT(*)::int AS completed_samples,
        ROUND(AVG(ABS(predicted_wait_minutes - outcome_wait_minutes))::numeric, 2)
          AS mean_absolute_error_minutes
      FROM labeled
      GROUP BY position_group
      ORDER BY position_group
    `);

    console.log(JSON.stringify({
      database: target.rows[0].database_name,
      tableAvailable: true,
      captureEnabled: env.waitTimePredictionCaptureEnabled,
      summary: summary.rows,
      vendorCoverage: vendorCoverage.rows[0],
      positionCoverage: positionCoverage.rows,
      note: "Read-only report. Review temporal holdout performance and vendor coverage before model rollout."
    }, null, 2));
  } finally {
    if (transactionOpen) {
      await client.query("ROLLBACK");
    }
    client.release();
    await db.pool.end();
  }
}

runAudit().catch((error) => {
  console.error("Wait-time prediction audit failed:", error.message);
  process.exitCode = 1;
});
