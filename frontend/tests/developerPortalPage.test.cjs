const test = require("node:test");
const assert = require("node:assert/strict");
process.env.TSX_TSCONFIG_PATH = require("node:path").resolve(
  __dirname,
  "../tsconfig.json",
);
require("tsx/cjs");
require.extensions[".css"] = () => {};
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const DeveloperPortalPage =
  require("../src/pages/DeveloperPortalPage.tsx").default;

function render(pathname) {
  global.window = { location: { pathname } };
  try {
    return renderToStaticMarkup(React.createElement(DeveloperPortalPage));
  } finally {
    delete global.window;
  }
}

test("pre-launch access destinations never collect credentials or simulate authentication", () => {
  for (const path of ["/login", "/register", "/login/", "/register/"]) {
    const html = render(path);
    assert.match(html, /No credentials are collected here/);
    assert.doesNotMatch(html, /<(form|input)\b/);
    assert.match(html, /href="\/docs"/);
    assert.match(html, /href="\/prototype"/);
  }
});

test("public navigation resolves to useful content and unknown addresses show a recovery link", () => {
  for (const [path, text] of [
    ["/docs", "Start on your backend."],
    ["/faq", "Frequently asked questions."],
    ["/help", "Find your next step."],
    ["/changelog", "September 26 · Developer API preview"],
    ["/changelog", "Current Developer API capabilities"],
    ["/changelog", "Security baseline"],
  ]) {
    const html = render(path);
    assert.ok(html.includes(text), path);
    assert.doesNotMatch(html, /Page not found/);
  }
  assert.match(render("/missing-page"), /Page not found/);
  assert.match(render("/missing-page"), /href="\/"/);
});

test("landing keeps illustrative pricing and mobile availability distinct from live access", () => {
  const html = render("/");
  assert.match(html, /ACCEPTED PRE-LAUNCH PRICING/);
  assert.match(html, /Purchases are not available on this site/);
  assert.match(
    html,
    /Customer linking and mobile distribution remain launch dependencies/,
  );
  assert.match(html, /monthly totals, not per-project rates/);
  assert.match(html, /href="\/register"/);
  assert.doesNotMatch(html, /href="#login"/);
});
