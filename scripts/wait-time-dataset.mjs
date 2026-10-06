import { createHash, randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";

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
  const scope = vendor ? "COALESCE(location_id::text, 'unknown')" : "developer_api_queue_id::text";
  const result = await client.query(`
    WITH first_predictions AS (
      SELECT DISTINCT ON (${owner}, ${scope}, ticket_id)
        ${owner}::text AS owner_id, ${scope} AS scope_id, ticket_id::text,
        sampled_at, outcome_at, features, outcome_wait_minutes
      FROM ${table}
      WHERE predictor_version = 'baseline-v1' AND outcome_type = 'called'
        AND isfinite(sampled_at) AND isfinite(outcome_at) AND outcome_at >= sampled_at
        AND outcome_wait_minutes::text NOT IN ('NaN', 'Infinity', '-Infinity')
        AND outcome_wait_minutes >= 0
        AND ${vendor ? "tenant_id = $3::bigint" : "environment = 'sandbox'"}
      ORDER BY ${owner}, ${scope}, ticket_id, sampled_at, id
    )
    SELECT * FROM first_predictions
    WHERE sampled_at >= $1::timestamptz AND sampled_at < $2::timestamptz
      AND outcome_at < $2::timestamptz
    ORDER BY sampled_at, ticket_id LIMIT 100001
  `, vendor ? [from, to, vendorId] : [from, to]);
  if (result.rows.length > 100000) throw new Error("Dataset exceeds 100000 tickets; select a smaller window. No dataset was written.");
  const salt = randomBytes(32);
  const samples = [];
  let excludedFeatureRows = 0;
  for (const row of result.rows) {
    const features = row.features;
    if (!features || !Number.isSafeInteger(features.position) || features.position < 0 ||
        typeof features.averageServiceMinutes !== "number" || !Number.isFinite(features.averageServiceMinutes) || features.averageServiceMinutes < 0 ||
        typeof features.queuePaused !== "boolean" || !["normal", "checked_in_booking", "recovery", "carry_over"].includes(features.priorityBand)) {
      excludedFeatureRows += 1;
      continue;
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
