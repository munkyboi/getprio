import { createHash, randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";

// CASE guards numeric casts even when the planner reorders WHERE clauses.
// JSON numbers can exceed JavaScript's finite range; reject them before export.
function validFeatures(alias) {
  return `COALESCE(CASE WHEN jsonb_typeof(${alias}.features->'position') = 'number'
      AND jsonb_typeof(${alias}.features->'averageServiceMinutes') = 'number'
    THEN (${alias}.features->>'position')::numeric BETWEEN 0 AND 9007199254740991
      AND trunc((${alias}.features->>'position')::numeric) = (${alias}.features->>'position')::numeric
      AND (${alias}.features->>'averageServiceMinutes')::numeric BETWEEN 0 AND 1.7976931348623157e308
      AND jsonb_typeof(${alias}.features->'queuePaused') = 'boolean'
      AND ${alias}.features->>'priorityBand' IN ('normal', 'checked_in_booking', 'recovery', 'carry_over')
    ELSE FALSE END, FALSE)`;
}

function validOutcome(alias) {
  return `${alias}.predictor_version = 'baseline-v1' AND ${alias}.outcome_type = 'called'
    AND isfinite(${alias}.sampled_at) AND isfinite(${alias}.outcome_at)
    AND ${alias}.outcome_at >= ${alias}.sampled_at
    AND ${alias}.outcome_wait_minutes::text NOT IN ('NaN', 'Infinity', '-Infinity')
    AND ${alias}.outcome_wait_minutes >= 0`;
}

export async function exportWaitTimeDataset(client, options, vendorId) {
  const from = new Date(options.datasetFrom).toISOString();
  const to = new Date(options.datasetTo).toISOString();
  const snapshot = await client.query("SELECT transaction_timestamp() AS captured_at");
  const capturedAt = snapshot.rows[0].captured_at.toISOString();
  if (Date.parse(to) > Date.parse(capturedAt)) throw new Error("Dataset window must be closed before export; --to is in the future.");
  const source = options.scope;
  const vendor = source === "vendors";
  // Only fixed identifiers are interpolated; filter values remain parameters.
  const table = vendor ? "wait_time_prediction_samples" : "developer_api_wait_time_prediction_samples";
  const owner = vendor ? "tenant_id" : "developer_project_id";
  const scope = (alias) => vendor ? `COALESCE(${alias}.location_id::text, 'unknown')` : `${alias}.developer_api_queue_id::text`;
  const sourceFilter = (alias) => vendor ? `${alias}.tenant_id = $3::bigint` : `${alias}.environment = 'sandbox'`;
  const parameters = vendor ? [from, to, vendorId] : [from, to];
  const windowFilter = `sample.sampled_at >= $1::timestamptz AND sample.sampled_at < $2::timestamptz
    AND sample.outcome_at < $2::timestamptz AND ${sourceFilter("sample")}
    AND ${validOutcome("sample")}`;
  // Count invalid observations in the window, not discarded distinct tickets.
  const exclusions = await client.query(`SELECT count(*)::text AS excluded_feature_rows
    FROM ${table} sample WHERE ${windowFilter} AND NOT ${validFeatures("sample")}`, parameters);
  const excludedFeatureRows = Number(exclusions.rows[0].excluded_feature_rows);
  const result = await client.query(`
    SELECT sample.${owner}::text AS owner_id, ${scope("sample")} AS scope_id, sample.ticket_id::text,
      sample.sampled_at, sample.outcome_at, sample.features, sample.outcome_wait_minutes
    FROM ${table} sample
    WHERE ${windowFilter} AND ${validFeatures("sample")}
      AND NOT EXISTS (
        SELECT 1 FROM ${table} earlier
        WHERE earlier.ticket_id = sample.ticket_id AND earlier.${owner} = sample.${owner}
          AND ${scope("earlier")} = ${scope("sample")}
          AND ${sourceFilter("earlier")} AND ${validOutcome("earlier")}
          AND (earlier.sampled_at, earlier.id) < (sample.sampled_at, sample.id)
          AND ${validFeatures("earlier")}
      )
    ORDER BY sample.sampled_at, sample.ticket_id LIMIT 100001
  `, parameters);
  if (result.rows.length > 100000) throw new Error("Dataset exceeds 100000 tickets; select a smaller window. No dataset was written.");
  const salt = randomBytes(32);
  const samples = [];
  for (const row of result.rows) {
    const features = row.features;
    if (!features || !Number.isSafeInteger(features.position) || features.position < 0 ||
        typeof features.averageServiceMinutes !== "number" || !Number.isFinite(features.averageServiceMinutes) || features.averageServiceMinutes < 0 ||
        typeof features.queuePaused !== "boolean" || !["normal", "checked_in_booking", "recovery", "carry_over"].includes(features.priorityBand)) {
      throw new Error("Dataset query returned invalid features; no dataset was written.");
    }
    const scopeKey = `${source}:${row.owner_id}:${row.scope_id}`;
    samples.push({
      ticketKey: createHash("sha256").update(salt).update(`${scopeKey}:${row.ticket_id}`).digest("hex"),
      scopeKey, sampledAt: row.sampled_at.toISOString(), calledAt: row.outcome_at.toISOString(),
      actualWaitMinutes: Number(row.outcome_wait_minutes),
      features: { position: features.position, averageServiceMinutes: features.averageServiceMinutes,
        priorityBand: features.priorityBand, queuePaused: features.queuePaused }
    });
  }
  const dataset = { datasetVersion: "wait-time-dataset-v1", source, baselineVersion: "baseline-v1",
    provenance: "unverified-operational-data", capturedAt, from, to, excludedFeatureRows, samples };
  await writeFile(options.datasetOutput, JSON.stringify(dataset, null, 2), { flag: "wx", mode: 0o600 });
  return { output: options.datasetOutput, tickets: samples.length, excludedFeatureRows,
    note: "Private local dataset; no customer identities or raw ticket IDs. Manual test tickets are not automatically identified. Existing files are never overwritten." };
}
