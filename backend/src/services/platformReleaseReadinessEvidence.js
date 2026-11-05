const { createHmac, timingSafeEqual } = require("node:crypto");
const db = require("../config/db");

const MAX_CLOCK_SKEW_SECONDS = 300;

function verifySignature({ secret, timestamp, signature, rawBody, now = Date.now() }) {
  if (typeof secret !== "string" || Buffer.byteLength(secret) < 32) return false;
  if (!/^\d{10}$/u.test(String(timestamp || ""))) return false;
  const timestampSeconds = Number(timestamp);
  if (!Number.isSafeInteger(timestampSeconds) || Math.abs(Math.floor(now / 1000) - timestampSeconds) > MAX_CLOCK_SKEW_SECONDS) return false;
  if (!/^[a-f0-9]{64}$/iu.test(String(signature || ""))) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest();
  const supplied = Buffer.from(signature, "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function validateReport(report) {
  if (!report || typeof report !== "object" || Array.isArray(report)) return false;
  return typeof report.workflowRunId === "string"
    && /^\d{1,19}$/u.test(report.workflowRunId)
    && BigInt(report.workflowRunId) <= 9_223_372_036_854_775_807n
    && /^[a-f0-9]{40}$/u.test(String(report.deploymentSha || ""))
    && typeof report.workflowUrl === "string"
    && /^https:\/\//u.test(report.workflowUrl)
    && ["success", "failure"].includes(report.outcome)
    && typeof report.summary === "string"
    && report.summary.trim().length >= 1
    && report.summary.length <= 1000
    && Number.isFinite(Date.parse(report.observedAt));
}

async function recordReport(report) {
  const result = await db.pool.query(`
    INSERT INTO platform_release_readiness_evidence
      (workflow_run_id, deployment_sha, workflow_url, outcome, summary, observed_at)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (workflow_run_id) DO UPDATE SET
      deployment_sha = EXCLUDED.deployment_sha,
      workflow_url = EXCLUDED.workflow_url,
      outcome = EXCLUDED.outcome,
      summary = EXCLUDED.summary,
      observed_at = EXCLUDED.observed_at,
      recorded_at = NOW()
    WHERE EXCLUDED.observed_at >= platform_release_readiness_evidence.observed_at
    RETURNING id, workflow_run_id, deployment_sha, workflow_url, outcome, summary, observed_at
  `, [report.workflowRunId, report.deploymentSha, report.workflowUrl, report.outcome, report.summary.trim(), report.observedAt]);
  return result.rows[0];
}

async function getLatestReport() {
  const result = await db.pool.query(`
    SELECT workflow_run_id, deployment_sha, workflow_url, outcome, summary, observed_at
    FROM platform_release_readiness_evidence
    ORDER BY observed_at DESC, id DESC
    LIMIT 1
  `);
  return result.rows[0] || null;
}

module.exports = { getLatestReport, recordReport, validateReport, verifySignature };
