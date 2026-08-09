const test = require("node:test");
const assert = require("node:assert/strict");

const { sanitizeText } = require("../src/services/securityAuditService");

test("security audit text removes control characters without corrupting Unicode", () => {
  assert.equal(sanitizeText("  approved\u0000  by 😀 staff  "), "approved by 😀 staff");
});
