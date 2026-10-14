import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import verify from "../platform-dashboard-shadcn/tests/ai-controls-usability.browser.mjs"
const cwd = fileURLToPath(new URL("../output/playwright/", import.meta.url))
mkdirSync(cwd, { recursive: true })
const nodeDirectory = dirname(process.execPath)
const npmCli = [
  resolve(nodeDirectory, "../lib/node_modules/npm/bin/npm-cli.js"),
  resolve(nodeDirectory, "node_modules/npm/bin/npm-cli.js")
].find(existsSync)
if (!npmCli)
  throw new Error(
    "Install npm alongside the current Node runtime before running browser checks."
  )
const run = (...args) => {
  const result = spawnSync(
    process.execPath,
    [
      npmCli,
      "exec",
      "--yes",
      "--package=@playwright/cli",
      "--",
      "playwright-cli",
      "-s=ai-controls",
      ...args
    ],
    {
      cwd,
      stdio: "inherit",
      env: {
        ...process.env,
        PATH: [nodeDirectory, "/usr/bin", "/bin"].join(
          process.platform === "win32" ? ";" : ":"
        )
      }
    }
  )
  if (result.status !== 0) throw new Error(`Browser command failed: ${args[0]}`)
}
try {
  run("open", "http://127.0.0.1:5194/tests/fixtures/ai-inference.html")
  run("snapshot")
  run("run-code", `(${verify.toString()})`)
  console.log("AI-controls usability browser regressions passed.")
} finally {
  run("close")
}
