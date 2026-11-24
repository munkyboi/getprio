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

test("vendor search keeps the outer focus ring without an inner native outline", () => {
  const css = fs.readFileSync(path.resolve(__dirname, "../src/customer/customer-theme.css"), "utf8");
  assert.match(css, /\.customer-search-input:focus-within \{[\s\S]*outline: 3px solid var\(--customer-ring\)/);
  assert.match(css, /\.customer-search-input \[data-slot="input"\]:focus \{[\s\S]*outline: none !important;[\s\S]*box-shadow: none !important;/);
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
  assert.match(css, /html\[data-customer-theme\] \.customer-vendor-content \{[\s\S]*isolation: isolate;[\s\S]*z-index: 2;[\s\S]*overflow: clip;[\s\S]*background: var\(--card\) !important;[\s\S]*background-image: none !important;/);
  assert.match(css, /\.customer-vendor-content \.customer-vendor-queue,[\s\S]*background: var\(--card\);[\s\S]*opacity: 1;/);
  assert.match(css, /customer-vendor-service > \[data-slot="card-footer"\],[\s\S]*background-color: var\(--card\) !important;/);
});

test("vendor detail keeps unauthenticated actions minimal and readable", () => {
  const page = fs.readFileSync(path.resolve(__dirname, "../src/customer/pages/CustomerVendorDetailsPage.tsx"), "utf8");
  const css = fs.readFileSync(path.resolve(__dirname, "../src/customer/customer-theme.css"), "utf8");
  assert.doesNotMatch(page, /Sign in to save/);
  assert.match(page, /\{token \? \([\s\S]*?IconHeart[\s\S]*?\) : null\}/);
  assert.match(css, /customer-vendor-hero-tools[\s\S]*?background: var\(--card\) !important;[\s\S]*?border: 1px solid var\(--line\);[\s\S]*?border-radius: 999px;[\s\S]*?overflow: hidden;/);
  assert.match(css, /html\[data-customer-theme\] \.customer-vendor-hero-tools \{[\s\S]*?height: 44px;[\s\S]*?min-height: 44px;/);
  assert.match(css, /customer-vendor-hero-tools > \.customer-button,[\s\S]*?background: transparent !important;[\s\S]*?border: 0;[\s\S]*?border-radius: 0;/);
  assert.match(css, /customer-vendor-hero-tools > a \{[\s\S]*?border-inline-start: 1px solid var\(--line\);/);
  assert.match(page, /rating\.average\.toFixed\(1\)[\s\S]*?customer-vendor-rating-count[\s\S]*?rating\.count/);
  assert.match(css, /customer-vendor-rating-count \{[\s\S]*?font-size: 0\.75em;/);
  assert.match(css, /customer-vendor-hero-tools > \.customer-button\[aria-pressed="true"\][\s\S]*?color: var\(--customer-error\);/);
  assert.match(css, /customer-vendor-location\[aria-pressed="true"\] \.customer-location-icon[\s\S]*?background: transparent;[\s\S]*?color: var\(--customer-primary\);/);
  assert.match(css, /\.customer-vendor-location\[aria-pressed="true"\] \{[\s\S]*?background: color-mix\(in srgb, var\(--customer-primary\) 10%, var\(--card\)\);[\s\S]*?border-bottom-color: var\(--customer-primary\);/);
  assert.match(css, /html\[data-customer-theme\] \.customer-vendor-location\[aria-pressed="true"\] \.customer-location-icon[\s\S]*?background: transparent;[\s\S]*?color: var\(--customer-primary\);/);
  assert.match(css, /customer-vendor-heading h1[\s\S]*?font-family: var\(--customer-font-display\);[\s\S]*?font-weight: 700;[\s\S]*?overflow-wrap: anywhere;/);
});

test("Customer entry scopes the initial theme and keeps color-scheme synchronized", () => {
  const main = fs.readFileSync(path.resolve(__dirname, "../src/customer/main.tsx"), "utf8");
  const theme = fs.readFileSync(path.resolve(__dirname, "../src/customer/CustomerTheme.tsx"), "utf8");
  const customerCss = fs.readFileSync(path.resolve(__dirname, "../src/customer/customer-theme.css"), "utf8");
  const vite = fs.readFileSync(path.resolve(__dirname, "../vite.config.ts"), "utf8");
  assert.match(main, /localStorage\.getItem\("getprio\.customer\.theme"\)/);
  assert.match(main, /document\.documentElement\.setAttribute\("data-customer-theme", initialCustomerTheme\)/);
  assert.match(main, /document\.documentElement\.style\.colorScheme = initialCustomerTheme/);
  assert.match(theme, /root\.setAttribute\("data-customer-theme", theme\);[\s\S]*root\.style\.colorScheme = theme;/);
  assert.doesNotMatch(theme, /root\.removeAttribute\("data-customer-theme"\)/);
  assert.match(fs.readFileSync(path.resolve(__dirname, "../src/customer/CustomerShell.tsx"), "utf8"), /onPointerDown=\{toggleTheme\}/);
  assert.match(vite, /src=\\?"\/src\/main\.tsx\\?"[\s\S]*src=\\?"\/src\/customer\/main\.tsx\\?"/);
  assert.match(customerCss, /html\[data-customer-theme\][\s\S]*--bg: #fbf7f1;[\s\S]*--card: #fffaf4;[\s\S]*--line: #eadfd4;/);
  assert.match(customerCss, /html\[data-customer-theme="dark"\][\s\S]*--bg: #0e1720;[\s\S]*--card: #16212b;[\s\S]*--line: #354654;[\s\S]*--text: #f5f8fa;[\s\S]*--muted: #cdd8de;/);
});
