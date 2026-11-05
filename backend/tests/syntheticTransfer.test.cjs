const test = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, readFileSync, existsSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { fitWaitTimeCandidate, describeTrainingCoverage, predictWaitTimeWithFallback } = require("../src/services/waitTimeCandidate");
const script = resolve(__dirname, "../../scripts/wait-time-synthetic-compare.mjs");
const cutoff = "2026-01-01T06:00:00.000Z";
const end = "2026-01-01T16:00:00.000Z";
const settings = { ticketsPerScenario: 120, start: "2026-01-01T00:00:00Z", includeResourceReference: true };
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function run(output, args = []) {
  return spawnSync(process.execPath, [script, ...args, "--output", output], { encoding: "utf8" });
}

test("cross-seed comparisons use only the declared training dataset and a single frozen model", async () => {
  const { generateSyntheticDataset } = await import("../../scripts/wait-time-simulator.mjs");
  const { metrics } = await import("../../scripts/wait-time-metrics.mjs");
  const directory = mkdtempSync(join(tmpdir(), "getprio-transfer-"));
  try {
    const output = join(directory, "report.json");
    const result = run(output, ["--training-seed", "9001"]);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(readFileSync(output, "utf8"));
    const training = generateSyntheticDataset({ ...settings, seed: 9001 });
    const model = fitWaitTimeCandidate(training.samples, cutoff, 30);
    const coverage = describeTrainingCoverage(training.samples, cutoff, 30);
    assert.equal(report.reportVersion, "wait-time-synthetic-transfer-v1");
    assert.equal(report.trainingMode, "cross_seed");
    assert.equal(report.transferTraining.seed, 9001);
    assert.equal(report.transferTraining.datasetSha256, hash(training));
    assert.equal(report.transferTraining.modelSha256, hash(model));
    assert.deepEqual(report.transferTraining.trainingCoverage, coverage);
    assert.equal(report.transferTraining.trainedScopes, model.scopeRates.length);
    assert.deepEqual(report.seeds, [42, 314, 2718]);
    assert.equal(report.customerEstimateChanged, false);
    assert.equal(report.rolloutApproved, false);
    assert.equal(report.productionPerformanceEstablished, false);
    assert.match(report.splitPolicy, /No evaluation-seed outcomes enter training/);
    for (const evaluation of report.runs) {
      assert.equal(evaluation.trainingSeed, 9001);
      assert.equal(evaluation.modelSha256, hash(model));
      assert.deepEqual(evaluation.trainingCoverage, coverage);
      const dataset = generateSyntheticDataset({ ...settings, seed: evaluation.seed });
      assert.equal(evaluation.datasetSha256, hash(dataset));
      assert.notEqual(evaluation.datasetSha256, report.transferTraining.datasetSha256);
      for (const row of evaluation.scopes) {
        const samples = dataset.samples.filter((sample) => sample.scopeKey === row.scopeKey
          && Date.parse(sample.sampledAt) >= Date.parse(cutoff)
          && Date.parse(sample.sampledAt) < Date.parse(end) && Date.parse(sample.calledAt) < Date.parse(end));
        const errors = samples.map((sample) => sample.actualWaitMinutes - predictWaitTimeWithFallback(
          { ...sample.features, observedAt: new Date(sample.sampledAt) }, model, sample.scopeKey).prediction.estimatedWaitMinutes);
        assert.deepEqual(row.candidateWithFallback, metrics(errors));
        assert.equal(row.coverage.selection.scoredTickets, samples.length);
      }
    }
    // Transfer changes only the learned candidate; all other comparators and populations remain fixed.
    const withinOutput = join(directory, "within.json");
    assert.equal(run(withinOutput).status, 0);
    const within = JSON.parse(readFileSync(withinOutput, "utf8"));
    assert.equal(within.trainingMode, "within_seed");
    assert.equal(within.transferTraining, null);
    assert.equal(within.reportVersion, "wait-time-synthetic-comparison-v2");
    for (const row of report.aggregate) {
      const original = within.aggregate.find((scope) => scope.scopeKey === row.scopeKey);
      assert.deepEqual(row.baseline, original.baseline);
      assert.deepEqual(row.resourceWithFallback, original.resourceWithFallback);
      assert.deepEqual(row.coverage.selection, original.coverage.selection);
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("training and evaluation stream overlap, including uint32 wrap, fails before output", () => {
  const directory = mkdtempSync(join(tmpdir(), "getprio-transfer-invalid-"));
  try {
    const cases = [
      ["--training-seed", "42"],
      ["--training-seed", "40"],
      ["--training-seed", "4294967294", "--seeds", "0"],
      ["--training-seed", "42,314"],
      ["--training-seed", "4294967296"],
      ["--training-seed", "9001", "--seeds", "42,314,2718,10000,20000"]
    ];
    for (const [index, args] of cases.entries()) {
      const output = join(directory, `${index}.json`);
      const result = run(output, args);
      assert.notEqual(result.status, 0, JSON.stringify(args));
      assert.equal(existsSync(output), false);
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("cross-seed sensitivity uses profile-bound training scopes and sparse-history fallback", () => {
  const directory = mkdtempSync(join(tmpdir(), "getprio-transfer-profile-"));
  try {
    const output = join(directory, "profile.json");
    const result = run(output, ["--training-seed", "9001", "--scenario-profile", "variable-durations",
      "--training-minutes", "1", "--holdout-end-minutes", "960"]);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(readFileSync(output, "utf8"));
    assert.equal(report.transferTraining.trainedScopes, 0);
    for (const row of report.transferTraining.trainingCoverage.scopes) {
      assert.ok(row.scopeKey.startsWith("synthetic:variable-durations-"));
    }
    for (const row of report.aggregate) {
      assert.equal(row.candidateOnly.tickets, 0);
      assert.deepEqual(row.candidateWithFallback, row.baseline);
      assert.equal(row.coverage.candidate.supportedPercent, row.baseline.tickets ? 0 : null);
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("training may drain before holdout end while evaluation data still covers the scoring window", () => {
  const directory = mkdtempSync(join(tmpdir(), "getprio-transfer-window-"));
  try {
    const output = join(directory, "report.json");
    // Seed9001 drains at19:58; evaluation seed42 drains at20:32.
    const result = run(output, ["--training-seed", "9001", "--seeds", "42", "--holdout-end-minutes", "1200"]);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(readFileSync(output, "utf8"));
    assert.ok(Date.parse(report.transferTraining.to) < Date.parse(report.holdoutEnd));
    assert.ok(Date.parse(report.transferTraining.to) >= Date.parse(report.trainingCutoff));
    assert.ok(Date.parse(report.runs[0].to) >= Date.parse(report.holdoutEnd));
    const invalidOutput = join(directory, "invalid-window.json");
    const invalid = run(invalidOutput, ["--training-seed", "9001", "--seeds", "42",
      "--training-minutes", "1200", "--holdout-end-minutes", "1210"]);
    assert.notEqual(invalid.status, 0);
    assert.equal(existsSync(invalidOutput), false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
