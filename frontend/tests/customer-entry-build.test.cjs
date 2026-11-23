const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const viteConfig = fs.readFileSync(path.join(root, "vite.config.ts"), "utf8");
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");

assert.match(viteConfig, /\["marketing",\s*"customer"\]\.includes\(surface\)\s*&&\s*tailwindcss\(\)/u);
assert.match(viteConfig, /transformIndexHtml\(html\)/u);
assert.match(viteConfig, /html\.replace\('\/src\/main\.tsx', '\/src\/customer\/main\.tsx'\)/u);
assert.match(indexHtml, /src\/main\.tsx/u);
