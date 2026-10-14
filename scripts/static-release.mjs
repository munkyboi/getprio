/* global process, console */
import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const BUILDS = [
  { workspace: "frontend", output: "frontend", target: "frontend/dist" },
  { workspace: "developer-portal", output: "developer", target: "developer-portal/dist" },
  { workspace: "platform-dashboard", output: "platform-legacy" },
  { prefix: "platform-dashboard-shadcn", output: "platform", target: "platform-dashboard/dist" }
];

function contains(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

async function canonical(file) {
  try { return await fs.realpath(file); }
  catch (error) {
    if (error.code !== "ENOENT") throw error;
    return path.join(await canonical(path.dirname(file)), path.basename(file));
  }
}

async function checkStage(stageRoot, repoRoot) {
  const stage = await fs.realpath(stageRoot);
  for (const build of BUILDS) {
    const target = await canonical(path.join(repoRoot, build.target || "platform-dashboard-shadcn/dist"));
    if (contains(stage, target) || contains(target, stage)) {
      throw new Error("Static staging must be separate from every served/build output directory.");
    }
    const output = path.join(stage, build.output);
    const stat = await fs.lstat(output).catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (stat?.isSymbolicLink()) throw new Error("Static staging output cannot be a symbolic link.");
  }
  return stage;
}

function runNpm(args, repoRoot) {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", args, { cwd: repoRoot, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => code === 0 ? resolve() : reject(new Error(`Static build failed (${signal || code}).`)));
  });
}

async function buildStaticRelease(stageRoot, repoRoot) {
  const stage = await checkStage(stageRoot, repoRoot);
  for (const build of BUILDS) {
    const selector = build.workspace ? ["--workspace", build.workspace] : ["--prefix", build.prefix];
    await runNpm([...selector, "run", "build", "--", "--outDir", path.join(stage, build.output), "--emptyOutDir"], repoRoot);
  }
}

async function filesUnder(root, relative = "") {
  const files = [];
  for (const entry of await fs.readdir(path.join(root, relative), { withFileTypes: true })) {
    const file = path.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw new Error("Static release artifacts cannot contain symbolic links.");
    if (entry.isDirectory()) files.push(...await filesUnder(root, file));
    else if (entry.isFile()) files.push(file);
    else throw new Error("Static release artifacts must be regular files or directories.");
  }
  return files.sort();
}

async function validateSite(source, requireSha) {
  const files = await filesUnder(source);
  if (!files.includes("index.html")) throw new Error("Static release is missing index.html.");
  for (const file of files.filter((name) => name.endsWith(".html"))) {
    const html = await fs.readFile(path.join(source, file), "utf8");
    if (!html.trim()) throw new Error("Static release contains empty HTML.");
    if (file === "index.html" && requireSha) {
      const deploymentMeta = [...html.matchAll(/<meta\b[^>]*>/giu)].find(([tag]) => /\bname=["']getprio-deploy-sha["']/iu.test(tag));
      const revision = deploymentMeta?.[0].match(/\bcontent=["']([a-f\d]{40})["']/iu)?.[1];
      if (revision !== requireSha) throw new Error("Platform HTML does not contain the expected deployment revision.");
    }
    for (const match of html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)=["']([^"']+)["']/giu)) {
      const reference = match[1];
      if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/iu.test(reference)) continue;
      const clean = decodeURIComponent(reference.split(/[?#]/u)[0]);
      const asset = clean.startsWith("/") ? path.resolve(source, `.${clean}`) : path.resolve(source, path.dirname(file), clean);
      if (!contains(source, asset) || !files.includes(path.relative(source, asset))) {
        throw new Error("Static HTML references an unavailable local asset.");
      }
    }
  }
  return files;
}

async function publicDirectory(root, relative) {
  const createdRoot = await fs.mkdir(root, { recursive: true, mode: 0o755 });
  if (createdRoot) await fs.chmod(root, 0o755);
  let directory = root;
  for (const part of relative.split(path.sep).filter((part) => part && part !== ".")) {
    directory = path.join(directory, part);
    let created = true;
    await fs.mkdir(directory, { mode: 0o755 }).catch((error) => {
      if (error.code !== "EEXIST") throw error;
      created = false;
    });
    const stat = await fs.lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Static publication directory is unsafe.");
    if (created) await fs.chmod(directory, 0o755);
  }
}

async function atomicCopy(source, root, relative) {
  await publicDirectory(root, path.dirname(relative));
  const target = path.join(root, relative);
  const temporary = path.join(path.dirname(target), `.static-publish-${crypto.randomUUID()}`);
  try {
    await fs.copyFile(source, temporary, constants.COPYFILE_EXCL);
    await fs.chmod(temporary, 0o644);
    await fs.rename(temporary, target);
  } finally {
    await fs.unlink(temporary).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}

async function publishStaticRelease(stageRoot, repoRoot, deploymentSha) {
  if (!/^[a-f\d]{40}$/u.test(deploymentSha || "")) throw new Error("A full deployment revision is required.");
  const stage = await checkStage(stageRoot, repoRoot);
  const sites = [];
  // Validate every site before changing any served file.
  for (const build of BUILDS.filter((item) => item.target)) {
    const source = path.join(stage, build.output);
    const files = await validateSite(source, build.output === "platform" ? deploymentSha : null);
    sites.push({ source, files, target: await canonical(path.join(repoRoot, build.target)) });
  }
  if (new Set(sites.map((site) => site.target)).size !== sites.length) throw new Error("Served static roots must be distinct.");
  // Retain prior hashed assets for cached HTML and in-flight clients.
  for (const site of sites) {
    for (const file of site.files.filter((name) => !name.endsWith(".html"))) {
      await atomicCopy(path.join(site.source, file), site.target, file);
    }
  }
  for (const site of sites) {
    for (const file of site.files.filter((name) => name.endsWith(".html"))) {
      await atomicCopy(path.join(site.source, file), site.target, file);
    }
  }
}

export { buildStaticRelease, publishStaticRelease };

if (process.argv[1] && await fs.realpath(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, stage, sha] = process.argv.slice(2);
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const action = command === "build" ? () => buildStaticRelease(stage, root)
    : command === "publish" ? () => publishStaticRelease(stage, root, sha)
      : () => Promise.reject(new Error("Usage: static-release.mjs build STAGE | publish STAGE DEPLOY_SHA"));
  action().then(() => console.log(`Static release ${command} completed.`)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
