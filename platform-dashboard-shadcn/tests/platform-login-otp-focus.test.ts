import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const source = readFileSync(new URL("../src/components/platform-login.tsx", import.meta.url), "utf8")

test("Platform sign-in focuses the OTP input when a verification method becomes active", () => {
  assert.match(source, /const otpInputRef = useRef<HTMLInputElement>\(null\)/)
  assert.match(source, /otpInputRef\.current\?\.focus\(\{ preventScroll: true \}\)/)
  assert.match(source, /<InputOTP[^>]*ref=\{otpInputRef\}/s)
  assert.match(source, /\[challengeToken, method, emailSent\]/)
})
