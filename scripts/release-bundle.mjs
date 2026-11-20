import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const API_ORIGIN = "https://api.getprio.online/api";
const SITES = ["marketing", "customer", "vendor", "platform"];

function fail(message) {
  throw new Error(message);
}

async function readManifest(root) {
  const file = path.join(root, "release", "51xx-static-bundle", "manifest.json");
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function safeExtract(archive, destination) {
  const { stdout } = await execFileAsync("tar", ["-tzf", archive]);
  for (const entry of stdout.split("\n").filter(Boolean)) {
    const normalized = path.posix.normalize(entry);
    if (normalized.startsWith("/") || normalized === ".." || normalized.startsWith("../")) {
      fail(`Unsafe release archive entry: ${entry}`);
    }
  }
  await execFileAsync("tar", ["-xzf", archive, "-C", destination]);
}

async function materialize(stage, deploymentSha) {
  if (!/^[a-f\d]{40}$/u.test(deploymentSha || "")) fail("A full deployment revision is required.");
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  const bundle = path.join(root, "release", "51xx-static-bundle");
  const manifest = await readManifest(root);
  if (manifest.api.production !== API_ORIGIN) fail("Release manifest has an unexpected production API origin.");
  if (manifest.sites.length !== SITES.length || SITES.some((site) => !manifest.sites.some((item) => item.name === site))) {
    fail("Release manifest does not contain all four frozen sites.");
  }
  await fs.rm(stage, { recursive: true, force: true });
  await fs.mkdir(stage, { recursive: true, mode: 0o755 });
  for (const site of SITES) {
    const output = path.join(stage, site);
    await fs.mkdir(output, { recursive: true, mode: 0o755 });
    await safeExtract(path.join(bundle, `${site}.tar.gz`), output);
    const index = path.join(output, "index.html");
    const html = await fs.readFile(index, "utf8");
    const files = await fs.readdir(output, { recursive: true });
    let productionBound = false;
    for (const file of files) {
      const candidate = path.join(output, file);
      const stat = await fs.stat(candidate);
      if (!stat.isFile()) continue;
      const contents = await fs.readFile(candidate, "utf8").catch(() => "");
      if (contents.includes("http://127.0.0.1:5091/api") || contents.includes("http://localhost:5091/api")) {
        fail(`Frozen ${site} artifact still contains a local API origin.`);
      }
      productionBound ||= contents.includes(API_ORIGIN);
    }
    if (!productionBound) fail(`Frozen ${site} artifact is not production-bound.`);
    if (site === "platform") {
      const revisionMeta = /(<meta\b[^>]*\bname=["']getprio-deploy-sha["'][^>]*\bcontent=["'])([a-f\d]{40})(["'])/iu;
      const rewritten = html.replace(revisionMeta, `$1${deploymentSha}$3`);
      if (!revisionMeta.test(html)) fail("Platform artifact is missing its deployment revision metadata.");
      await fs.writeFile(index, rewritten);
    }
  }
  console.log(`Materialized four frozen static sites into ${stage}.`);
}

const [command, stage, sha] = process.argv.slice(2);
try {
  if (command !== "materialize" || !stage || !sha) fail("Usage: release-bundle.mjs materialize STAGE DEPLOY_SHA");
  await materialize(stage, sha);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
