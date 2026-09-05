const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("dashboard production source cannot import the throwaway plan entitlement prototype", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/main.tsx"), "utf8");
  assert.equal(source.includes("/prototype/plan-entitlements"), false);
  assert.doesNotMatch(source, /label: "Queue fees"/);
  assert.match(source, /path="\/queue-fees" element=\{<Navigate to="\/plans" replace/);
  assert.match(source, /path="\/plans" element=\{<PlanMatrixPage token=\{token\}/);
});

test("tenant records show the owner username between tenant name and slug", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/main.tsx"), "utf8");
  assert.match(
    source,
    /\{ key: "name", label: "Tenant" \}, \{ key: "username", label: "Username" \}, \{ key: "slug", label: "Slug" \}/
  );
});

test("plan and tenant pages retain settled controls and auditable credit administration", () => {
  const source = ["../src/pages/PlanMatrixPage.tsx", "../src/pages/TenantEntitlementsPage.tsx", "../src/pages/planControls.ts", "../src/main.tsx"].map((file) => fs.readFileSync(path.resolve(__dirname, file), "utf8")).join("\n");
  for (const feature of ["Queue system", "Public-facing branding", "Marketplace discovery", "Service booking", "Group-funded campaigns"]) assert.match(source, new RegExp(feature));
  for (const allowance of ["Queue Tickets / month", "Queue Email Journeys / month", "Service Bookings / month"]) assert.match(source, new RegExp(allowance));
  assert.match(source, /Vendor entitlement administration/);
  for (const control of ["Active locations", "Service counters", "Vendor seats", "History retention", "Queue settings", "Analytics", "CSV export", "Single sign-on"]) assert.match(source, new RegExp(control));
  assert.match(source, /Grant credits/);
  assert.match(source, /Remove unused/);
  assert.match(source, /className="plan-matrix__save"[\s\S]*?>Save changes<\/Button>/);
  assert.match(source, /disabled=\{!capabilities\.planPolicyMutations\}/);
  assert.match(source, /privileged-actions\/preview/);
  assert.doesNotMatch(source, /window\.prompt/);
});

test("plan and tenant privileged tasks retain canonical modal anatomy and allowance warnings", () => {
  const source = ["../src/pages/PlanMatrixPage.tsx", "../src/pages/TenantEntitlementsPage.tsx", "../src/components/CreditTaskModal.tsx"].map((file) => fs.readFileSync(path.resolve(__dirname, file), "utf8")).join("\n");
  assert.equal((source.match(/className="task-modal-form"/g) || []).length, 4);
  assert.equal((source.match(/className="task-modal-form__main"/g) || []).length, 4);
  assert.equal((source.match(/className="subscription-editor__footer"/g) || []).length, 4);
  assert.equal((source.match(/closeOnEscape=\{!busy\}/g) || []).length, 4);
  assert.equal((source.match(/closeOnClickOutside=\{!busy\}/g) || []).length, 4);
  assert.match(source, /warningThresholds/);
  assert.match(source, /notified/);
  assert.match(source, /pending/);
});

test("subscription administration retires direct editing and permanent deletion", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/main.tsx"), "utf8");
  assert.match(source, /auditable lifecycle transitions/i);
  assert.doesNotMatch(source, /Delete subscription/);
});

test("platform MFA enrollment renders a local authenticator QR with manual fallback", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/main.tsx"), "utf8");
  assert.match(source, /import StyledQRCode from "\.\/components\/StyledQRCode"/);
  assert.match(source, /<StyledQRCode[\s\S]*?value=\{mfaUri\}/);
  assert.match(source, /GetPrio authenticator setup QR code/);
  assert.match(source, /Can’t scan the QR code\?/);
  assert.match(source, />\{mfaSecret\}<\/Text>/);
});

test("platform MFA replacement requires recent password and current authenticator verification", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/main.tsx"), "utf8");
  assert.match(source, /function SettingsPage\(\{ token, user \}/);
  assert.match(source, /user\.mfaEnabled/);
  assert.match(source, /\/auth\/mfa\/step-up/);
  assert.match(source, /body: \{ password: mfaPassword, code: currentMfaCode \}/);
  assert.match(source, /body: mfaActive \? \{ currentCode: currentMfaCode \} : \{\}/);
  assert.match(source, /Replace authenticator/);
});

test("platform MFA login focuses the authenticator code field", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/main.tsx"), "utf8");
  assert.match(source, /<TextInput autoFocus autoComplete="one-time-code" inputMode="numeric" label="Authenticator code"/);
});

test("platform API retains the server-issued CSRF token for cross-subdomain requests", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/api.ts"), "utf8");
  assert.match(source, /sessionStorage\.getItem\(CSRF_STORAGE_KEY\)/);
  assert.match(source, /sessionStorage\.setItem\(CSRF_STORAGE_KEY, csrfToken\)/);
  assert.match(source, /rememberCsrfToken\(data\)/);
});


test("tenant entitlements have a direct route and are removed from the Plan Matrix", () => {
  const main = fs.readFileSync(path.resolve(__dirname, "../src/main.tsx"), "utf8");
  const plans = fs.readFileSync(path.resolve(__dirname, "../src/pages/PlanMatrixPage.tsx"), "utf8");
  const tenant = fs.readFileSync(path.resolve(__dirname, "../src/pages/TenantEntitlementsPage.tsx"), "utf8");
  assert.match(main, /path="\/tenants\/:tenantId\/entitlements"/);
  assert.doesNotMatch(plans, /loadCapacity|Grant credits|Add override|Remove unused/);
  assert.match(tenant, /useParams/);
  assert.match(tenant, /key=\{tenantId\}/);
  assert.doesNotMatch(tenant, /label="Vendor"|platform\/tenants\?limit/);
  assert.match(tenant, /Back to Tenants/);
});
