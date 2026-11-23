const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const styles = fs.readFileSync(path.resolve(__dirname, "../src/styles.css"), "utf8");
const footer = styles.slice(styles.indexOf(".site-footer-link,"), styles.indexOf(".dashboard-copyright"));

assert.match(footer, /\.site-footer-link:visited[\s\S]*color:\s*rgba\(255,\s*255,\s*255,\s*0\.72\)/u);
assert.match(footer, /\.site-footer-link:hover[\s\S]*color:\s*#7d9bff/u);
assert.match(footer, /\.site-footer-link:focus-visible[\s\S]*outline:\s*2px solid #7d9bff/u);
assert.match(footer, /\.site-footer-social:hover[\s\S]*color:\s*#7d9bff/u);
assert.match(footer, /\.site-footer-social:visited\s*\{\s*color:\s*#7d9bff/u);
assert.match(footer, /\.site-footer-social:focus-visible[\s\S]*outline:\s*2px solid #7d9bff/u);

console.log("marketing footer accent contract passed");
