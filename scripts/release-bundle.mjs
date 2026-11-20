import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const API_ORIGIN = "https://api.getprio.online/api";
const API_URL = new URL(API_ORIGIN);
const TURNSTILE_PLACEHOLDER = "__GETPRIO_TURNSTILE_SITE_KEY__";
const SITES = ["marketing", "customer", "vendor", "platform"];

function fail(message) {
  throw new Error(message);
}

function containsProductionApiReference(contents) {
  for (const match of contents.matchAll(/https?:\/\/[^"'`\s<>]+/gu)) {
    try {
      const url = new URL(match[0]);
      if (url.origin === API_URL.origin && (url.pathname === API_URL.pathname || url.pathname.startsWith(`${API_URL.pathname}/`))) return true;
    } catch {
      // Ignore non-URL text and continue checking the remaining references.
    }
  }
  return false;
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

async function rebuildMarketing(output, root, deploymentSha) {
  if (process.env.VITE_REBUILD_MARKETING !== "1") return;
  await execFileAsync("npm", ["--workspace", "frontend", "run", "build", "--", "--outDir", output, "--emptyOutDir"], {
    cwd: root,
    env: { ...process.env, VITE_PUBLIC_UNIVERSAL_AUTH: "1", VITE_APP_SURFACE: "marketing", VITE_LOCAL_SURFACES: "0", VITE_API_URL: API_ORIGIN, VITE_DEPLOY_SHA: deploymentSha }
  });
}

async function validateMaterializedSite(site, output, deploymentSha) {
  const index = path.join(output, "index.html");
  const html = await fs.readFile(index, "utf8");
  const files = await fs.readdir(output, { recursive: true });
  let productionBound = false;
  for (const file of files) {
    const candidate = path.join(output, file);
    if (!(await fs.stat(candidate)).isFile()) continue;
    const contents = await fs.readFile(candidate, "utf8").catch(() => "");
    if (/https?:\/\/(?:127\.0\.0\.1|localhost):(?:5091|5190|5191|5192|5193|5194)/u.test(contents)) fail(`Frozen ${site} artifact still contains a local runtime origin.`);
    productionBound ||= containsProductionApiReference(contents);
    if (contents.includes(TURNSTILE_PLACEHOLDER)) {
      const siteKey = process.env.TURNSTILE_SITE_KEY || process.env.VITE_TURNSTILE_SITE_KEY || "";
      if (process.env.TURNSTILE_SECRET_KEY && !siteKey) fail("TURNSTILE_SECRET_KEY is configured but TURNSTILE_SITE_KEY is missing.");
      await fs.writeFile(candidate, contents.replaceAll(TURNSTILE_PLACEHOLDER, siteKey));
    }
  }
  if (!productionBound) fail(`Frozen ${site} artifact is not production-bound.`);
  if (site === "platform") {
    const revisionMeta = /(<meta\b[^>]*\bname=["']getprio-deploy-sha["'][^>]*\bcontent=["'])([a-f\d]{40})(["'])/iu;
    if (!revisionMeta.test(html)) fail("Platform artifact is missing its deployment revision metadata.");
    await fs.writeFile(index, html.replace(revisionMeta, `$1${deploymentSha}$3`));
  }
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
    await rebuildMarketing(output, root, deploymentSha);
    await validateMaterializedSite(site, output, deploymentSha);
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
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  try {
    if (!stage || !sha || !["materialize", "publish"].includes(command)) fail("Usage: release-bundle.mjs materialize|publish STAGE DEPLOY_SHA");
    if (command === "materialize") await materialize(stage, sha);
    else await publish(stage, sha);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

export { containsProductionApiReference };
