require("tsx/cjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildVendorFilterParams, filterVendorProfiles } = require("../src/customer/pages/CustomerExplorePage.tsx");

test("vendor search and category filters are bookmarkable and preserve unrelated query state", () => {
  const params = buildVendorFilterParams(new URLSearchParams("intent=join&search=old"), "  dental clinic  ", "Dental");
  assert.equal(params.toString(), "intent=join&search=dental+clinic&category=Dental");
  const reset = buildVendorFilterParams(params, "", "All");
  assert.equal(reset.toString(), "intent=join");
});

test("vendor category filtering composes with the server search result", () => {
  const vendors = [
    { slug: "a", category: "Dental" },
    { slug: "b", category: "Salon" },
  ];
  assert.deepEqual(filterVendorProfiles(vendors, "Dental").map((v) => v.slug), ["a"]);
  assert.deepEqual(filterVendorProfiles(vendors, "All").map((v) => v.slug), ["a", "b"]);
});

test("vendor directory syncs browser history and debounces search updates", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/customer/pages/CustomerExplorePage.tsx"), "utf8");
  assert.match(source, /useSearchParams\(\)/);
  assert.match(source, /setSearchParams\(params, \{ replace: true \}\)/);
  assert.match(source, /window\.setTimeout\([\s\S]*?350/);
  assert.match(source, /setSearch\(query\).*setCategory\(categoryQuery\)/s);
  assert.match(source, /new AbortController\(\)/);
});

test("vendor cards keep metadata columns from collapsing or overflowing", () => {
  const css = fs.readFileSync(path.resolve(__dirname, "../src/customer/customer-theme.css"), "utf8");
  assert.match(css, /\.customer-directory-card \{[^}]*flex-direction: column;[^}]*min-width: 0;/s);
  assert.match(css, /\.customer-directory-card \[data-slot="card-title"\],[\s\S]*overflow-wrap: anywhere;/);
});

test("vendor detail cards use opaque theme surfaces", () => {
  const css = fs.readFileSync(path.resolve(__dirname, "../src/customer/customer-theme.css"), "utf8");
  assert.match(css, /html\[data-customer-theme\] \.customer-vendor-content \{[\s\S]*isolation: isolate;[\s\S]*background-color: var\(--card\) !important;/);
  assert.match(css, /\.customer-vendor-content \.customer-vendor-queue,[\s\S]*background: var\(--card\);[\s\S]*opacity: 1;/);
  assert.match(css, /customer-vendor-service > \[data-slot="card-footer"\],[\s\S]*background-color: var\(--card\) !important;/);
});
