import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import verifySidebarNavigation from "./sidebar-navigation.browser.mjs";

const cli = process.env.PLAYWRIGHT_CLI || "npx";
const prefix = process.env.PLAYWRIGHT_CLI ? [] : ["--yes", "--package", "@playwright/cli", "playwright-cli"];
const session = "-s=platform-sidebar-smoke";
const artifactDirectory = fileURLToPath(new URL("../../output/playwright/", import.meta.url));
mkdirSync(artifactDirectory, { recursive: true });
const url = process.env.PLATFORM_SIDEBAR_TEST_URL || "http://127.0.0.1:5187";
if (!["127.0.0.1", "localhost"].includes(new URL(url).hostname)) throw new Error("Sidebar smoke requires a local fixture dashboard.");
const run = (...args) => {
  const result = spawnSync(cli, [...prefix, session, ...args], { stdio: "inherit", cwd: artifactDirectory });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Browser command failed: ${args[0]}`);
};
try {
  run("open", url);
  run("snapshot");
  run("run-code", `(${verifySidebarNavigation.toString()})`);
} finally {
  run("close");
}
