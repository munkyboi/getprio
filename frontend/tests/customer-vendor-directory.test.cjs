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

test("vendor search leaves focus treatment to the shadcn InputGroup primitive", () => {
  const css = fs.readFileSync(path.resolve(__dirname, "../src/customer/customer-theme.css"), "utf8");
  const inputGroup = fs.readFileSync(path.resolve(__dirname, "../src/customer/components/shadcn/input-group.tsx"), "utf8");
  assert.doesNotMatch(css, /\.customer-search-input:focus-within/);
  assert.doesNotMatch(css, /\.customer-search-input \[data-slot="input"\]:focus/);
  assert.match(inputGroup, /has-\[\[data-slot=input-group-control\]:focus-visible\]:ring-3/);
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

test("vendor image fallbacks use committed assets in both Customer themes", () => {
  const sourceFiles = [
    path.resolve(__dirname, "../src/customer/pages/CustomerExplorePage.tsx"),
    path.resolve(__dirname, "../src/customer/pages/CustomerVendorDetailsPage.tsx"),
    path.resolve(__dirname, "../src/customer/components/details/BusinessMedia.tsx"),
  ];
  for (const file of sourceFiles) {
    const source = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(source, /illustrations\/customer\/vendor-default-dark\.png/);
    assert.match(source, /illustrations\/generated\/hero-queue-scene-transparent\.png/);
  }
  assert.ok(fs.existsSync(path.resolve(__dirname, "../public/illustrations/generated/hero-queue-scene-transparent.png")));
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

test("mobile vendor actions use a full-bleed bar above bottom navigation", () => {
  const css = fs.readFileSync(path.resolve(__dirname, "../src/customer/customer-theme.css"), "utf8");
  assert.match(css, /\.customer-vendor-actions \{[\s\S]*?bottom: calc\(70px \+ env\(safe-area-inset-bottom\)\);[\s\S]*?width: 100vw;[\s\S]*?margin-inline: calc\(50% - 50vw\);/);
});

test("vendor detail keeps Book available before service selection", () => {
  const page = fs.readFileSync(path.resolve(__dirname, "../src/customer/pages/CustomerVendorDetailsPage.tsx"), "utf8");
  assert.match(page, /vendor\.capabilities\.booking && selected \? \(/);
  assert.doesNotMatch(page, /vendor\.capabilities\.booking && selected && selectedServiceSlugs\.length/);
});

test("resource and workflow queues route to booking instead of simple Join Queue", () => {
  const page = fs.readFileSync(path.resolve(__dirname, "../src/customer/pages/CustomerVendorDetailsPage.tsx"), "utf8");
  assert.match(page, /const queueType = currentQueue\?\.location\?\.queueType \|\| "simple"/);
  assert.match(page, /simpleQueueAvailable &&\s*isQueueAcceptingJoins\(currentQueue\)/);
  assert.match(page, /queueType !== "simple" && vendor\.capabilities\.booking && selected/);
  assert.match(page, /data-booking-flow-trigger/);
});

test("Customer entry scopes the initial theme and keeps color-scheme synchronized", () => {
  const main = fs.readFileSync(path.resolve(__dirname, "../src/customer/main.tsx"), "utf8");
  const theme = fs.readFileSync(path.resolve(__dirname, "../src/customer/CustomerTheme.tsx"), "utf8");
  const customerCss = fs.readFileSync(path.resolve(__dirname, "../src/customer/customer-theme.css"), "utf8");
  const vite = fs.readFileSync(path.resolve(__dirname, "../vite.config.ts"), "utf8");
  assert.match(main, /localStorage\.getItem\("getprio\.customer\.theme"\)/);
  assert.match(main, /document\.documentElement\.dataset\.customerTheme = initialCustomerTheme/);
  assert.match(main, /document\.documentElement\.style\.colorScheme = initialCustomerTheme/);
  assert.match(theme, /root\.setAttribute\("data-customer-theme", theme\);[\s\S]*root\.style\.colorScheme = theme;/);
  assert.doesNotMatch(theme, /root\.removeAttribute\("data-customer-theme"\)/);
  assert.match(fs.readFileSync(path.resolve(__dirname, "../src/customer/CustomerShell.tsx"), "utf8"), /onPointerDown=\{toggleTheme\}/);
  assert.match(vite, /src=\\?"\/src\/main\.tsx\\?"[\s\S]*src=\\?"\/src\/customer\/main\.tsx\\?"/);
  assert.match(customerCss, /html\[data-customer-theme\][\s\S]*--bg: #fbf7f1;[\s\S]*--card: #fffaf4;[\s\S]*--line: #eadfd4;/);
  assert.match(customerCss, /html\[data-customer-theme="dark"\][\s\S]*--bg: #0e1720;[\s\S]*--card: #16212b;[\s\S]*--line: #354654;[\s\S]*--text: #f5f8fa;[\s\S]*--muted: #cdd8de;/);
});

test("Customer form fields replace native focus outlines with the accessible theme ring", () => {
  const css = fs.readFileSync(path.resolve(__dirname, "../src/customer/customer-theme.css"), "utf8");
  const inputGroup = fs.readFileSync(path.resolve(__dirname, "../src/customer/components/shadcn/input-group.tsx"), "utf8");
  assert.doesNotMatch(css, /customer-mobile-web :where\(input, select, textarea\):focus/);
  assert.doesNotMatch(css, /customer-password-input(?:[^\n]*)?:focus-within/);
  assert.doesNotMatch(css, /customer-search-input \[data-slot="input"\]:focus/);
  assert.match(inputGroup, /focus-visible:ring-0/);
  assert.match(inputGroup, /has-\[\[data-slot=input-group-control\]:focus-visible\]:ring-3/);
});

test("Customer form focus treatment remains owned by shadcn primitives", () => {
  const css = fs.readFileSync(path.resolve(__dirname, "../src/customer/customer-theme.css"), "utf8");
  assert.doesNotMatch(css, /--ring:/);
  assert.doesNotMatch(css, /html\[data-customer-theme\] :focus-visible/);
  assert.doesNotMatch(css, /\.customer-mobile-web \{[\s\S]*?--ring:/);
});

test("Customer login keeps password controls seamless and swaps to an inline reset form", () => {
  const page = fs.readFileSync(path.resolve(__dirname, "../src/customer/components/CustomerFallbackPresentations.tsx"), "utf8");
  const css = fs.readFileSync(path.resolve(__dirname, "../src/customer/customer-theme.css"), "utf8");
  assert.match(page, /m\.showResetRequest \? <form[\s\S]*?handlePasswordResetRequest[\s\S]*?Back to sign in/);
  assert.match(page, /className="customer-auth-reset-link"[\s\S]*?Forgot password\?/);
  assert.match(page, /<a href="#customer-reset" className="customer-auth-reset-link"[\s\S]*?Forgot password\?/);
  assert.match(page, /<a className="customer-auth-reset-link" href=.*Create a customer account/);
  assert.match(css, /customer-fallback-card \[data-slot="card-title"\] \{[\s\S]*?font-size: clamp\(2rem, 5vw, 2\.75rem\);/);
  assert.match(page, /!m\.showResetRequest && !m\.mfaChallengeToken \? <CustomerSocial/);
  assert.doesNotMatch(css, /customer-password-input > \[data-slot="input-group-control"\],[\s\S]*?border: 0 !important;/);
  assert.doesNotMatch(css, /customer-password-input \[data-slot="input-group-control"\]:focus-visible/);
  assert.match(css, /customer-auth-reset-link \{[\s\S]*?color: var\(--customer-primary\) !important;[\s\S]*?text-decoration: underline;/);
});
