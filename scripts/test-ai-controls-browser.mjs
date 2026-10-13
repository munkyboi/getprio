import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import verify from "../platform-dashboard-shadcn/tests/ai-controls-usability.browser.mjs";
const cwd = fileURLToPath(new URL("../output/playwright/", import.meta.url));
mkdirSync(cwd, { recursive: true });
const run = (...args) => {
  const result = spawnSync(
    "npx",
    [
      "--yes",
      "--package",
      "@playwright/cli",
      "playwright-cli",
      "-s=ai-controls",
      ...args,
    ],
    { cwd, stdio: "inherit" },
  );
  if (result.status !== 0)
    throw new Error(`Browser command failed: ${args[0]}`);
};
try {
  run("open", "http://127.0.0.1:5194/tests/fixtures/ai-inference.html");
  run("snapshot");
  run("run-code", `(${verify.toString()})`);
  console.log("AI-controls usability browser regressions passed.");
} finally {
  run("close");
}
