const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const page = fs.readFileSync(path.join(root, "src/pages/VendorDashboardPage.tsx"), "utf8");
const panel = fs.readFileSync(path.join(root, "src/components/AccountDeletionPanel.tsx"), "utf8");

test("vendor Account security keeps password and MFA controls together", () => {
  const securityPage = page.match(/function renderSecurityPage\(\) \{([\s\S]*?)\n  function renderAccountPage\(\)/)?.[1];
  assert.ok(securityPage, "expected Account security renderer");
  assert.match(securityPage, /Change password/);
  assert.match(securityPage, /Authenticator setup required|MFA/);
  assert.match(page, /renderSecurityPage\(\)/);
});

test("shared deletion panel retains guarded customer endpoint contract", () => {
  assert.match(panel, /\/account\/deletion-options/);
  assert.match(panel, /\/account\/delete/);
  assert.match(panel, /method: "POST"/);
  assert.match(panel, /not automatically cancelled or refunded/);
});
