import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8")
const contracts = readFileSync(new URL("../src/lib/platform-contracts.ts", import.meta.url), "utf8")
const api = readFileSync(new URL("../src/lib/platform-api.ts", import.meta.url), "utf8")
const editor = readFileSync(new URL("../src/components/platform-settings-editor.tsx", import.meta.url), "utf8")
const backend = readFileSync(new URL("../../backend/src/routes/platformRoutes.js", import.meta.url), "utf8")

test("Settings editor exposes only validated platform defaults with fixture mode read-only", () => {
  assert.match(app, /<PlatformSettingsEditor settings=\{settings\.settings\}/)
  assert.match(app, /editable=\{usesLiveData && availableCapabilities\.has\("platform\.settings\.manage"\)\}/)
  assert.match(editor, /enterpriseInquiryEmail/)
  assert.match(editor, /defaultTimezone/)
  assert.match(editor, /maxImageUploadKb/)
  assert.match(editor, /mobileApprovedHosts/)
  assert.match(editor, /Read-only preview/)
})

test("Settings writes require an audit reason and are recorded transactionally", () => {
  assert.match(contracts, /updateSettings\(settings: PlatformSettingsReadModel\["settings"\], reason: string, expectedSettings: PlatformSettingsReadModel\["settings"\]\)/)
  assert.match(api, /\/platform\/settings.*PATCH/s)
  assert.match(editor, /Audit reason/)
  assert.match(backend, /platform\.settings\.update/)
  assert.match(backend, /changedFields/)
  assert.match(backend, /requestedReason\.length < 8/)
  assert.match(backend, /SETTINGS_CHANGED/)
  assert.match(backend, /db\.withTransaction/)
})
