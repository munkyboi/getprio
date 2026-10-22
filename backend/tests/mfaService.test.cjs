const test = require("node:test");
const assert = require("node:assert/strict");

const {
  generateTotp,
  hashRecoveryCode,
  verifyTotp
} = require("../src/services/mfaService");

test("TOTP verification follows the RFC 6238 SHA-1 time-step vector", () => {
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  assert.equal(generateTotp(secret, { now: 59_000, digits: 8 }), "94287082");
  assert.equal(verifyTotp(secret, "94287082", { now: 59_000, digits: 8, window: 0 }), true);
  assert.equal(verifyTotp(secret, "94287081", { now: 59_000, digits: 8, window: 0 }), false);
});

test("recovery codes are normalized and one-way hashed", () => {
  assert.equal(
    hashRecoveryCode("ABCD-EFGH", "recovery-pepper"),
    hashRecoveryCode("abcd efgh", "recovery-pepper")
  );
  assert.notEqual(hashRecoveryCode("ABCD-EFGH", "recovery-pepper"), "ABCD-EFGH");
});
