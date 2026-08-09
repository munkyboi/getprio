import dbModule from "../backend/src/config/db.js";

const db = dbModule.default || dbModule;
const batchSize = Math.max(1, Math.min(Number(process.env.QUEUE_LIFECYCLE_BACKFILL_BATCH || 25), 200));
const requestedRunId = String(process.env.QUEUE_LIFECYCLE_BACKFILL_RUN_ID || "").trim();
if (requestedRunId && !/^\d+$/.test(requestedRunId)) {
  throw new Error("QUEUE_LIFECYCLE_BACKFILL_RUN_ID must be a positive integer.");
}

async function recordInvalidDateKeys(runId) {
  await db.pool.query(
    `INSERT INTO queue_lifecycle_migration_anomalies (
       run_id, tenant_id, location_id, scope_key, anomaly_code, details
     )
     SELECT $1, ticket.tenant_id, ticket.location_id,
            'ticket:' || ticket.id,
            'invalid_queue_date_key',
            jsonb_build_object('ticketId', ticket.id)
     FROM tickets AS ticket
     WHERE COALESCE(ticket.queue_date_key, ticket.date_key, '') !~ '^[0-9]{8}$'
     ON CONFLICT (scope_key, anomaly_code) DO NOTHING`,
    [runId]
  );
}

async function processScope(runId, scope) {
  return db.withTransaction(async (client) => {
    const scopeKey = `${scope.tenant_id}:${scope.location_id}:${scope.queue_date_key}`;
    const checkpoint = async () => {
      await client.query(
        `UPDATE queue_lifecycle_backfill_runs
         SET last_scope_key = $2,
             processed_scope_count = processed_scope_count + 1
         WHERE id = $1`,
        [runId, scope.cursor_key]
      );
    };
    const duplicateResult = await client.query(
      `SELECT sequence
       FROM tickets
       WHERE tenant_id = $1 AND location_id = $2
         AND COALESCE(queue_date_key, date_key) = $3
       GROUP BY sequence
       HAVING COUNT(*) > 1
       LIMIT 1`,
      [scope.tenant_id, scope.location_id, scope.queue_date_key]
    );
    if (duplicateResult.rows.length) {
      await client.query(
        `INSERT INTO queue_lifecycle_migration_anomalies (
           run_id, tenant_id, location_id, scope_key, anomaly_code, details
         )
         VALUES ($1, $2, $3, $4, 'duplicate_daily_sequence', $5)
         ON CONFLICT (scope_key, anomaly_code) DO NOTHING`,
        [
          runId,
          scope.tenant_id,
          scope.location_id,
          scopeKey,
          { sequence: duplicateResult.rows[0].sequence }
        ]
      );
      await checkpoint();
      return { scopeKey, cursorKey: scope.cursor_key, anomaly: true };
    }

    const queueDayResult = await client.query(
      `WITH evidence AS (
         SELECT
           EXISTS (
             SELECT 1 FROM queue_day_closures
             WHERE tenant_id = $1 AND location_id = $2
               AND queue_date_key = $3 AND reopened_at IS NULL
           ) AS actively_closed,
           EXISTS (
             SELECT 1 FROM tickets
             WHERE tenant_id = $1 AND location_id = $2
               AND COALESCE(queue_date_key, date_key) = $3
               AND status IN ('waiting', 'called', 'skipped', 'unserved')
           ) AS has_nonterminal
       )
       INSERT INTO queue_days (
         tenant_id, location_id, business_date, state, intake_mode,
         timezone_snapshot, effective_opens_at, effective_closes_at,
         initial_closes_at, current_closes_at, opened_at, closed_at,
         close_reason, close_source, next_sequence
       )
       SELECT
         $1, $2, to_date($3, 'YYYYMMDD'),
         CASE WHEN evidence.actively_closed OR NOT evidence.has_nonterminal
              THEN 'closed' ELSE 'open' END,
         CASE WHEN evidence.actively_closed OR NOT evidence.has_nonterminal
              THEN NULL ELSE 'accepting' END,
         location.timezone,
         to_date($3, 'YYYYMMDD')::timestamp AT TIME ZONE location.timezone,
         (to_date($3, 'YYYYMMDD') + 1)::timestamp AT TIME ZONE location.timezone,
         (to_date($3, 'YYYYMMDD') + 1)::timestamp AT TIME ZONE location.timezone,
         (to_date($3, 'YYYYMMDD') + 1)::timestamp AT TIME ZONE location.timezone,
         to_date($3, 'YYYYMMDD')::timestamp AT TIME ZONE location.timezone,
         CASE WHEN evidence.actively_closed OR NOT evidence.has_nonterminal THEN NOW() ELSE NULL END,
         CASE WHEN evidence.actively_closed THEN 'legacy_closure'
              WHEN NOT evidence.has_nonterminal THEN 'legacy_import' ELSE NULL END,
         CASE WHEN evidence.actively_closed OR NOT evidence.has_nonterminal
              THEN 'legacy_import' ELSE NULL END,
         COALESCE((
           SELECT MAX(sequence) + 1 FROM tickets
           WHERE tenant_id = $1 AND location_id = $2
             AND COALESCE(queue_date_key, date_key) = $3
         ), 1)
       FROM store_locations AS location
       CROSS JOIN evidence
       WHERE location.id = $2 AND location.tenant_id = $1
       ON CONFLICT (tenant_id, location_id, business_date)
       DO UPDATE SET next_sequence = GREATEST(queue_days.next_sequence, EXCLUDED.next_sequence)
       RETURNING id, state`,
      [scope.tenant_id, scope.location_id, scope.queue_date_key]
    );
    if (!queueDayResult.rows[0]) {
      await client.query(
        `INSERT INTO queue_lifecycle_migration_anomalies (
           run_id, tenant_id, location_id, scope_key, anomaly_code
         )
         VALUES ($1, $2, $3, $4, 'missing_location')
         ON CONFLICT (scope_key, anomaly_code) DO NOTHING`,
        [runId, scope.tenant_id, scope.location_id, scopeKey]
      );
      await checkpoint();
      return { scopeKey, cursorKey: scope.cursor_key, anomaly: true };
    }

    const queueDay = queueDayResult.rows[0];
    await client.query(
      `UPDATE queue_day_closures
       SET queue_day_id = $4
       WHERE tenant_id = $1 AND location_id = $2 AND queue_date_key = $3
         AND queue_day_id IS NULL`,
      [scope.tenant_id, scope.location_id, scope.queue_date_key, queueDay.id]
    );
    await client.query(
      `UPDATE queue_day_pauses
       SET queue_day_id = $4
       WHERE tenant_id = $1 AND location_id = $2 AND queue_date_key = $3
         AND queue_day_id IS NULL`,
      [scope.tenant_id, scope.location_id, scope.queue_date_key, queueDay.id]
    );
    await client.query(
      `UPDATE tickets
       SET original_queue_day_id = COALESCE(original_queue_day_id, $4),
           current_queue_day_id = CASE
             WHEN $5 = 'open' AND status IN ('waiting', 'called', 'skipped', 'unserved')
             THEN $4 ELSE current_queue_day_id END,
           updated_at = updated_at
       WHERE tenant_id = $1 AND location_id = $2
         AND COALESCE(queue_date_key, date_key) = $3`,
      [scope.tenant_id, scope.location_id, scope.queue_date_key, queueDay.id, queueDay.state]
    );
    await client.query(
      `INSERT INTO queue_ticket_segments (
         ticket_id, queue_day_id, display_number, sequence, priority_band,
         activated_at, legacy_inferred
       )
       SELECT id, $4, ticket_number, sequence,
              CASE
                WHEN carry_over_count > 0 THEN 'carry_over'
                WHEN service_priority_band IN ('carry_over', 'recovery', 'checked_in_booking')
                  THEN service_priority_band
                ELSE 'normal'
              END,
              created_at, TRUE
       FROM tickets
       WHERE tenant_id = $1 AND location_id = $2
         AND COALESCE(queue_date_key, date_key) = $3
       ON CONFLICT DO NOTHING`,
      [scope.tenant_id, scope.location_id, scope.queue_date_key, queueDay.id]
    );
    await checkpoint();
    return { scopeKey, cursorKey: scope.cursor_key, anomaly: false };
  });
}

async function main() {
  const run = requestedRunId
    ? await db.pool.query(
      `UPDATE queue_lifecycle_backfill_runs
       SET status = 'running', last_error = NULL, completed_at = NULL
       WHERE id = $1
       RETURNING id, last_scope_key`,
      [Number(requestedRunId)]
    )
    : await db.pool.query(
      `INSERT INTO queue_lifecycle_backfill_runs (status)
       VALUES ('running') RETURNING id, last_scope_key`
    );
  if (!run.rows[0]) {
    throw new Error("The requested queue lifecycle backfill run was not found.");
  }
  const runId = run.rows[0].id;
  try {
    await recordInvalidDateKeys(runId);
    let lastScopeKey = run.rows[0].last_scope_key || "";
    while (true) {
      const result = await db.pool.query(
        `SELECT tenant_id, location_id, queue_date_key, cursor_key
         FROM (
           SELECT tenant_id, location_id, queue_date_key,
                  LPAD(tenant_id::text, 20, '0') || ':' ||
                  LPAD(location_id::text, 20, '0') || ':' ||
                  queue_date_key AS cursor_key
           FROM (
             SELECT DISTINCT tenant_id, location_id,
                    COALESCE(queue_date_key, date_key) AS queue_date_key
             FROM tickets
             WHERE COALESCE(queue_date_key, date_key, '') ~ '^[0-9]{8}$'
             UNION
             SELECT DISTINCT tenant_id, location_id, queue_date_key
             FROM queue_day_closures
             WHERE queue_date_key ~ '^[0-9]{8}$'
             UNION
             SELECT DISTINCT tenant_id, location_id, queue_date_key
             FROM queue_day_pauses
             WHERE queue_date_key ~ '^[0-9]{8}$'
           ) AS raw_scopes
         ) AS scopes
         WHERE cursor_key > $1
         ORDER BY cursor_key
         LIMIT $2`,
        [lastScopeKey, batchSize]
      );
      if (!result.rows.length) {
        break;
      }
      for (const scope of result.rows) {
        const processed = await processScope(runId, scope);
        lastScopeKey = processed.cursorKey;
      }
    }
    const anomalies = await db.pool.query(
      `SELECT COUNT(*)::INTEGER AS count
       FROM queue_lifecycle_migration_anomalies
       WHERE run_id = $1 AND resolved_at IS NULL`,
      [runId]
    );
    await db.pool.query(
      `UPDATE queue_lifecycle_backfill_runs
       SET status = 'completed', anomaly_count = $2, completed_at = NOW()
       WHERE id = $1`,
      [runId, anomalies.rows[0].count]
    );
    console.log(JSON.stringify({ runId: String(runId), anomalyCount: anomalies.rows[0].count }));
  } catch (error) {
    await db.pool.query(
      `UPDATE queue_lifecycle_backfill_runs
       SET status = 'failed', last_error = $2, completed_at = NOW()
       WHERE id = $1`,
      [runId, String(error.message || error).slice(0, 500)]
    );
    throw error;
  } finally {
    await db.pool.end();
  }
}

await main();
