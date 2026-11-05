import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const source = readFileSync(new URL("../src/lib/platform-api.ts", import.meta.url), "utf8")

test("live Platform read-model requests use the same loopback host as sign-in cookies", () => {
  assert.ok(source.includes('import { resolvePlatformApiBaseUrl } from "@/lib/platform-api-url"'))
  assert.ok(source.includes("const API_BASE_URL = resolvePlatformApiBaseUrl(import.meta.env.VITE_API_URL, window.location.hostname, import.meta.env.DEV)"))
  assert.ok(source.includes("function createHttpPlatformApi(baseUrl = API_BASE_URL)"))
})
