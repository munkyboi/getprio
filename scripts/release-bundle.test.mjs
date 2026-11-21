import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { containsProductionApiReference } from "./release-bundle.mjs";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const sha = "ff497ca2b2e0368a5770cd6097996fce11804da1";

test("production API validation accepts only the configured host and path", () => {
  assert.equal(containsProductionApiReference("https://api.getprio.online/api/auth"), true);
  assert.equal(containsProductionApiReference("https://evil.example/https://api.getprio.online/api"), false);
  assert.equal(containsProductionApiReference("https://api.getprio.online.evil/api"), false);
});

function run(stage, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/release-bundle.mjs", "materialize", stage, sha], { cwd: root, env: { ...process.env, ...env } });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve(output) : reject(new Error(output)));
  });
}

test("materialization preserves developer output and binds production runtime config", async () => {
  const stage = await fs.mkdtemp(path.join(os.tmpdir(), "getprio-release-bundle-test-"));
  const developer = path.join(stage, "developer");
  await fs.mkdir(developer);
  await fs.writeFile(path.join(developer, "sentinel.txt"), "preserve");
  await run(stage, { TURNSTILE_SECRET_KEY: "configured", TURNSTILE_SITE_KEY: "site-key" });
  assert.equal(await fs.readFile(path.join(developer, "sentinel.txt"), "utf8"), "preserve");
  for (const site of ["frontend", "customer", "vendor", "platform"]) {
    const files = await fs.readdir(path.join(stage, site), { recursive: true });
    const contents = (await Promise.all(files.map(async (file) => {
      const full = path.join(stage, site, file);
      return (await fs.stat(full)).isFile() ? fs.readFile(full, "utf8").catch(() => "") : "";
    }))).join("\n");
    assert.doesNotMatch(contents, /https?:\/\/(?:127\.0\.0\.1|localhost):(?:5091|5190|5191|5192|5193|5194)/u);
    assert.match(contents, /https:\/\/api\.getprio\.online\/api/u);
    assert.doesNotMatch(contents, /__GETPRIO_TURNSTILE_SITE_KEY__/u);
  }
  const script = await fs.readFile(path.join(root, "scripts/release-bundle.mjs"), "utf8");
  assert.match(script, /endsWith\("\.html"\)/u);
  assert.match(script, /VITE_REBUILD_MARKETING/u);
  assert.match(script, /max-old-space-size=4096/u);
  assert.match(script, /missing a usable head for deployment revision metadata/u);
});
