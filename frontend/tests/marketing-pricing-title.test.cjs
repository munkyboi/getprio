const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const styles = fs.readFileSync(path.resolve(__dirname, "../src/pages/LandingPageMotion.css"), "utf8");
const landing = fs.readFileSync(path.resolve(__dirname, "../src/pages/LandingPage.tsx"), "utf8");

test("marketing pricing title keeps the intended heading scale", () => {
assert.match(landing, /className="prio-section-title" order=\{2\}[\s\S]*?A calmer day\. At every scale\./u);
assert.match(styles, /\.lp-page \.lp-pricing \.prio-centered-copy > \.prio-section-title \{[^}]*font-size: clamp\(40px, 5vw, 64px\);/u);
assert.match(styles, /\.lp-page \.lp-pricing \.prio-centered-copy > \.prio-section-title \{[^}]*line-height: 1\.03;/u);
});
