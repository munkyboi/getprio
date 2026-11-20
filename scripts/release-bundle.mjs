import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const API_ORIGIN = "https://api.getprio.online/api";
const TURNSTILE_PLACEHOLDER = "__GETPRIO_TURNSTILE_SITE_KEY__";
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
  await fs.mkdir(stage, { recursive: true, mode: 0o755 });
  const stageNames = { marketing: "frontend", customer: "customer", vendor: "vendor", platform: "platform" };
  for (const site of SITES) {
    const output = path.join(stage, stageNames[site]);
    await fs.rm(output, { recursive: true, force: true });
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
      if (/https?:\/\/(?:127\.0\.0\.1|localhost):(?:5091|5190|5191|5192|5193|5194)/u.test(contents)) {
        fail(`Frozen ${site} artifact still contains a local runtime origin.`);
      }
      productionBound ||= contents.includes(API_ORIGIN);
      if (contents.includes(TURNSTILE_PLACEHOLDER)) {
        const siteKey = process.env.TURNSTILE_SITE_KEY || process.env.VITE_TURNSTILE_SITE_KEY || "";
        if (process.env.TURNSTILE_SECRET_KEY && !siteKey) fail("TURNSTILE_SECRET_KEY is configured but TURNSTILE_SITE_KEY is missing.");
        await fs.writeFile(candidate, contents.replaceAll(TURNSTILE_PLACEHOLDER, siteKey));
      }
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

async function publish(stage, deploymentSha) {
  if (!/^[a-f\d]{40}$/u.test(deploymentSha || "")) fail("A full deployment revision is required.");
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  const manifest = await readManifest(root);
  if (manifest.api.production !== API_ORIGIN) fail("Release manifest has an unexpected production API origin.");
  const targets = { frontend: "frontend/dist", customer: "frontend/dist-customer", vendor: "frontend/dist-vendor", platform: "platform-dashboard/dist", developer: "developer-portal/dist" };
  for (const [site, relativeTarget] of Object.entries(targets)) {
    const source = path.join(stage, site);
    const target = path.join(root, relativeTarget);
    await fs.mkdir(target, { recursive: true, mode: 0o755 });
    const entries = await fs.readdir(source, { recursive: true });
    const ordered = [...entries].sort((a, b) => Number(a.endsWith(".html")) - Number(b.endsWith(".html")) || a.localeCompare(b));
    for (const entry of ordered) {
      const sourceFile = path.join(source, entry);
      const stat = await fs.stat(sourceFile);
      if (!stat.isFile()) continue;
      const targetFile = path.join(target, entry);
      await fs.mkdir(path.dirname(targetFile), { recursive: true, mode: 0o755 });
      const temporary = `${targetFile}.release-${process.pid}`;
      await fs.copyFile(sourceFile, temporary);
      await fs.rename(temporary, targetFile);
    }
  }
  console.log("Published Marketing, Customer, Vendor, and Platform bundles to their configured roots.");
}

const [command, stage, sha] = process.argv.slice(2);
try {
  if (!stage || !sha || !["materialize", "publish"].includes(command)) fail("Usage: release-bundle.mjs materialize|publish STAGE DEPLOY_SHA");
  if (command === "materialize") await materialize(stage, sha);
  else await publish(stage, sha);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
