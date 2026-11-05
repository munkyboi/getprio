const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");
const { planPolicyPayload } = require("../../shared/planPolicyPayload.ts");
const source = readFileSync(require.resolve("../src/pages/PlanMatrixPage.tsx"), "utf8");
const start = source.indexOf("  async function savePlan()");
const end = source.indexOf("\n  function openCreditTask", start);
assert.ok(start >= 0 && end > start);
const handler = ts.transpile(source.slice(start, end), { target: ts.ScriptTarget.ES2022 });

for (const retired of [false, true]) test(`actual legacy plan publisher server retirement=${retired}`, async () => {
  const plan = { slug: "pro", name: "Pro", policyRevision: 1, allowances: { queueTickets: 5000, queueEmailJourneys: 5000, serviceBookings: 1000 }, entitlements: { monthlyQueueEmailJourneys: 5000, monthlyTransactionalEmails: 5000, emailAlerts: true } };
  const requests = [];
  const sandbox = { plan, planPolicyPayload, capabilities: { queueEmailQuotaRetired: retired }, fees: [], token: "test-only", setBusy() {}, setPlans() {}, setFees() {}, notifications: { show() {} }, apiRequest: async (path, options) => {
    requests.push({ path, options });
    return path.endsWith("preview") ? { confirmation: { token: "confirm" }, preview: { revision: "r1" } } : path.includes("/plans/") ? { plan } : { queueFees: [] };
  } };
  vm.createContext(sandbox);
  await vm.runInContext(`${handler}\nsavePlan()`, sandbox);
  assert.equal(requests.length, 4);
  const reviewed = requests[0].options.body.payload.plan;
  assert.deepEqual(JSON.parse(JSON.stringify(reviewed)), JSON.parse(JSON.stringify(requests[1].options.body.plan)));
  assert.equal(Object.hasOwn(reviewed.allowances, "queueEmailJourneys"), !retired);
  assert.equal(Object.hasOwn(reviewed.entitlements, "monthlyQueueEmailJourneys"), !retired);
  assert.equal(Object.hasOwn(reviewed.entitlements, "monthlyTransactionalEmails"), !retired);
  assert.equal(reviewed.allowances.queueTickets, 5000);
  assert.equal(reviewed.entitlements.emailAlerts, true);
  assert.equal(plan.allowances.queueEmailJourneys, 5000);
});
