const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const script = path.resolve(__dirname, "prepare-deployment-worktree.sh");
const run = (cwd) => execFileSync(script, [cwd], { encoding: "utf8" });
const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" });

const allowed = fs.mkdtempSync(path.join(os.tmpdir(), "getprio-deploy-drift-"));
git(allowed, "init", "-q");
fs.mkdirSync(path.join(allowed, ".git"), { recursive: true });
fs.mkdirSync(path.join(allowed, "frontend", "dist-customer"), { recursive: true });
fs.mkdirSync(path.join(allowed, "frontend", "dist-vendor"), { recursive: true });
fs.writeFileSync(path.join(allowed, "frontend", "dist-customer", "index.html"), "customer");
fs.writeFileSync(path.join(allowed, "frontend", "dist-vendor", "index.html"), "vendor");
const output = run(allowed);
assert.match(output, /Preserved generated static output drift/u);
assert.equal(fs.existsSync(path.join(allowed, "frontend", "dist-customer")), false);
assert.equal(fs.existsSync(path.join(allowed, "frontend", "dist-vendor")), false);
assert.equal(git(allowed, "status", "--porcelain=v1").trim(), "");
assert.equal(fs.readdirSync(path.dirname(allowed)).some((name) => name.startsWith(path.basename(allowed) + ".generated-output-backup.")), true);

const blocked = fs.mkdtempSync(path.join(os.tmpdir(), "getprio-deploy-drift-blocked-"));
git(blocked, "init", "-q");
fs.writeFileSync(path.join(blocked, "unexpected.txt"), "do not touch");
assert.throws(() => run(blocked));
assert.equal(fs.existsSync(path.join(blocked, "unexpected.txt")), true);
console.log("deployment generated-drift policy passed");
