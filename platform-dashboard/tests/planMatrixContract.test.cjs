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

test("Option A Plan Matrix includes all settled controls and auditable credit administration", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/pages/PlanMatrixPage.tsx"), "utf8");
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

test("Plan Matrix privileged tasks use canonical modal anatomy and expose allowance warnings", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/pages/PlanMatrixPage.tsx"), "utf8");
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
  assert.match(source, /import QRCode from "react-qr-code"/);
  assert.match(source, /<QRCode[\s\S]*?value=\{mfaUri\}/);
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
