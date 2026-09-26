const test = require("node:test");
const assert = require("node:assert/strict");
const { alias, templateContent, buildTemplateEmail } = require("../src/services/developerPasswordResendTemplates");

test("developer password reset uses the managed Resend template contract", () => {
  const email = buildTemplateEmail({
    resetUrl: "https://portal.getprio.online/reset-password?token=reset-token",
    expiresAt: "2026-09-26T13:00:00.000Z"
  });
  assert.equal(email.subject, "Reset your GetPrio Developer Portal password");
  assert.equal(email.resendTemplate.id, alias);
  assert.deepEqual(email.resendTemplate.variables, {
    ACTION_URL: "https://portal.getprio.online/reset-password?token=reset-token",
    EXPIRY_TEXT: "2026-09-26T13:00:00.000Z"
  });
});

test("managed password reset template exposes only the expected variables", () => {
  const content = templateContent();
  assert.deepEqual(content.variables, [
    { key: "ACTION_URL", type: "string" },
    { key: "EXPIRY_TEXT", type: "string" }
  ]);
  assert.match(content.html, /\{\{\{ACTION_URL\}\}\}/);
  assert.match(content.html, /\{\{\{EXPIRY_TEXT\}\}\}/);
  assert.match(content.text, /\{\{\{ACTION_URL\}\}\}/);
  assert.match(content.text, /\{\{\{EXPIRY_TEXT\}\}\}/);
  assert.doesNotMatch(content.html, /GPVAR_/);
  assert.doesNotMatch(content.text, /GPVAR_/);
});

test("managed password reset template rejects invalid inputs", () => {
  assert.throws(() => buildTemplateEmail({ resetUrl: "javascript:alert(1)", expiresAt: "2026-09-26T13:00:00.000Z" }), /Invalid developer password reset URL/);
  assert.throws(() => buildTemplateEmail({ resetUrl: "https://portal.getprio.online/reset", expiresAt: "not-a-date" }), /Invalid time value/);
});
