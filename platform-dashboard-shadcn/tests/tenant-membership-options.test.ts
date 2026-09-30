import test from "node:test"
import assert from "node:assert/strict"
import { tenantMembershipOptions } from "../src/lib/tenant-membership-options.ts"

test("membership editor includes existing inactive tenants outside the overview list", () => {
  assert.deepEqual(tenantMembershipOptions([
    { tenantId: "901", tenantName: "Archived branch", role: "staff", isActive: false },
    { tenantId: "42", tenantName: "Main branch", role: "owner", isActive: true },
  ]), [
    { id: "901", name: "Archived branch" },
    { id: "42", name: "Main branch" },
  ])
  assert.deepEqual(tenantMembershipOptions([]), [])
})
