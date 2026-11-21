const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const styles = fs.readFileSync(path.resolve(__dirname, "../src/styles.css"), "utf8");
const footer = styles.slice(styles.indexOf(".site-footer-link,"), styles.indexOf(".dashboard-copyright"));

test("marketing footer uses the canonical accent states", () => {
assert.match(footer, /\.site-footer-link:visited[\s\S]*color:\s*#f68128/u);
assert.match(footer, /\.site-footer-link:hover[\s\S]*color:\s*#ffad5c/u);
assert.match(footer, /\.site-footer-link:focus-visible[\s\S]*outline:\s*2px solid #f68128/u);
assert.match(footer, /\.site-footer-social[\s\S]*color:\s*#f68128/u);
assert.match(footer, /\.site-footer-social:visited\s*\{\s*color:\s*#f68128/u);
assert.match(footer, /\.site-footer-social:hover\s*\{\s*color:\s*#ffad5c/u);
});
