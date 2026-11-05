require("tsx/cjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { MantineProvider } = require("@mantine/core");
const { OtpInputField } = require("../src/components/OtpInputField.tsx");

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
