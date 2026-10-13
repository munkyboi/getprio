const test = require("node:test");
const assert = require("node:assert/strict");
const { sectionWorkspace, workspaceItems, workspacePath, readPreference } = require("../src/vendor/workspace.js");

test("shared account follows explicit workspace while staff cannot enter Administration", () => {
  assert.equal(sectionWorkspace("account", "administration", true), "administration");
  assert.equal(sectionWorkspace("settings", "administration", false), "operations");
  assert.equal(sectionWorkspace("queue", "administration", true), "operations");
  assert.equal(sectionWorkspace("services", "operations", true), "administration");
});
test("workspace filtering cannot introduce an unavailable module", () => {
  const available = [{ section: "queue" }, { section: "settings" }, { section: "account" }];
  assert.deepEqual(workspaceItems(available, "operations"), [available[0], available[2]]);
  assert.deepEqual(workspaceItems(available, "administration"), [available[1], available[2]]);
});
test("workspace navigation preserves approval/payment return queries and hash", () => {
  const path = workspacePath("account", "administration", "?next=%2Fdashboard%2Fqueue&billing=success&checkout=123", "#security");
  assert.ok(path.startsWith("/dashboard/account?"));
  const url = new URL(path, "https://example.test");
  assert.equal(url.searchParams.get("next"), "/dashboard/queue");
  assert.equal(url.searchParams.get("checkout"), "123");
  assert.equal(url.hash, "#security");
});
test("unavailable preference storage cannot block dashboard access", () => {
  assert.equal(readPreference("key", { getItem() { throw new Error("blocked"); } }), null);
});
