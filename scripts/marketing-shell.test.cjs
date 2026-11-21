const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const marketingApp = fs.readFileSync(path.join(root, "frontend/src/surfaces/MarketingApp.tsx"), "utf8");
const publicShell = fs.readFileSync(path.join(root, "frontend/src/surfaces/PublicShell.tsx"), "utf8");
const styles = fs.readFileSync(path.join(root, "frontend/src/styles.css"), "utf8");

assert.match(marketingApp, /<PublicThemeProvider><PublicShell marketing>/u);
assert.match(marketingApp, /import "\.\.\/styles\.css"/u, "Marketing entry must include its standalone shell styles");
for (const route of ["/", "/login", "/register", "/register/customer", "/register/vendor", "/privacy-policy", "/terms", "/help", "/contact"]) {
  assert.ok(marketingApp.includes(`"${route}"`), `missing Marketing route ${route}`);
}
assert.ok(marketingApp.includes('path="*"'), "missing Marketing 404 route");

const marketingShell = publicShell.slice(publicShell.indexOf("function MarketingPublicShell"), publicShell.indexOf("function AuthenticatedPublicShell"));
assert.match(marketingShell, /marketing-app public-marketing-shell/u);
assert.match(marketingShell, /marketing-topbar/u);
assert.match(marketingShell, /marketing-menu-trigger/u);
assert.match(marketingShell, /usePublicTheme/u);
assert.doesNotMatch(marketingShell, /useAuth/u, "Marketing shell must not read authenticated shell state");
assert.doesNotMatch(marketingShell, /apiRequest|sessionRequest|logout/u, "Marketing shell must not own authenticated API behavior");
assert.match(styles, /\.public-marketing-shell/u);
assert.match(styles, /\.marketing-topbar/u);

console.log("marketing shell wiring passed");
