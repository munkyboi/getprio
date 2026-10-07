const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "../..");
const release = JSON.parse(fs.readFileSync(path.join(root, "developer-portal/src/sandboxIosTestFlightRelease.json"), "utf8"));

test("Developer Portal identifies the current Sandbox TestFlight build", () => {
  const workspace = fs.readFileSync(path.join(root, "developer-portal/src/DeveloperWorkspace.tsx"), "utf8");

  assert.equal(release.versionName, "1.0.3");
  assert.equal(release.buildNumber, 5);
  assert.match(workspace, /Current TestFlight · \{sandboxIosTestFlightVersion\}/);
  assert.match(workspace, /Apple TestFlight build/);
});
