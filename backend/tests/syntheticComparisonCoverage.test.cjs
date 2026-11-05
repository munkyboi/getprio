const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, readFileSync, rmSync, statSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");

const script = resolve(__dirname, "../../scripts/wait-time-synthetic-compare.mjs");
function run(args, output) {
  return spawnSync(process.execPath, [script, ...args, "--output", output], { encoding: "utf8" });
}
function verifyPartition(row) {
  const { coverage } = row;
  const { calledTickets, ...categories } = coverage.selection;
  assert.equal(Object.values(categories).reduce((total, count) => total + count, 0), calledTickets);
  assert.equal(calledTickets + coverage.censoredTickets, coverage.issuedTickets);
  assert.equal(coverage.selection.scoredTickets, row.baseline.tickets);
  for (const method of ["candidate", "resource"]) {
    const support = coverage[method];
    assert.equal(support.supportedTickets, row[`${method}Only`].tickets);
    assert.equal(support.scoredTickets, row.baseline.tickets);
    assert.equal(support.supportedPercent, support.scoredTickets
      ? Math.round(support.supportedTickets / support.scoredTickets * 10000) / 100 : null);
    const fallbacks = Object.values(row[`${method}FallbackReasons`]).reduce((total, count) => total + count, 0);
    assert.equal(support.supportedTickets + fallbacks, support.scoredTickets);
  }
}

test("synthetic comparison exposes window selection and scored-only support without changing fixed scores", () => {
  const directory = mkdtempSync(join(tmpdir(), "getprio-comparison-"));
  try {
    const output = join(directory, "report.json");
    const result = run([], output);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(readFileSync(output, "utf8"));
    assert.equal(report.reportVersion, "wait-time-synthetic-comparison-v2");
    assert.equal(report.source, "synthetic");
    assert.equal(report.provenance, "synthetic-simulation");
    assert.equal(report.customerEstimateChanged, false);
    assert.equal(report.rolloutApproved, false);
    assert.equal(report.productionPerformanceEstablished, false);
    assert.match(report.coveragePolicy, /scored called tickets only/);
    assert.equal(statSync(output).mode & 0o777, 0o600);
    for (const row of report.aggregate) verifyPartition(row);
    for (const runReport of report.runs) {
      for (const row of runReport.scopes) verifyPartition(row);
      assert.equal(runReport.excludedOverlappingTickets,
        runReport.scopes.reduce((sum, row) => sum + row.coverage.selection.overlappingTickets, 0));
    }
    for (const row of report.aggregate) {
      const perRun = report.runs.map((runReport) => runReport.scopes.find((scope) => scope.scopeKey === row.scopeKey));
      for (const key of Object.keys(row.coverage.selection)) {
        assert.equal(row.coverage.selection[key], perRun.reduce((sum, scope) => sum + scope.coverage.selection[key], 0));
      }
      assert.equal(row.coverage.issuedTickets, 360);
    }
    assert.deepEqual(report.aggregate.map((row) => row.baseline.tickets), [169, 127, 194, 79]);
    assert.deepEqual(report.aggregate.map((row) => row.resourceWithFallback.maeMinutes), [4.75, 3.57, 6.03, 60.71]);
    const disrupted = report.aggregate.find((row) => row.scopeKey === "synthetic:disrupted");
    assert.equal(disrupted.coverage.candidate.supportedPercent, 0);
    assert.equal(disrupted.coverage.resource.supportedTickets, 66);
    assert.ok(disrupted.coverage.censoredTickets > 0);
    const original = readFileSync(output, "utf8");
    assert.notEqual(run([], output).status, 0);
    assert.equal(readFileSync(output, "utf8"), original);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("empty holdouts report unknown support rather than zero percent availability", () => {
  const directory = mkdtempSync(join(tmpdir(), "getprio-comparison-empty-"));
  try {
    const output = join(directory, "report.json");
    const result = run(["--seeds", "42", "--training-minutes", "1", "--holdout-end-minutes", "2"], output);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(readFileSync(output, "utf8"));
    for (const row of report.aggregate) {
      verifyPartition(row);
      assert.equal(row.baseline.tickets, 0);
      assert.equal(row.coverage.candidate.supportedPercent, null);
      assert.equal(row.coverage.resource.supportedPercent, null);
      assert.equal(row.baseline.maeMinutes, null);
      assert.ok(row.coverage.selection.observedAfterHoldout > 0);
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("cutoff observations are scored while calls exactly at holdout end are excluded", async () => {
  const { generateSyntheticDataset } = await import("../../scripts/wait-time-simulator.mjs");
  const origin = Date.parse("2026-01-01T00:00:00Z");
  const dataset = generateSyntheticDataset({ seed: 42, ticketsPerScenario: 120,
    start: new Date(origin).toISOString(), includeResourceReference: true });
  const target = dataset.samples.find((sample) => sample.scopeKey === "synthetic:sequential"
    && sample.actualWaitMinutes > 0 && Date.parse(sample.sampledAt) > origin + 60000);
  assert.ok(target);
  const cutoff = (Date.parse(target.sampledAt) - origin) / 60000;
  const end = (Date.parse(target.calledAt) - origin) / 60000;
  const directory = mkdtempSync(join(tmpdir(), "getprio-comparison-boundary-"));
  try {
    const counts = [];
    for (const offset of [0, 1]) {
      const output = join(directory, `${offset}.json`);
      const result = run(["--seeds", "42", "--training-minutes", String(cutoff),
        "--holdout-end-minutes", String(end + offset)], output);
      assert.equal(result.status, 0, result.stderr);
      const report = JSON.parse(readFileSync(output, "utf8"));
      const row = report.aggregate.find((scope) => scope.scopeKey === target.scopeKey);
      verifyPartition(row);
      counts.push(row.coverage.selection);
    }
    assert.equal(counts[1].scoredTickets, counts[0].scoredTickets + 1);
    assert.equal(counts[1].calledAfterHoldout, counts[0].calledAfterHoldout - 1);
    assert.equal(counts[1].historicalTickets, counts[0].historicalTickets);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
