import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8")
const tableSource = readFileSync(new URL("../src/components/platform-data-table.tsx", import.meta.url), "utf8")
const tenantsSource = appSource.slice(appSource.indexOf("function Tenants("), appSource.indexOf("function UserStateBadge("))

test("tenant rows open and highlight the selected subscription details sheet", () => {
  assert.match(tenantsSource, /onRowClick=\{\(row\) => void inspect\(row\)\}/)
  assert.match(tenantsSource, /getRowLabel=\{\(row\) => `View subscription details for \$\{row\.name\}`\}/)
  assert.match(tenantsSource, /isRowSelected=\{\(row\) => selectedTenant\?\.id === row\.id\}/)
  assert.doesNotMatch(tenantsSource, /Inspect posture/)
})

test("opening Usage credits does not bubble into the tenant row sheet", () => {
  const managerStart = appSource.indexOf("function TenantCreditManager(")
  const managerEnd = appSource.indexOf("function Tenants(", managerStart)
  const managerSource = appSource.slice(managerStart, managerEnd)

  assert.match(managerSource, /<Button[^>]*onClick=\{\(event\) => \{ event\.stopPropagation\(\); openManager\(\) \}\}>Usage credits<\/Button>/)
})

test("portal overlay clicks outside a row cannot activate that row", () => {
  assert.ok(tableSource.includes("const target = event.target instanceof Element ? event.target : event.target instanceof Node ? event.target.parentElement : null; if (!target || !event.currentTarget.contains(target)) return"))
})

test("tenant details sheet presents actual subscription identity and plan state", () => {
  assert.match(tenantsSource, /<SheetContent side="right"/)
  assert.match(tenantsSource, /<SheetTitle>\{selectedTenant\?\.name \|\| "Subscription details"\}<\/SheetTitle>/)
  assert.match(tenantsSource, /inspection\.capacity\.subscriptionId \|\| "No subscription linked"/)
  assert.match(tenantsSource, /inspection\.capacity\.planSlug \|\| "No plan signal"/)
  assert.match(tenantsSource, /inspection\.capacity\.lifecycleState \|\| "Unknown"/)
  assert.match(tenantsSource, /Allowance posture/)
})
