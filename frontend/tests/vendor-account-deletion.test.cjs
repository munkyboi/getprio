const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const page = fs.readFileSync(path.join(root, "src/pages/VendorDashboardPage.tsx"), "utf8");
const panel = fs.readFileSync(path.join(root, "src/components/VendorAccountDeletionPanel.tsx"), "utf8");

test("vendor account deletion request is available from Account security", () => {
  const securityPage = page.match(/function renderSecurityPage\(\) \{([\s\S]*?)\n  function renderAccountPage\(\)/)?.[1];
  assert.ok(securityPage, "expected Account security renderer");
  assert.match(securityPage, /<VendorAccountDeletionPanel\s*\/>/);
  assert.match(page, /<Tabs\.Panel pt="lg" value="security">\s*\{renderSecurityPage\(\)\}/);
});

test("vendor deletion request explains account-wide impact and uses guarded self-service endpoints", () => {
  assert.match(panel, /\/account\/deletion-options/);
  assert.match(panel, /\/account\/delete/);
  assert.match(panel, /method: "POST"/);
  assert.match(panel, /token\s*\}/);
  assert.match(panel, /across your vendor workspaces/);
  assert.match(panel, /not automatically cancelled or refunded/);
  assert.match(panel, /await logout\(\)/);
});
