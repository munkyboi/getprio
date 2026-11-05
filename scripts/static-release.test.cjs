const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");

const SHA = "a".repeat(40);
const release = import("./static-release.mjs");
const sites = [["frontend", "frontend/dist"], ["developer", "developer-portal/dist"], ["platform", "platform-dashboard/dist"]];
const html = (version, sha = SHA) => `<html><head><meta name="getprio-deploy-sha" content="${sha}"><script src="/assets/${version}.js"></script></head><body>${version}</body></html>`;

async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "getprio-static-release-test-")));
  const repo = path.join(root, "repo");
  const stage = path.join(root, "stage");
  await fs.mkdir(stage, { recursive: true });
  for (const [name, target] of sites) {
    for (const [dir, version] of [[path.join(repo, target), "old"], [path.join(stage, name), "new"]]) {
      await fs.mkdir(path.join(dir, "assets"), { recursive: true });
      await fs.writeFile(path.join(dir, "index.html"), html(version));
      await fs.writeFile(path.join(dir, "assets", `${version}.js`), version);
    }
  }
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { root, repo, stage };
}

async function assertOld(repo) {
  for (const [, target] of sites) assert.equal(await fs.readFile(path.join(repo, target, "index.html"), "utf8"), html("old"));
}

test("an incomplete later site cannot change earlier served pages or assets", async (t) => {
  const { repo, stage } = await fixture(t);
  await fs.unlink(path.join(stage, "platform/index.html"));
  await assert.rejects((await release).publishStaticRelease(stage, repo, SHA), /missing index/u);
  await assertOld(repo);
  await assert.rejects(fs.access(path.join(repo, "frontend/dist/assets/new.js")), { code: "ENOENT" });
});

test("missing referenced assets and a wrong Platform revision fail before publication", async (t) => {
  const { repo, stage } = await fixture(t);
  await fs.unlink(path.join(stage, "developer/assets/new.js"));
  await assert.rejects((await release).publishStaticRelease(stage, repo, SHA), /unavailable local asset/u);
  await assertOld(repo);
  await fs.writeFile(path.join(stage, "developer/assets/new.js"), "new");
  await fs.writeFile(path.join(stage, "platform/index.html"), html("new", "b".repeat(40)));
  await assert.rejects((await release).publishStaticRelease(stage, repo, SHA), /expected deployment revision/u);
  await assertOld(repo);
});

test("staging inside a served directory or through an output symlink is rejected", async (t) => {
  const { repo, stage } = await fixture(t);
  await assert.rejects((await release).buildStaticRelease(path.join(repo, "frontend/dist"), repo), /separate/u);
  await fs.rm(path.join(stage, "frontend"), { recursive: true });
  await fs.symlink(path.join(repo, "frontend/dist"), path.join(stage, "frontend"));
  await assert.rejects((await release).buildStaticRelease(stage, repo), /symbolic link/u);
  await assertOld(repo);
});

test("private or writable artifacts fail before changing served pages", async (t) => {
  const { repo, stage } = await fixture(t);
  const artifact = path.join(stage, "platform/assets/new.js");
  await fs.chmod(artifact, 0o600);
  await assert.rejects((await release).publishStaticRelease(stage, repo, SHA), /public-readable/u);
  await assertOld(repo);
  await fs.chmod(artifact, 0o666);
  await assert.rejects((await release).publishStaticRelease(stage, repo, SHA), /public-readable/u);
  await assertOld(repo);
});

test("a restrictive publication umask fails without exposing new HTML", async (t) => {
  const { repo, stage } = await fixture(t);
  await fs.mkdir(path.join(stage, "frontend/new-assets"));
  await fs.writeFile(path.join(stage, "frontend/new-assets/extra.js"), "public");
  const previous = process.umask(0o077);
  try { await assert.rejects((await release).publishStaticRelease(stage, repo, SHA), /umask 022/u); }
  finally { process.umask(previous); }
  await assertOld(repo);
  // A retry must not reuse the private directory left by the failed attempt.
  await assert.rejects((await release).publishStaticRelease(stage, repo, SHA), /umask 022/u);
  await assertOld(repo);
});

test("symlink artifacts cannot publish outside the static release", async (t) => {
  const { repo, stage } = await fixture(t);
  await fs.symlink(path.join(repo, "frontend/dist/assets/old.js"), path.join(stage, "frontend/assets/link.js"));
  await assert.rejects((await release).publishStaticRelease(stage, repo, SHA), /symbolic link/u);
  await assertOld(repo);
});

test("an unrelated meta value cannot substitute for Platform deployment identity", async (t) => {
  const { repo, stage } = await fixture(t);
  await fs.writeFile(path.join(stage, "platform/index.html"), html("new").replace('name="getprio-deploy-sha"', 'name="unrelated"'));
  await assert.rejects((await release).publishStaticRelease(stage, repo, SHA), /expected deployment revision/u);
  await assertOld(repo);
});

test("aliased served roots fail before publication", async (t) => {
  const { repo, stage } = await fixture(t);
  await fs.rm(path.join(repo, "platform-dashboard/dist"), { recursive: true });
  await fs.symlink(path.join(repo, "frontend/dist"), path.join(repo, "platform-dashboard/dist"));
  await assert.rejects((await release).publishStaticRelease(stage, repo, SHA), /must be distinct/u);
  await assertOld(repo);
});

test("asset publication failure leaves every old HTML entry intact and cleans temporary files", async (t) => {
  const { repo, stage } = await fixture(t);
  await fs.mkdir(path.join(repo, "developer-portal/dist/assets/new.js"));
  await assert.rejects((await release).publishStaticRelease(stage, repo, SHA));
  await assertOld(repo);
  assert.equal((await fs.readdir(path.join(repo, "developer-portal/dist/assets"))).some((name) => name.startsWith(".static-publish-")), false);
});

test("HTTP readers keep complete pages and referenced assets throughout publication", async (t) => {
  const { repo, stage } = await fixture(t);
  for (let i = 0; i < 40; i++) await fs.writeFile(path.join(stage, "frontend/assets", `chunk-${i}.js`), "x".repeat(65536));
  const served = path.join(repo, "frontend/dist");
  const routes = new Map([
    ["/", path.join(served, "index.html")],
    ["/assets/old.js", path.join(served, "assets/old.js")],
    ["/assets/new.js", path.join(served, "assets/new.js")]
  ]);
  const server = http.createServer(async (req, res) => {
    const file = routes.get(req.url);
    if (!file) { res.writeHead(404).end(); return; }
    try { res.end(await fs.readFile(file)); }
    catch { res.writeHead(404).end(); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(base + "/unlisted.txt")).status, 404);
  assert.equal((await fetch(base + "/%2e%2e%2fpackage.json")).status, 404);
  let samples = 0;
  async function readSite() {
    const response = await fetch(base);
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.ok(body === html("old") || body === html("new"), "HTML must be a complete old or new document");
    const asset = body.match(/src="([^"]+)"/u)[1];
    assert.equal((await fetch(base + asset)).status, 200);
    samples++;
  }
  await readSite();
  let complete = false;
  const publishing = (await release).publishStaticRelease(stage, repo, SHA).finally(() => { complete = true; });
  while (!complete) await readSite();
  await publishing;
  await readSite();
  assert.ok(samples >= 3);
  assert.equal(await (await fetch(base + "/assets/old.js")).text(), "old", "cached pages retain their previous hashed assets");
  for (const [, target] of sites) assert.equal(await fs.readFile(path.join(repo, target, "index.html"), "utf8"), html("new"));
});

async function viteFixture(t) {
  const f = await fixture(t);
  const vitePackage = require.resolve("vite/package.json");
  const viteBin = path.join(path.dirname(vitePackage), "bin/vite.js");
  await fs.symlink(path.resolve(__dirname, "../node_modules"), path.join(f.repo, "node_modules"));
  await fs.writeFile(path.join(f.repo, "package.json"), JSON.stringify({ private: true, workspaces: ["frontend", "developer-portal", "platform-dashboard"] }));
  for (const name of ["frontend", "developer-portal", "platform-dashboard", "platform-dashboard-shadcn"]) {
    const dir = path.join(f.repo, name);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "package.json"), JSON.stringify({ name, version: "1.0.0", scripts: { build: `node '${viteBin.replaceAll("'", "'\\''")}' build` } }));
    await fs.writeFile(path.join(dir, "index.html"), '<script type="module" src="/main.js"></script>');
    await fs.writeFile(path.join(dir, "main.js"), 'document.body.dataset.version = "new";');
    const served = path.join(f.repo, name === "platform-dashboard-shadcn" ? "platform-dashboard" : name, "dist/index.html");
    await fs.writeFile(path.join(dir, "vite.config.mjs"), `import fs from 'node:fs/promises'; export default { plugins: [{ name:'observe-served-page', renderStart:{order:'post',async handler(){ const html = await fs.readFile(${JSON.stringify(served)}, 'utf8'); if(!html.includes('<body>old</body>')) throw Error('Served HTML changed during build'); }}}] };`);
  }
  return f;
}

test("real Vite builds use private staging while served pages stay intact", { timeout: 30000 }, async (t) => {
  const { repo, stage } = await viteFixture(t);
  await (await release).buildStaticRelease(stage, repo);
  await assertOld(repo);
  for (const name of ["frontend", "developer", "platform-legacy", "platform"]) assert.ok((await fs.readFile(path.join(stage, name, "index.html"), "utf8")).includes("<script"));
});

test("a later build failure cannot replace previously published sites", { timeout: 30000 }, async (t) => {
  const { repo, stage } = await viteFixture(t);
  await fs.writeFile(path.join(repo, "developer-portal/main.js"), "this is deliberately invalid javascript !");
  await assert.rejects((await release).buildStaticRelease(stage, repo), /Static build failed/u);
  await assertOld(repo);
});
