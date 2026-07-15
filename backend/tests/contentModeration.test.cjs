const assert = require("node:assert/strict");
const test = require("node:test");
const {
  assertPublicTextAllowed,
  findBlockedTerm,
  normalizeModerationText
} = require("../src/services/contentModeration");

test("content moderation detects common English, Filipino, and Bisaya blocked terms", () => {
  assert.equal(findBlockedTerm("This is bullshit"), "bullshit");
  assert.equal(findBlockedTerm("Gago ka"), "gago");
  assert.equal(findBlockedTerm("Yawa ka"), "yawa");
});

test("content moderation catches common separator and leetspeak evasions", () => {
  assert.equal(findBlockedTerm("f.u.c.k"), "fuck");
  assert.equal(findBlockedTerm("sh1t"), "shit");
  assert.equal(findBlockedTerm("p-u-t-a"), "puta");
  assert.equal(normalizeModerationText("  Y@W@  "), "yawa");
});

test("content moderation keeps ordinary public text available", () => {
  assert.equal(findBlockedTerm("Court 1 booking for Saturday"), "");
  assert.doesNotThrow(() => assertPublicTextAllowed("Family haircut appointment", "Service description"));
});

test("content moderation rejects blocked public text with a client-safe error", () => {
  assert.throws(
    () => assertPublicTextAllowed("You are a bogo", "Campaign description"),
    (error) => error.statusCode === 400 && /Campaign description contains language/.test(error.message)
  );
});
