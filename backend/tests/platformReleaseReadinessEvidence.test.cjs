const assert = require("node:assert/strict");
const { createHmac } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

function loadEvidenceService(query = async () => ({ rows: [] })) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, "../src/services/platformReleaseReadinessEvidence.js"), "utf8"), {
    require: (name) => name === "node:crypto" ? require("node:crypto") : name === "../config/db" ? { pool: { query } } : {},
    module,
    Buffer,
    Date,
    Number,
    String,
    Math,
    RegExp
  });
  return module.exports;
}

function signature(secret, timestamp, rawBody) {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

test("release evidence signatures validate body integrity, clock skew, and secret strength", () => {
  const service = loadEvidenceService();
  const secret = "x".repeat(48);
  const timestamp = "1790683200";
  const rawBody = '{"outcome":"success"}';
  const mac = signature(secret, timestamp, rawBody);

  assert.equal(service.verifySignature({ secret, timestamp, signature: mac, rawBody, now: 1790683200_000 }), true);
  assert.equal(service.verifySignature({ secret, timestamp, signature: mac, rawBody: `${rawBody} `, now: 1790683200_000 }), false);
  assert.equal(service.verifySignature({ secret, timestamp, signature: mac, rawBody, now: 1790684000_000 }), false);
  assert.equal(service.verifySignature({ secret: "short", timestamp, signature: mac, rawBody, now: 1790683200_000 }), false);
});

test("release evidence accepts only bounded workflow outcome reports with a SHA and workflow link", () => {
  const service = loadEvidenceService();
  const valid = {
    workflowRunId: "19384756201",
    deploymentSha: "a".repeat(40),
    workflowUrl: "https://github.com/getprio/web-app/actions/runs/19384756201",
    outcome: "success",
    summary: "Authenticated smoke passed.",
    observedAt: "2026-09-29T10:20:30.000Z"
  };

  assert.equal(service.validateReport(valid), true);
  assert.equal(service.validateReport({ ...valid, outcome: "ready" }), false);
  assert.equal(service.validateReport({ ...valid, deploymentSha: "not-a-sha" }), false);
  assert.equal(service.validateReport({ ...valid, workflowUrl: "javascript:alert(1)" }), false);
  assert.equal(service.validateReport({ ...valid, summary: "x".repeat(1001) }), false);
  assert.equal(service.validateReport({ ...valid, workflowRunId: 19384756201 }), false);
  assert.equal(service.validateReport({ ...valid, workflowRunId: "9223372036854775808" }), false);
});

test("release evidence is durably upserted by workflow run id and latest result is queryable", async () => {
  const calls = [];
  const service = loadEvidenceService(async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes("INSERT INTO platform_release_readiness_evidence")) return { rows: [{ id: 1, workflow_run_id: params[0] }] };
    return { rows: [{ workflow_run_id: "19384756201", outcome: "success" }] };
  });
  const report = {
    workflowRunId: "19384756201",
    deploymentSha: "a".repeat(40),
    workflowUrl: "https://github.com/getprio/web-app/actions/runs/19384756201",
    outcome: "success",
    summary: "Authenticated smoke passed.",
    observedAt: "2026-09-29T10:20:30.000Z"
  };

  assert.equal((await service.recordReport(report)).workflow_run_id, "19384756201");
  assert.match(calls[0].sql, /ON CONFLICT \(workflow_run_id\) DO UPDATE/u);
  assert.match(calls[0].sql, /EXCLUDED\.observed_at >= platform_release_readiness_evidence\.observed_at/u);
  assert.equal((await service.getLatestReport()).outcome, "success");
  assert.match(calls[1].sql, /ORDER BY observed_at DESC/u);
});
