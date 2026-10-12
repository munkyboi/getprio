const test = require("node:test");
const assert = require("node:assert/strict");
const { sealBrowserSecret, openBrowserSecret } = require("../src/services/queueBoardCookie");

test("display cookie encrypts credentials and rejects tampering and cross-board reuse", () => {
  const secret = "ab".repeat(32);
  const board = "063b7899-ffbe-482c-9564-91a5a6c79be0";
  const sealed = sealBrowserSecret(secret, board);
  assert.equal(openBrowserSecret(sealed, board), secret);
  assert.ok(!sealed.includes(secret));
  assert.notEqual(sealBrowserSecret(secret, board), sealed);
  assert.equal(openBrowserSecret(sealed, "063b7899-ffbe-482c-9564-91a5a6c79be1"), "");
  const payload = Buffer.from(sealed.slice(3), "base64url");
  for (const index of [0, 12, 28, payload.length - 1]) {
    const changed = Buffer.from(payload); changed[index] ^= 1;
    assert.equal(openBrowserSecret(`v1.${changed.toString("base64url")}`, board), "");
  }
  for (const invalid of [secret, "v2.foo", "v1.bad", "", null]) assert.equal(openBrowserSecret(invalid, board), "");
});
