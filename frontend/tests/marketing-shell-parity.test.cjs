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
assert.match(shell, /publicTheme\.theme === "dark" \? <IconSun/u);
assert.match(shell, /: <IconMoon/u);
assert.match(styles, /\.finazze-topbar \{[\s\S]*?min-height: 42px;/u);
assert.match(styles, /\.desktop-nav-links \.mantine-Button-root \{[^}]*font-weight: 700;/u);
assert.match(styles, /\.public-theme-toggle\.mantine-Button-root \{[^}]*border: 0;[^}]*background: transparent;/u);
assert.match(styles, /@media \(max-width: 768px\) \{[\s\S]*?\.desktop-nav-links \{\s*display: none !important;/u);

console.log("marketing shell parity contract passed");
