const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const viteConfig = fs.readFileSync(path.join(root, "vite.config.ts"), "utf8");
const customerHtml = fs.readFileSync(path.join(root, "index.customer.html"), "utf8");

assert.match(viteConfig, /\["marketing",\s*"customer"\]\.includes\(surface\)\s*&&\s*tailwindcss\(\)/u);
assert.match(viteConfig, /surface === "customer" \? "index\.customer\.html"/u);
assert.match(customerHtml, /src\/customer\/main\.tsx/u);
