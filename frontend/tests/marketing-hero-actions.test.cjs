const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.resolve(__dirname, "../src/pages/LandingPage.tsx"), "utf8");
const actions = source.match(/<div className="lp-closing-actions"[\s\S]*?<\/div>/u)?.[0] || "";

assert.match(actions, /<Button data-closing-reveal component=\{Link\}/u);
assert.match(actions, /className="lp-text-link"/u);
assert.match(actions, /to="\/register\/vendor"/u);
assert.match(actions, /href="\/vendors"/u);

console.log("marketing hero action alignment contract passed");
