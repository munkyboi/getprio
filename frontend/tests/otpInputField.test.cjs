require("tsx/cjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { MantineProvider } = require("@mantine/core");
const { OtpInputField, otpVerificationDecision } = require("../src/components/OtpInputField.tsx");

function markup(props = {}) {
  return renderToStaticMarkup(React.createElement(MantineProvider, null,
    React.createElement(OtpInputField, { label: "Verification code", value: "", onChange() {}, ...props })));
}

test("OTP exposes six masked numeric fields with blank placeholders and autofill", () => {
  const fields = markup({ value: "012345" }).match(/<input[^>]*type="password"[^>]*>/g);
  assert.equal(fields.length, 6);
  fields.forEach((field, index) => {
    assert.match(field, /inputMode="numeric"/);
    assert.match(field, /autoComplete="one-time-code"/);
    assert.match(field, /placeholder=""/);
    assert.match(field, new RegExp(`digit ${index + 1} of 6`));
  });
});

test("OTP keeps verification inputs disabled while a request is pending", () => {
  const fields = markup({ disabled: true }).match(/<input[^>]*type="password"[^>]*>/g);
  assert.equal(fields.length, 6);
  fields.forEach((field) => assert.match(field, /disabled=""/));
});

test("OTP auto-validation starts once for a complete code and ignores duplicate commits", () => {
  const first = otpVerificationDecision("012345", "challenge-1", "", true, false);
  assert.deepEqual(first, { attempt: "challenge-1:012345", complete: true, shouldVerify: true });
  const duplicate = otpVerificationDecision("012345", "challenge-1", first.attempt, true, false);
  assert.equal(duplicate.shouldVerify, false);
  assert.equal(duplicate.complete, true);
});

test("OTP auto-validation does not start for partial or guarded input", () => {
  assert.equal(otpVerificationDecision("01234", "challenge-1", "", true, false).shouldVerify, false);
  assert.equal(otpVerificationDecision("012345", "challenge-1", "", false, false).shouldVerify, false);
  assert.equal(otpVerificationDecision("012345", "challenge-1", "", true, true).shouldVerify, false);
});
