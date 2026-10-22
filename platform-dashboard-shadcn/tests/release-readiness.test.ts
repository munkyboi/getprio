import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8")
const api = readFileSync(new URL("../src/lib/platform-api.ts", import.meta.url), "utf8")

test("release readiness preview keeps production status unknown without deployment observations", () => {
  const fixture = api.slice(api.indexOf("const releaseReadiness:"), api.indexOf("const fixtureCapabilities"))
  assert.match(fixture, /label: "Verified ready", value: "0"/)
  assert.match(fixture, /label: "Review required", value: "2"/)
  assert.match(fixture, /label: "Blocked", value: "0"/)
  assert.match(fixture, /label: "Not observed", value: "3"/)
  assert.match(fixture, /id: "platform-web"[^\n]*state: "unknown"[^\n]*No verified production deployment observation is connected/)
  assert.match(fixture, /id: "platform-api"[^\n]*state: "unknown"[^\n]*Authenticated production smoke evidence has not been observed/)
})

test("release readiness explains the production evidence boundary and shows each status count", () => {
  const readinessSection = app.slice(app.indexOf("function ReleaseReadiness"), app.indexOf("function Overview"))
  const releaseStateBadge = app.slice(app.indexOf("function ReleaseStateBadge"), app.indexOf("const releaseSurfaceColumns"))
  assert.match(readinessSection, /sm:grid-cols-2 xl:grid-cols-5/)
  assert.match(readinessSection, /Development URLs are never treated as production/)
  assert.match(readinessSection, /Latest authenticated production smoke/)
  assert.match(readinessSection, /Open workflow run/)
  assert.match(releaseStateBadge, /return <Badge variant="secondary">Not observed<\/Badge>/)
})
