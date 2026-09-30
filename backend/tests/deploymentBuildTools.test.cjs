const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const verifier = path.join(root, "scripts/verify-build-tools.sh");

test("deployment build-tool verification fails on missing binaries and passes only when both installs are usable", (t) => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "getprio-build-tools-"));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const verify = () => spawnSync("bash", [verifier, fixture], { encoding: "utf8" });
  const missing = verify();
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /build tool missing or not executable/);
  for (const directory of [fixture, path.join(fixture, "platform-dashboard-shadcn")]) {
    const bin = path.join(directory, "node_modules/.bin");
    fs.mkdirSync(bin, { recursive: true });
    for (const tool of ["vite", "tsc"]) {
      fs.writeFileSync(path.join(bin, tool), "#!/usr/bin/env bash\necho fixture-tool-version\n", { mode: 0o755 });
    }
  }
  assert.equal(verify().status, 0);
  const broken = path.join(fixture, "platform-dashboard-shadcn/node_modules/.bin/vite");
  fs.writeFileSync(broken, "#!/usr/bin/env bash\nexit 2\n", { mode: 0o755 });
  assert.equal(verify().status, 2, "an installed but unusable executable must also stop deployment");
});

test("production deployment forces executable links and verifies tools before database changes", () => {
  const workflow = fs.readFileSync(path.join(root, ".github/workflows/deploy-digitalocean.yml"), "utf8");
  assert.match(workflow, /npm ci --include=dev --bin-links=true/);
  assert.match(workflow, /npm ci --prefix platform-dashboard-shadcn --include=dev --bin-links=true/);
  const verification = workflow.indexOf("bash scripts/verify-build-tools.sh");
  assert.ok(verification > workflow.indexOf("npm ci --prefix platform-dashboard-shadcn"));
  assert.ok(verification < workflow.indexOf("npm run db:migrate"));
});
