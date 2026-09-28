import assert from "node:assert/strict"
import test from "node:test"
import { resolvePlatformApiBaseUrl } from "../src/lib/platform-api-url.ts"
import { requiresPlatformSignIn } from "../src/lib/platform-session-recovery.ts"

test("local API hostname follows a localhost Platform page", () => {
  assert.equal(
    resolvePlatformApiBaseUrl("http://127.0.0.1:5001/api", "localhost", true),
    "http://localhost:5001/api"
  )
})

test("local API hostname follows a 127.0.0.1 Platform page", () => {
  assert.equal(
    resolvePlatformApiBaseUrl("http://localhost:5001/api", "127.0.0.1", true),
    "http://127.0.0.1:5001/api"
  )
})

test("non-loopback API hosts remain unchanged in development", () => {
  assert.equal(
    resolvePlatformApiBaseUrl("https://api.getprio.online/api", "localhost", true),
    "https://api.getprio.online/api"
  )
})

test("loopback host normalization is disabled outside development", () => {
  assert.equal(
    resolvePlatformApiBaseUrl("http://127.0.0.1:5001/api", "localhost", false),
    "http://127.0.0.1:5001/api"
  )
})

test("default API URL follows the local page hostname", () => {
  assert.equal(resolvePlatformApiBaseUrl(undefined, "localhost", true), "http://localhost:5001/api")
})

test("a failed CSRF refresh returns the browser to sign-in instead of showing access denied", () => {
  const error = Object.assign(new Error("CSRF validation failed"), { status: 403, code: "CSRF_VALIDATION_FAILED" })
  assert.equal(requiresPlatformSignIn(error), true)
})

test("authorization failures unrelated to CSRF remain access denied", () => {
  const error = Object.assign(new Error("Not authorized"), { status: 403, code: "PLATFORM_ACCESS_DENIED" })
  assert.equal(requiresPlatformSignIn(error), false)
})

test("missing or rejected refresh sessions return the browser to sign-in", () => {
  assert.equal(requiresPlatformSignIn(Object.assign(new Error("Missing refresh cookie"), { status: 400 })), true)
  assert.equal(requiresPlatformSignIn(Object.assign(new Error("Revoked session"), { status: 401 })), true)
})
