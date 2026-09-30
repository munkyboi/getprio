import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8")
const contracts = readFileSync(new URL("../src/lib/platform-contracts.ts", import.meta.url), "utf8")
const api = readFileSync(new URL("../src/lib/platform-api.ts", import.meta.url), "utf8")

test("User details expose audited global-role, MFA-recovery, and sign-in access controls", () => {
  assert.match(app, /Manage global roles/)
  assert.match(app, /Reset MFA enrollment/)
  assert.match(app, /Suspend sign-in access/)
  assert.match(app, /Restore sign-in access/)
  assert.match(app, /Recent MFA assurance is required/)
  assert.match(app, /Tenant memberships are unchanged/)
  assert.match(app, /MFA secrets and recovery codes/)
  assert.match(app, /ACCOUNT MANAGEMENT/)
  assert.match(app, /ACCOUNT SECURITY/)
  assert.match(app, /ACCOUNT ACCESS/)
  assert.match(app, /min-h-11 w-full sm:w-auto/)
})

test("user-management API contracts keep previews and confirmed actions separate", () => {
  assert.match(contracts, /previewUserRolesUpdate\(/)
  assert.match(contracts, /executeUserRolesUpdate\(/)
  assert.match(contracts, /previewUserMfaReset\(/)
  assert.match(contracts, /previewUserAccessUpdate\(/)
  assert.match(api, /\/platform\/users\/\$\{encodeURIComponent\(preview\.targetId\)\}\/roles/)
  assert.match(api, /\/platform\/users\/\$\{encodeURIComponent\(preview\.targetId\)\}\/mfa\/reset/)
  assert.match(api, /\/platform\/users\/\$\{encodeURIComponent\(preview\.targetId\)\}\/access/)
  assert.match(api, /X-Transaction-Confirmation/)
})
