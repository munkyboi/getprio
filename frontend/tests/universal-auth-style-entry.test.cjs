const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const entry = fs.readFileSync(path.join(root, "src/surfaces/MarketingApp.tsx"), "utf8");
const authStyles = fs.readFileSync(path.join(root, "src/pages/universal-auth.css"), "utf8");
const authPage = fs.readFileSync(path.join(root, "src/pages/UniversalAuthPage.tsx"), "utf8");
const customerFallback = fs.readFileSync(path.join(root, "src/customer/components/CustomerFallbackPresentations.tsx"), "utf8");
const customerHome = fs.readFileSync(path.join(root, "src/customer/pages/CustomerHomePage.tsx"), "utf8");
const authEnabled = fs.readFileSync(path.join(root, "src/surfaces/publicAuthEnabled.ts"), "utf8");

test("universal auth keeps its complete style and provider entry contract", () => {
assert.match(entry, /import "\.\.\/styles\.css"/u);
assert.match(entry, /import "\.\.\/vendor\/styles\.css"/u);
assert.match(entry, /import "\.\.\/pages\/universal-auth\.css"/u);
assert.equal([...entry.matchAll(/<PublicThemeProvider>/gu)].length, 1);
assert.match(authStyles, /\.universal-auth-card/u);
assert.match(authStyles, /\[data-slot=input\]/u);
assert.match(authStyles, /\[data-slot=tabs-trigger\]/u);
assert.match(authStyles, /tabs-trigger\] \{ flex: 1; border: 1px solid transparent; background: transparent; \}/u);
assert.match(authStyles, /data-public-theme="dark".*color-mix\(in srgb, var\(--card\) 58%, var\(--secondary\)\)/su);
assert.match(authPage, /provider === "apple"/u);
assert.match(customerFallback, /oauthProviders\.apple \?/u);
assert.match(authEnabled, /VITE_APP_SURFACE === "marketing"/u);
});

test("customer empty dashboard uses a committed illustration asset", () => {
  assert.match(customerHome, /\/illustrations\/generated\/dashboard-empty-transparent\.png/u);
  assert.match(customerHome, /\/illustrations\/generated\/dashboard-empty-transparent-dark\.png/u);
  assert.doesNotMatch(customerHome, /illustrations\/customer\/dashboard-empty(?:-dark)?\.png/u);
});

test("universal auth submits use the Marketing brand fill and accessible text", () => {
  const primary = authStyles.match(/\.universal-auth-primary\s*\{([^}]+)\}/u)?.[1] || "";
  assert.match(primary, /background-color:\s*#ff7a1a\s*;/u);
  assert.match(primary, /(?:^|\s)color:\s*#1f2933\s*;/u);
  assert.match(authStyles, /\.universal-auth-session-primary\s*\{[^}]*color:\s*#1f2933\s*!important/u);
  for (const [, declarations] of authStyles.matchAll(/\.universal-auth-primary\b[^{}]*\{([^}]+)\}/gu)) {
    assert.doesNotMatch(declarations, /text-shadow|text-stroke|paint-order/u);
  }
});

test("signed-in universal auth hides signed-out affordances and limits vendor access", () => {
  assert.match(authPage, /const vendorAccess = !identity \|\| hasVendorAccess\(identity\)/u);
  assert.match(authPage, /vendorAccess && <TabsTrigger value="vendor"/u);
  assert.match(authPage, /!identity && <Button variant="link" type="button" className="universal-auth-link"/u);
  assert.match(authPage, /!challenge && !identity && <CardFooter>/u);
  assert.match(authPage, /!identity && <p className="universal-auth-intent">/u);
});

test("universal auth fields use softened theme-aware borders with distinct focus state", () => {
  assert.match(authStyles, /--auth-input-border:\s*color-mix\(in srgb, var\(--border\) 80%, var\(--background\)\)/u);
  assert.match(authStyles, /data-theme=dark[\s\S]*--auth-input-border:\s*color-mix\(in srgb, var\(--border\) 68%, var\(--background\)\)/u);
  assert.match(authStyles, /\[data-slot=input\]:focus-visible[\s\S]*border-color:\s*var\(--link\)/u);
});
