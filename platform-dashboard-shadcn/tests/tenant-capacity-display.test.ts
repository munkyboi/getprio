import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { capacityCount, capacityEvidence, capacityPeriod, visibleCapacityResources } from "../../shared/tenantCapacityDisplay.ts"

test("unavailable usage is never formatted as zero", () => {
  assert.equal(capacityCount(null), "Unavailable")
  assert.equal(capacityCount(undefined), "Unavailable")
  assert.equal(capacityCount(0), "0")
  assert.equal(capacityCount(7), "7")
  assert.equal(capacityCount(7, false), "Unavailable")
})

test("only ticket and booking capacity remains operational", () => {
  assert.deepEqual(visibleCapacityResources({ queueTickets: {}, queueEmailJourneys: {}, serviceBookings: {} }).map(([key]) => key), ["queueTickets", "serviceBookings"])
})

test("shared evidence distinguishes partial accounting from enforcement", () => {
  const lines = capacityEvidence({ observedUsed: 10, baseUsed: 3, creditUsed: 3, unaccountedUsed: 4, accountingStatus: "partial", enforcementEnabled: false })
  assert.equal(lines[1].text, "Ledger: 3 base · 3 credit · 4 unaccounted")
  assert.equal(lines[2].attention, true)
  assert.equal(lines[3].text, "Quota enforcement: disabled")
  assert.match(capacityEvidence({ observedUsed: 0 }, false)[0].text, /Unavailable/)
})

test("usage period exposes the exact server window and rejects invalid dates", () => {
  assert.equal(capacityPeriod({ start: "2026-10-01T00:00:00Z", end: "2026-11-01T00:00:00Z" }), "2026-10-01T00:00:00.000Z → 2026-11-01T00:00:00.000Z (end exclusive)")
  assert.equal(capacityPeriod(null), "Usage period unavailable")
  assert.equal(capacityPeriod({ start: "invalid", end: "2026-11-01" }), "Usage period unavailable")
})

test("tenant and plan editors do not expose email journey grants or overrides", () => {
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8")
  const matrix = readFileSync(new URL("../src/components/plan-matrix.tsx", import.meta.url), "utf8")
  assert.doesNotMatch(app, /Email journey credits|"allowance\.queueEmailJourneys",/)
  assert.match(app, /override\.policyKey !== "allowance\.queueEmailJourneys"/)
  assert.doesNotMatch(matrix, /Email journeys \/ month/)
  assert.match(app, /lot\.resourceKey === "queueTickets"/)
})
