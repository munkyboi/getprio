const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const entry = fs.readFileSync(path.join(root, "src/surfaces/MarketingApp.tsx"), "utf8");
const authStyles = fs.readFileSync(path.join(root, "src/pages/universal-auth.css"), "utf8");

assert.match(entry, /import "\.\.\/styles\.css"/u);
assert.match(entry, /import "\.\.\/vendor\/styles\.css"/u);
assert.match(entry, /import "\.\.\/pages\/universal-auth\.css"/u);
assert.match(authStyles, /\.universal-auth-card/u);
assert.match(authStyles, /\[data-slot=input\]/u);
assert.match(authStyles, /\[data-slot=tabs-trigger\]/u);

console.log("universal auth style entry passed");
