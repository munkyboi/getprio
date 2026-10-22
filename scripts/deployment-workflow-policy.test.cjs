const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const yaml = require("js-yaml");

const workflow = yaml.load(fs.readFileSync(path.resolve(__dirname, "../.github/workflows/deploy-digitalocean.yml"), "utf8"));
const expression = workflow.jobs.deploy.if.trim().replace(/^\$\{\{\s*/u, "").replace(/\s*\}\}$/u, "");
function allowed({ event = "workflow_run", conclusion = "success", sourceEvent = "push", branch = "main",
  repository = "munkyboi/getprio", fork = false, sha = "a".repeat(40), headSha = sha } = {}) {
  const github = { event_name: event, repository: "munkyboi/getprio", sha, event: { workflow_run: {
    conclusion, event: sourceEvent, head_branch: branch, head_sha: headSha, head_repository: { full_name: repository, fork }
  } } };
  return vm.runInNewContext(expression, { github }, { timeout: 1000 });
}
test("production auto-deployment accepts successful main pushes from this repository", () => {
  assert.equal(allowed(), true);
});
test("fork and PR events cannot gain production privileges by naming a branch main", () => {
  assert.equal(allowed({ fork: true }), false);
  assert.equal(allowed({ repository: "fork-owner/getprio", fork: true }), false);
  assert.equal(allowed({ repository: "another/getprio" }), false);
  assert.equal(allowed({ sourceEvent: "pull_request" }), false);
  assert.equal(allowed({ event: "pull_request" }), false);
});
test("unsuccessful, non-main or incomplete workflow-run metadata fails closed", () => {
  for (const conclusion of ["failure", "cancelled", "skipped", ""]) assert.equal(allowed({ conclusion }), false);
  assert.equal(allowed({ branch: "feature" }), false);
  assert.equal(allowed({ repository: "", fork: undefined }), false);
  assert.equal(allowed({ sourceEvent: "" }), false);
});
test("explicit manual dispatch remains available", () => {
  assert.equal(allowed({ event: "workflow_dispatch", sourceEvent: "", repository: "" }), true);
});

test("delayed or missing CI revisions cannot deploy against a newer workflow revision", () => {
  assert.equal(allowed({ headSha: "b".repeat(40) }), false);
  assert.equal(allowed({ headSha: "" }), false);
  assert.equal(allowed({ event: "workflow_dispatch", headSha: "b".repeat(40) }), true);
});

test("unsupported targets fail before changing the server checkout", (t) => {
  const os = require("node:os");
  const { execFileSync, spawnSync } = require("node:child_process");
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "getprio-deploy-target-test-"));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
  git("init", "--quiet");
  git("config", "user.name", "Deployment fixture");
  git("config", "user.email", "deploy@example.invalid");
  git("-c", "commit.gpgsign=false", "commit", "--quiet", "--allow-empty", "-m", "Older target");
  const older = git("rev-parse", "HEAD");
  fs.mkdirSync(path.join(repo, "scripts"));
  fs.writeFileSync(path.join(repo, "scripts/static-release.mjs"), "// fixture publication helper\n");
  git("add", "scripts/static-release.mjs");
  git("-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "Supported target");
  const current = git("rev-parse", "HEAD");
  const command = workflow.jobs.deploy.steps.find((step) => step.id === "deploy-production").run;
  const start = command.indexOf("# Require the publication helper");
  const checkout = 'git checkout --detach "${DEPLOY_SHA}"';
  const end = command.indexOf(checkout, start) + checkout.length;
  assert.ok(start >= 0 && end > start, "target guard must precede checkout");
  const script = "set -euo pipefail\n" + command.slice(start, end);
  function attempt(target) {
    return spawnSync("bash", [], { cwd: repo, input: script, encoding: "utf8", env: { ...process.env, DEPLOY_SHA: target } });
  }
  const denied = attempt(older);
  assert.equal(denied.status, 1);
  assert.match(denied.stdout, /Refusing to change the server checkout/u);
  assert.equal(git("rev-parse", "HEAD"), current);
  assert.equal(attempt(current).status, 0);
});
