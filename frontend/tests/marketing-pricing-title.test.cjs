const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const styles = fs.readFileSync(path.resolve(__dirname, "../src/pages/LandingPageMotion.css"), "utf8");
const landing = fs.readFileSync(path.resolve(__dirname, "../src/pages/LandingPage.tsx"), "utf8");

assert.match(landing, /className="prio-section-title" order=\{2\}[\s\S]*?A calmer day\. At every scale\./u);
assert.match(styles, /\.lp-page \.lp-pricing \.prio-section-title \{[^}]*font-size: clamp\(40px, 5vw, 64px\);/u);
assert.match(styles, /\.lp-page \.lp-pricing \.prio-section-title \{[^}]*font-weight: 400;/u);

console.log("marketing pricing title scale contract passed");
