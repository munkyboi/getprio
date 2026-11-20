const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const marketing = fs.readFileSync(path.resolve(__dirname, "../frontend/src/surfaces/MarketingApp.tsx"), "utf8");
const auth = fs.readFileSync(path.resolve(__dirname, "../frontend/src/pages/UniversalAuthPage.tsx"), "utf8");
const styling = fs.readFileSync(path.resolve(__dirname, "../frontend/src/pages/universal-auth.css"), "utf8");
assert.match(marketing, /universal-auth\.css/u);
assert.match(marketing, /PublicShell marketing/u);
assert.match(auth, /initialAuthSurface/u);
assert.match(styling, /universal-auth-board/u);
assert.match(styling, /universal-auth-tabs/u);
console.log("marketing universal auth styling wiring passed");
