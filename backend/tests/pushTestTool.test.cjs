const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

test("push test tool defaults to a dry run and parses a single installation filter", async () => {
  const tool = await import(pathToFileURL(
    path.resolve(__dirname, "../../scripts/push-test.mjs")
  ).href);

  assert.deepEqual(tool.parseArgs([
    "--user-id",
    "42",
    "--installation-id",
    "install-1",
    "--title",
    "Diagnostic",
    "--body",
    "Hello"
  ]), {
    userId: "42",
    installationId: "install-1",
    title: "Diagnostic",
    body: "Hello",
    send: false,
    allowNonProduction: false,
    help: false
  });
});

test("push test tool requires an explicit numeric user ID", async () => {
  const tool = await import(pathToFileURL(
    path.resolve(__dirname, "../../scripts/push-test.mjs")
  ).href);

  assert.throws(
    () => tool.parseArgs(["--user-id", "not-a-user"]),
    /positive numeric GetPrio user ID/
  );
});
