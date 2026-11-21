const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../src");
const landing = fs.readFileSync(path.join(root, "marketing/LandingPage.tsx"), "utf8");
const pricingHighlights = fs.readFileSync(path.join(root, "marketing/PricingHighlights.tsx"), "utf8");
const workflow = fs.readFileSync(path.join(root, "pages/WorkflowSpotlight.tsx"), "utf8");
const styles = fs.readFileSync(path.join(root, "marketing/LandingMotion.css"), "utf8");
const marketingStyles = fs.readFileSync(path.join(root, "marketing/styles.css"), "utf8");

for (const label of ["LESS WAITING. MORE LIVING.", "01 / A BETTER KIND OF WAIT", "02 / CONNECTED BY DESIGN", "A BETTER DAY STARTS HERE"]) {
  assert.doesNotMatch(landing, new RegExp(label.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&"), "u"));
}
assert.doesNotMatch(workflow, /03 \/ THE GETPRIO WAY/u);
assert.doesNotMatch(landing, /YOUR PLACE IS KEPT|YOUR DAY IS YOURS/u);
assert.match(landing, /className="lp-feature-heading"/u);
assert.match(styles, /\.lp-feature-heading \{ display: flex; align-items: center;/u);
assert.match(styles, /\.lp-page \.prio-pricing-card \.mantine-Button-root \{ width: 100%; \}/u);
assert.match(styles, /\.lp-section-head \{ grid-template-columns: minmax\(0, 1\.25fr\) minmax\(240px, \.75fr\); align-items: center;/u);
assert.match(styles, /\.lp-page \.lp-pricing \.prio-centered-copy > h2 \{ display: block; max-width: 760px; margin: 0 auto 48px; text-align: center;.*font-size: clamp\(40px, 5vw, 64px\)/u);
assert.match(pricingHighlights, /className="marketing-pricing-toggle"/u);
assert.match(landing, /<h3 className="marketing-pricing-plan-name">\{plan\.name\}<\/h3>/u);
assert.match(styles, /\.lp-page \.marketing-pricing-plan-name \{[^}]*font-family: var\(--lp-heading-font\);/u);
assert.match(styles, /\.marketing-pricing-toggle \{ display: flex; align-items: center; justify-content: center; gap: 12px; width: 100%; min-height: 44px; margin-top: 8px;.*color: #786c5d/u);
assert.match(styles, /\.marketing-pricing-toggle::before, \.marketing-pricing-toggle::after \{ content: ""; flex: 1 1 auto; height: 1px; min-width: 24px;/u);
assert.match(marketingStyles, /\.marketing-pricing-features > div:not\(\[hidden\]\) \{ display: grid; gap: 14px; \}/u);
assert.match(styles, /\.lp-page \.marketing-pricing-grid \[data-slot=card-footer\] \{ width: 100%; border-top: 0; background: transparent; \}/u);

console.log("marketing presentation contract passed");
