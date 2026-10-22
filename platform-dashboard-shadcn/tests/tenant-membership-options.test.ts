import test from "node:test"
import assert from "node:assert/strict"
import { tenantMembershipOptions, membershipSessionNotice } from "../src/lib/tenant-membership-options.ts"

test("unchanged membership previews explain that active sessions are preserved", () => {
  assert.equal(membershipSessionNotice({ previousRole: "admin", previouslyActive: true, role: "admin", active: true }), "No changes will be made. Active sessions will remain signed in.")
})

test("role and active-state changes warn that sessions will be revoked", () => {
  assert.equal(membershipSessionNotice({ previousRole: "owner", previouslyActive: true, role: "admin", active: true }), "Active sessions will be revoked.")
  assert.equal(membershipSessionNotice({ previousRole: "admin", previouslyActive: true, role: "admin", active: false }), "Active sessions will be revoked.")
})

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
