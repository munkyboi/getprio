import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8")
const contracts = readFileSync(new URL("../src/lib/platform-contracts.ts", import.meta.url), "utf8")
const api = readFileSync(new URL("../src/lib/platform-api.ts", import.meta.url), "utf8")
const matrix = readFileSync(new URL("../src/components/plan-matrix.tsx", import.meta.url), "utf8")

test("Plan Matrix has its own permissioned Governance route", () => {
  assert.match(app, /label: "Plan Matrix", icon: Settings2, capability: "platform\.billing\.read"/)
  assert.match(app, /"Plan Matrix": "\/plans"/)
  assert.match(app, /if \(route === "Plan Matrix"\) return <PlanMatrix \/>/)
})

test("plan API contract includes read, server preview, and separately confirmed publish actions", () => {
  assert.match(contracts, /getPlanMatrix\(\): Promise<PlatformPlanMatrix>/)
  assert.match(contracts, /previewPlanPolicy\(/)
  assert.match(contracts, /publishPlan\(/)
  assert.match(contracts, /publishQueueFees\(/)
  assert.match(api, /\/platform\/plans/)
  assert.match(api, /\/platform\/queue-fees/)
  assert.match(api, /subscriptionsByPlan/)
  assert.match(api, /\/platform\/privileged-actions\/preview/)
  assert.match(api, /X-Transaction-Confirmation/)
})

test("Plan Matrix preserves review gates, audits reasons, and keeps credit catalog out of the slice", () => {
  assert.match(matrix, /planPolicyMutations/)
  assert.match(matrix, /platform\.plans\.manage/)
  assert.match(matrix, /platform\.queue_fees\.manage/)
  assert.match(matrix, /activeSubscribersByPlan/)
  assert.match(matrix, /audit reason/i)
  assert.match(matrix, /Review and publish/)
  assert.doesNotMatch(matrix, /Usage Credit catalog|CreditTaskModal/)
})
