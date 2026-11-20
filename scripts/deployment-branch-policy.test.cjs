const assert = require("node:assert/strict");
const fs = require("node:fs");
const workflow = fs.readFileSync(".github/workflows/deploy-digitalocean.yml", "utf8");

assert.match(workflow, /DEPLOY_BRANCH:\s*\$\{\{\s*github\.event\.workflow_run\.head_branch\s*\|\|\s*github\.ref_name\s*\}\}/u);
assert.match(workflow, /DEPLOY_BRANCH.*release\/\[A-Za-z0-9\._-\]/u);
assert.match(workflow, /git fetch origin "\$\{DEPLOY_BRANCH\}"/u);
assert.match(workflow, /git merge-base --is-ancestor "\$\{DEPLOY_SHA\}" "origin\/\$\{DEPLOY_BRANCH\}"/u);
assert.match(workflow, /DEPLOY_BRANCH.*main/u);
console.log("deployment branch policy checks passed");
