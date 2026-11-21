const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.resolve(__dirname, "../src/pages/LandingPage.tsx"), "utf8");
const actions = source.match(/<div className="lp-closing-actions"[\s\S]*?<\/div>/u)?.[0] || "";

assert.match(actions, /className="lp-closing-actions"[^>]*data-closing-reveal/u);
assert.match(actions, /<Button component="a"/u);
assert.match(actions, /className="lp-text-link"/u);
assert.doesNotMatch(actions, /<Button data-closing-reveal/u);
assert.doesNotMatch(actions, /<a data-closing-reveal/u);

console.log("marketing hero action alignment contract passed");
