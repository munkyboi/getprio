const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const yaml = require("js-yaml");

const workflow = yaml.load(fs.readFileSync(path.resolve(__dirname, "../.github/workflows/deploy-digitalocean.yml"), "utf8"));
const expression = workflow.jobs.deploy.if.trim().replace(/^\$\{\{\s*/u, "").replace(/\s*\}\}$/u, "");
function allowed({ event = "workflow_run", conclusion = "success", sourceEvent = "push", branch = "main",
  repository = "munkyboi/getprio", fork = false } = {}) {
  const github = { event_name: event, repository: "munkyboi/getprio", event: { workflow_run: {
    conclusion, event: sourceEvent, head_branch: branch, head_repository: { full_name: repository, fork }
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
