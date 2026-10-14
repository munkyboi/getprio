import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import verify from "./plan-matrix-save.browser.mjs";
import verifyCapacity from "./tenant-capacity.browser.mjs";
const cli = process.env.PLAYWRIGHT_CLI || "npx";
const prefix = process.env.PLAYWRIGHT_CLI ? [] : ["--yes", "--package", "@playwright/cli", "playwright-cli"];
const cwd = fileURLToPath(new URL("../../output/playwright/", import.meta.url));
mkdirSync(cwd, { recursive: true });
const url = process.env.PLATFORM_PLAN_TEST_URL || "http://127.0.0.1:5193";
if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("Local test URL required");
const run = (...args) => {
  const result = spawnSync(cli, [...prefix, "-s=plan-matrix-save", ...args], { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Browser command failed: ${args[0]}`);
};
try {
  run("open", `${url}/tests/plan-matrix-harness.html`);
  run("snapshot");
  run("run-code", `(${verify.toString()})`);
  run("run-code", `(${verifyCapacity.toString()})`);
} finally { run("close"); }
