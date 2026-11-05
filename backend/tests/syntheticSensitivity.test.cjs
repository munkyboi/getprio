const test = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { mkdtempSync, readFileSync, rmSync, existsSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const start = "2026-01-01T00:00:00Z";
const configuration = { seed: 42, ticketsPerScenario: 120, start, includeResourceReference: true };
const modules = Promise.all([import("../../scripts/wait-time-simulator.mjs"), import("../../scripts/wait-time-dataset-contract.mjs")]);

test("default reference datasets retain their exact prior hashes", async () => {
  const [{ generateSyntheticDataset }, { validateDataset }] = await modules;
  const expected = ["bbef598d46a45476ae90a1527080d9c21a0c07bed60d6697a8a9964cfcaffe3b",
    "b7b50fcc60854f46832157ef81aa202715580b3200cc531399a11801ad13d6ad",
    "b5601b63101ad7155b54476212a955f34662b5bc201bef37a16bd0a1cf7d8cf8"];
  for (const [index, seed] of [42, 314, 2718].entries()) {
    const dataset = generateSyntheticDataset({ ...configuration, seed });
    validateDataset(dataset, null, "synthetic");
    assert.equal(createHash("sha256").update(JSON.stringify(dataset)).digest("hex"), expected[index]);
  }
});

test("changed assumptions are deterministic, distinct, profile-bound and strictly offline", async () => {
  const [{ generateSyntheticDataset }, { validateDataset }] = await modules;
  const baseline = generateSyntheticDataset(configuration);
  for (const scenarioProfile of ["dense-arrivals", "variable-durations"]) {
    const changed = generateSyntheticDataset({ ...configuration, scenarioProfile });
    assert.deepEqual(changed, generateSyntheticDataset({ ...configuration, scenarioProfile }));
    assert.equal(changed.simulation.simulatorVersion, "synthetic-queue-sensitivity-v1");
    assert.equal(changed.simulation.scenarioProfile, scenarioProfile);
    assert.equal(changed.source, "synthetic");
    assert.equal(changed.customerEstimateChanged, false);
    assert.equal(changed.rolloutApproved, false);
    validateDataset(changed, null, "synthetic");
    assert.throws(() => validateDataset(changed), /synthetic inputs require explicit synthetic mode/);
    assert.notEqual(changed.samples[0].ticketKey, baseline.samples[0].ticketKey);
    assert.ok(changed.samples.every((row) => row.scopeKey.startsWith(`synthetic:${scenarioProfile}-`)));
    for (const [index, scenario] of changed.simulation.scenarios.entries()) {
      const original = baseline.simulation.scenarios[index];
      assert.deepEqual(scenario.settings.capacity, original.settings.capacity);
      assert.equal(scenario.settings.duration, original.settings.duration);
      assert.equal(scenario.issuedTickets, 120);
      assert.equal(scenario.calledTickets + scenario.censoredTickets, 120);
      if (scenarioProfile === "dense-arrivals") {
        assert.ok(scenario.settings.arrivalGap < original.settings.arrivalGap);
        assert.equal(scenario.settings.durationSpread, 0.8);
      } else {
        assert.equal(scenario.settings.arrivalGap, original.settings.arrivalGap);
        assert.equal(scenario.settings.durationSpread, 1.5);
      }
    }
    const malformed = structuredClone(changed);
    malformed.simulation.scenarioProfile = "baseline";
    assert.throws(() => validateDataset(malformed, null, "synthetic"), /recognized profile/);
    const wrongScope = structuredClone(changed);
    wrongScope.samples[0].scopeKey = "synthetic:sequential";
    assert.throws(() => validateDataset(wrongScope, null, "synthetic"), /profile-bound/);
  }
  assert.throws(() => generateSyntheticDataset({ ...configuration, scenarioProfile: "__proto__" }), /recognized profile/);
  assert.throws(() => generateSyntheticDataset({ ...configuration, scenarioProfile: "dense-arrivals", includeResourceReference: false }), /comparison mode/);
});

test("profile comparisons keep coverage and invalid profiles never create output", () => {
  const directory = mkdtempSync(join(tmpdir(), "getprio-sensitivity-"));
  const script = resolve(__dirname, "../../scripts/wait-time-synthetic-compare.mjs");
  try {
    for (const profile of ["dense-arrivals", "variable-durations"]) {
      const output = join(directory, `${profile}.json`);
      const result = spawnSync(process.execPath, [script, "--scenario-profile", profile, "--output", output], { encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
      const report = JSON.parse(readFileSync(output, "utf8"));
      assert.equal(report.scenarioProfile, profile);
      assert.equal(report.simulatorVersion, "synthetic-queue-sensitivity-v1");
      assert.equal(report.productionPerformanceEstablished, false);
      assert.equal(report.rolloutApproved, false);
      assert.equal(report.trainingCutoff, "2026-01-01T06:00:00.000Z");
      assert.equal(report.holdoutEnd, "2026-01-01T16:00:00.000Z");
      for (const row of report.aggregate) {
        assert.equal(row.coverage.issuedTickets, 360);
        assert.equal(row.coverage.selection.scoredTickets, row.baseline.tickets);
        if (!row.baseline.tickets) assert.equal(row.coverage.resource.supportedPercent, null);
      }
    }
    const output = join(directory, "invalid.json");
    const result = spawnSync(process.execPath, [script, "--scenario-profile", "unrecognized", "--output", output], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /scenario-profile/);
    assert.equal(existsSync(output), false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("wider simulated duration outcomes never enter the reference forecast input", async () => {
  const { resourceSnapshot } = await import("../../scripts/wait-time-resource-reference.mjs");
  const settings = { capacity: [3, 3], duration: 15, durationMinimum: 0.25, durationSpread: 1.5 };
  const known = { id: 1, ready: 10, needs: [1, 0], state: "active", called: 10 };
  const waiting = { id: 2, ready: 12, needs: [1, 0], state: "waiting" };
  const first = resourceSnapshot([{ ...known, duration: 4, finish: 14 }, waiting], [], 12, settings, false, 2);
  const changedFuture = resourceSnapshot([{ ...known, duration: 26, finish: 36 }, waiting], [], 12, settings, false, 2);
  assert.deepEqual(first, changedFuture);
  assert.equal(first.active[0].duration, 15);
  assert.equal(first.waiting[0].duration, 15);
  assert.equal(first.active[0].workingMinutes, 2);
  assert.equal(Object.hasOwn(first.active[0], "finish"), false);
});
