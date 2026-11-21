const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.resolve(__dirname, "../src/marketing/LandingPage.tsx"), "utf8");
const actions = source.match(/<div className="lp-closing-actions"[\s\S]*?<\/div>/u)?.[0] || "";

assert.match(actions, /className="lp-closing-actions"[^>]*data-closing-reveal/u);
assert.match(actions, /Create your workspace/u);
assert.match(actions, /Explore vendors/u);
assert.match(actions, /data-closing-reveal/u);
assert.match(actions, /href=\{appUrl\("vendor", "\/register"\)\}/u);
assert.match(actions, /href=\{appUrl\("customer", "\/vendors"\)\}/u);
assert.match(actions, /className="lp-text-link"/u);
assert.doesNotMatch(actions, /<Button data-closing-reveal/u);
assert.doesNotMatch(actions, /<a data-closing-reveal/u);

console.log("marketing hero action alignment contract passed");
