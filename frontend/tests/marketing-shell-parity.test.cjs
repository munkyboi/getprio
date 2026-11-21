const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../src");
const shell = fs.readFileSync(path.join(root, "surfaces/PublicShell.tsx"), "utf8");
const marketing = fs.readFileSync(path.join(root, "surfaces/MarketingApp.tsx"), "utf8");
const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");

assert.match(marketing, /<PublicThemeProvider><PublicShell marketing>/u);
assert.match(shell, /className="public-theme-toggle"/u);
assert.match(shell, /aria-label=\{publicTheme\.theme === "dark"/u);
assert.match(styles, /\.finazze-topbar \.getprio-brand-logo \{ width: 58px; height: 45px; \}/u);
assert.match(styles, /\.desktop-nav-links \.mantine-Button-root \{[^}]*min-height: 42px;[^}]*font-size: 0\.9rem;/u);
assert.match(styles, /\.public-theme-toggle\.mantine-Button-root,[\s\S]*?border: 0;[\s\S]*?background: transparent;/u);

console.log("marketing shell parity contract passed");
