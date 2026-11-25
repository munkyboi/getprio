const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../src");
const landing = fs.readFileSync(path.join(root, "pages/LandingPage.tsx"), "utf8");
const workflow = fs.readFileSync(path.join(root, "pages/WorkflowSpotlight.tsx"), "utf8");
const styles = fs.readFileSync(path.join(root, "pages/LandingPageMotion.css"), "utf8");

test("marketing presentation contract stays aligned", () => {
for (const label of ["LESS WAITING. MORE LIVING.", "01 / A BETTER KIND OF WAIT", "02 / CONNECTED BY DESIGN", "04 / ROOM TO GROW", "A BETTER DAY STARTS HERE"]) {
  assert.doesNotMatch(landing, new RegExp(label.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&"), "u"));
}
assert.doesNotMatch(workflow, /03 \/ THE GETPRIO WAY/u);
assert.match(landing, /className="lp-feature-heading"/u);
assert.match(styles, /\.lp-feature-heading \{ display: flex; align-items: center;/u);
assert.match(styles, /\.lp-section-head \{ grid-template-columns: 1fr 1fr;/u);
assert.doesNotMatch(landing, /lp-feature-number/u);
assert.match(styles, /\.lp-page \.prio-pricing-card \.mantine-Button-root \{ width: 100%; \}/u);
});
