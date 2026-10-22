const test = require("node:test");
const assert = require("node:assert/strict");

const {
  assertReleaseControl,
  requireReleaseControl
} = require("../src/middleware/releaseControl");

test("release control assertion fails closed with a stable public error", () => {
  assert.throws(
    () => assertReleaseControl("usageCreditDisputes", { usageCreditDisputes: false }),
    (error) => {
      assert.equal(error.statusCode, 404);
      assert.equal(error.code, "RELEASE_CONTROL_DISABLED");
      assert.equal(error.releaseControl, "usageCreditDisputes");
      assert.equal(error.message, "This feature is not available.");
      return true;
    }
  );
});

test("release control assertion accepts only boolean true", () => {
  assert.doesNotThrow(() => assertReleaseControl("usageCreditDisputes", { usageCreditDisputes: true }));
  assert.throws(() => assertReleaseControl("usageCreditDisputes", { usageCreditDisputes: "true" }), /not available/i);
});

test("release control middleware blocks before later handlers", async () => {
  let disabledErrorForwarded = false;
  const middleware = requireReleaseControl("allowanceRepairs", { allowanceRepairs: false });

  await new Promise((resolve) => {
    middleware({}, {}, (error) => {
      assert.equal(error.code, "RELEASE_CONTROL_DISABLED");
      disabledErrorForwarded = true;
      resolve();
    });
  });

  assert.equal(disabledErrorForwarded, true);
});

test("unknown release controls fail during route construction", () => {
  assert.throws(() => requireReleaseControl("misspelledControl"), /Unknown release control/);
});
