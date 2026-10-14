const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");
const { canPublishCreditPack, creditPackRevisionPayload } = require("../../shared/creditPackRevision.ts");

const source = readFileSync(require.resolve("../src/pages/PlanMatrixPage.tsx"), "utf8");
const start = source.indexOf("  async function publishPack()");
const end = source.indexOf("\n  if (!plan)", start);
assert.ok(start >= 0 && end > start);
const handler = ts.transpile(source.slice(start, end), { target: ts.ScriptTarget.ES2022 });

for (const scenario of [{ units: 100, retired: undefined, writes: 2 }, { units: 0, retired: undefined, writes: 0 }, { units: 0, retired: true, writes: 2 }]) {
  test(`actual pack publisher units=${scenario.units}, server retirement=${scenario.retired}`, async () => {
    const requests = [];
    const sandbox = {
      editingPack: { code: "P100", name: "Rename", state: "enabled", ticketUnits: 100, journeyUnits: scenario.units, priceCents: 9900 },
      capabilities: { queueEmailQuotaRetired: scenario.retired }, reason: "Reviewed catalog edit", token: "test-only",
      canPublishCreditPack, creditPackRevisionPayload, setBusy() {}, setPacks() {}, setEditingPack() {}, setReason() {}, notifications: { show() {} },
      apiRequest: async (path, options) => { requests.push({ path, options }); return path.endsWith("preview") ? { confirmation: { token: "confirm" }, preview: { revision: "r1" } } : { pack: {} }; },
    };
    vm.createContext(sandbox);
    await vm.runInContext(`${handler}\npublishPack()`, sandbox);
    assert.equal(requests.length, scenario.writes);
    if (requests.length) {
      assert.equal(requests[0].options.body.payload.journeyUnits, scenario.units);
      assert.equal(requests[1].options.body.journeyUnits, scenario.units);
    }
  });
}
