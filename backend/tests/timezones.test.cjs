const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_TIMEZONE,
  isValidTimeZone,
  normalizeTimeZone
} = require("../src/utils/timezones");

test("timezone helpers normalize defaults and reject unknown zones", () => {
  assert.equal(DEFAULT_TIMEZONE, "Asia/Manila");
  assert.equal(normalizeTimeZone(" Pacific/Auckland "), "Pacific/Auckland");
  assert.equal(normalizeTimeZone(""), DEFAULT_TIMEZONE);
  assert.equal(isValidTimeZone("Asia/Manila"), true);
  assert.equal(isValidTimeZone("UTC"), true);
  assert.equal(isValidTimeZone("Not/A_Timezone"), false);
});
