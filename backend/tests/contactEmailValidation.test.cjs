const test = require("node:test");
const assert = require("node:assert/strict");
const { isValidContactEmail } = require("../src/utils/email");

test("contact email validation preserves the existing simple address policy", () => {
  for (const email of ["ops@example.com", "first.last+tag@sub.example.com", "!@!.!", "a@a.b.", "a@.a.b"]) {
    assert.equal(isValidContactEmail(email), true, email);
  }
  for (const email of ["", "@example.com", "a@.b", "a@a.", "a@example", "a@@example.com", "a b@example.com", "a@exam\nple.com", null, [], {}]) {
    assert.equal(isValidContactEmail(email), false, String(email));
  }
});

test("contact email validation handles long hostile inputs without backtracking", { timeout: 1000 }, () => {
  assert.equal(isValidContactEmail(`!@!.${"!.".repeat(100000)} `), false);
  assert.equal(isValidContactEmail(`!@!.${"!.".repeat(100000)}@`), false);
  assert.equal(isValidContactEmail(`!@!.${"!.".repeat(100000)}`), true);
});
