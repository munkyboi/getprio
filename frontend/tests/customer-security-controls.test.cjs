const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const customerPage = fs.readFileSync(path.join(root, "src/pages/CustomerAccountPage.tsx"), "utf8");
const loginPage = fs.readFileSync(path.join(root, "src/pages/LoginPage.tsx"), "utf8");
const authContext = fs.readFileSync(path.join(root, "src/context/AuthContext.tsx"), "utf8");
const deletionPanelPath = path.join(root, "src/components/AccountDeletionPanel.tsx");
const deletionPanel = fs.existsSync(deletionPanelPath) ? fs.readFileSync(deletionPanelPath, "utf8") : "";
const emailMfaPanel = fs.readFileSync(path.join(root, "src/components/EmailMfaSettingsPanel.tsx"), "utf8");

test("customer Account security exposes the shared self-service deletion request", () => {
  const securityPage = customerPage.slice(customerPage.indexOf("const renderSecurity ="), customerPage.indexOf("const renderActiveSection"));
  assert.match(securityPage, /<AccountDeletionPanel\s+accountType="customer"\s*\/>/);
  assert.match(deletionPanel, /\/account\/deletion-options/);
  assert.match(deletionPanel, /\/account\/delete/);
  assert.match(deletionPanel, /type AccountType = "customer" \| "vendor"/);
  assert.match(deletionPanel, /personal data/);
  assert.match(deletionPanel, /not automatically cancelled or refunded/);
});

test("customer Account security can enable and disable Email OTP independently", () => {
  const securityPage = customerPage.slice(customerPage.indexOf("const renderSecurity ="), customerPage.indexOf("const renderActiveSection"));
  assert.match(securityPage, /<EmailMfaSettingsPanel\s+variant="customer"/);
  assert.match(emailMfaPanel, /\/auth\/mfa\/email\/enable/);
  assert.match(emailMfaPanel, /\/auth\/mfa\/email\/disable/);
  assert.match(emailMfaPanel, /emailVerified/);
  assert.match(fs.readFileSync(path.join(root, "src/pages/VendorDashboardPage.tsx"), "utf8"), /<EmailMfaSettingsPanel\s+variant="vendor"/);
});

test("login offers the email fallback only when both authenticator and email methods are available", () => {
  assert.match(loginPage, /Send email OTP instead/);
  assert.match(loginPage, /mfaMethods\.includes\("totp"\)[\s\S]*mfaMethods\.includes\("email"\)/);
  assert.match(authContext, /\/auth\/mfa\/email\/send/);
  assert.match(loginPage, /method:\s*"email"/);
  assert.match(loginPage, /Use authenticator app instead/);
});
