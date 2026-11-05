const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "../..");
const release = JSON.parse(fs.readFileSync(path.join(root, "developer-portal/src/sandboxAndroidApkRelease.json"), "utf8"));

test("Developer Portal Android release metadata matches the downloadable APK", () => {
  const apkPath = path.join(root, "developer-portal/public/downloads", release.fileName);
  const digest = crypto.createHash("sha256").update(fs.readFileSync(apkPath)).digest("hex");
  const workspace = fs.readFileSync(path.join(root, "developer-portal/src/DeveloperWorkspace.tsx"), "utf8");

  assert.equal(release.versionName, "1.0.3");
  assert.equal(release.versionCode, 5);
  assert.equal(digest, release.sha256);
  assert.match(workspace, /Current APK · \{sandboxAndroidApkVersion\}/);
  assert.match(workspace, /download=\{!isIos \? sandboxAndroidApkRelease\.fileName : undefined\}/);
});
