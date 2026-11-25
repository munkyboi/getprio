const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const viteConfig = fs.readFileSync(path.join(root, "vite.config.ts"), "utf8");
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");

assert.match(viteConfig, /\["marketing",\s*"customer",\s*"vendor"\]\.includes\(surface\)\s*&&\s*tailwindcss\(\)/u);
assert.match(viteConfig, /transformIndexHtml:\s*\{[\s\S]*?handler\(html\)/u);
assert.match(viteConfig, /html\.replace\([\s\S]*?src="\/src\/main\.tsx"[\s\S]*?src="\/src\/customer\/main\.tsx"[\s\S]*?\)/u);
assert.match(indexHtml, /src\/main\.tsx/u);
