const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { createHmac } = require("node:crypto");
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");
const test = require("node:test");

test("retired campaign smoke aliases perform no network requests or campaign mutations", async () => {
  for (const stage of ["campaign", "group-funded"]) {
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(__dirname, "smoke-test.mjs"), "--stage", stage], {
        env: { ...process.env, SMOKE_API_URL: "http://127.0.0.1:1/api", SMOKE_EMAIL: "fixture@example.test", SMOKE_PASSWORD: "fixture-only", SMOKE_ORGANIZER_CAMPAIGN: "1", SMOKE_GROUP_FUNDED: "1", GITHUB_RUN_ID: "test-run", SMOKE_EXPECTED_DEPLOY_SHA: "a".repeat(40), PLATFORM_RELEASE_EVIDENCE_SECRET: "fixture-evidence-secret-at-least-32-bytes" }
      });
      let output = "";
      child.stdout.on("data", (chunk) => { output += chunk; });
      child.stderr.on("data", (chunk) => { output += chunk; });
      child.on("error", reject);
      child.on("close", (code) => resolve({ code, output }));
    });
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /campaign smoke stage retired/);
  }
});

function totp(secret, timestamp = Date.now()) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of secret.replace(/=+$/u, "").toUpperCase()) {
    const value = alphabet.indexOf(character);
    if (value < 0) throw new Error("invalid base32 secret");
    bits += value.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(timestamp / 30_000)));
  const digest = createHmac("sha1", Buffer.from(bytes)).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

test("platform smoke waits for the deployed revision and authenticates cookie-backed sessions with or without MFA", async (t) => {
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  const evidenceSecret = "evidence-signing-secret-for-test-only-32-bytes";
  const deploymentSha = "a".repeat(40);
  const requests = [];
  const reports = [];
  const healthResponses = [
    { status: 502, body: { message: "starting" } },
    { status: 200, body: { status: "ok", deploymentSha: "b".repeat(40) } },
    { status: 200, body: { status: "ok", deploymentSha } }
  ];
  const server = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
    requests.push({
      method: request.method,
      path: request.url,
      body,
      authorization: request.headers.authorization,
      cookie: request.headers.cookie || ""
    });
    response.setHeader("content-type", "application/json");

    if (request.url === "/api/auth/login") {
      if (body.email === "smoke-mfa@example.test") {
        response.end(JSON.stringify({ mfaRequired: true, challengeToken: "challenge-token" }));
        return;
      }
      response.setHeader("set-cookie", [
        "__Host-prio_access=direct-access; Path=/; Secure; HttpOnly",
        "__Host-prio_refresh=direct-refresh; Path=/; Secure; HttpOnly",
        "prio_csrf=direct-csrf; Path=/; Secure"
      ]);
      response.end(JSON.stringify({ user: { id: "direct-user" }, csrfToken: "direct-csrf" }));
      return;
    }
    if (request.url === "/api/auth/mfa/verify") {
      const isCurrentCode = [-30_000, 0, 30_000].some((offset) => body.code === totp(secret, Date.now() + offset));
      if (body.challengeToken !== "challenge-token" || body.method !== "totp" || !isCurrentCode) {
        response.writeHead(401);
        response.end(JSON.stringify({ message: "invalid MFA code" }));
        return;
      }
      response.setHeader("set-cookie", [
        "__Host-prio_access=mfa-access; Path=/; Secure; HttpOnly",
        "__Host-prio_refresh=mfa-refresh; Path=/; Secure; HttpOnly",
        "prio_csrf=mfa-csrf; Path=/; Secure"
      ]);
      response.end(JSON.stringify({ user: { id: "mfa-user" }, csrfToken: "mfa-csrf" }));
      return;
    }
    if (request.url === "/api/health") {
      const nextHealthResponse = healthResponses.shift() || { status: 200, body: { status: "ok", deploymentSha } };
      response.writeHead(nextHealthResponse.status);
      response.end(JSON.stringify(nextHealthResponse.body));
      return;
    }
    if (request.url === "/api/platform/release-readiness/read-model") {
      if (!request.headers.cookie?.includes("__Host-prio_access=")) {
        response.writeHead(401);
        response.end(JSON.stringify({ message: "cookie session missing" }));
        return;
      }
      response.end(JSON.stringify({ data: { surfaces: [] } }));
      return;
    }
    if (request.url === "/api/platform/release-readiness/evidence") {
      const timestamp = request.headers["x-platform-evidence-timestamp"];
      const expectedSignature = createHmac("sha256", evidenceSecret)
        .update(`${timestamp}.${Buffer.concat(chunks).toString("utf8")}`)
        .digest("hex");
      if (request.headers["x-platform-evidence-signature"] !== expectedSignature) {
        response.writeHead(401);
        response.end(JSON.stringify({ message: "bad signature" }));
        return;
      }
      const report = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      reports.push(report);
      response.end(JSON.stringify({ accepted: true }));
      return;
    }
    if (request.url === "/api/platform/overview") {
      response.end(JSON.stringify({ totals: {} }));
      return;
    }
    if (request.url === "/api/platform/plans") {
      response.end(JSON.stringify({ plans: [] }));
      return;
    }
    if (request.url === "/api/platform/queue-fees") {
      response.end(JSON.stringify({ queueFees: [] }));
      return;
    }
    if (request.url === "/api/platform/settings") {
      response.end(JSON.stringify({ settings: {} }));
      return;
    }
    if (!request.url?.startsWith("/api/")) {
      response.setHeader("content-type", "text/html");
      response.end(`<html><head><meta name="getprio-deploy-sha" content="${deploymentSha}" /></head><div id="root"></div></html>`);
      return;
    }
    response.writeHead(404);
    response.end(JSON.stringify({ message: "not found" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

  const origin = `http://127.0.0.1:${server.address().port}`;
  async function runPlatformSmoke(email, runId) {
    const child = spawn(process.execPath, [path.join(__dirname, "smoke-test.mjs"), "--stage", "platform"], {
      env: {
        ...process.env,
        SMOKE_API_URL: `${origin}/api`,
        SMOKE_PLATFORM_URL: origin,
        PLATFORM_SMOKE_EMAIL: email,
        PLATFORM_SMOKE_PASSWORD: "not-a-real-password",
        PLATFORM_SMOKE_TOTP_SECRET: secret,
        PLATFORM_RELEASE_EVIDENCE_SECRET: evidenceSecret,
        SMOKE_EXPECTED_DEPLOY_SHA: deploymentSha,
        SMOKE_API_READY_RETRY_INTERVAL_MS: "10",
        GITHUB_RUN_ID: runId,
        GITHUB_REPOSITORY: "getprio/web-app",
        GITHUB_SERVER_URL: "https://github.com"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    const exitCode = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
    assert.equal(exitCode, 0, `${stdout}\n${stderr}`);
  }

  await runPlatformSmoke("smoke@example.test", "19384756201");
  await runPlatformSmoke("smoke-mfa@example.test", "19384756202");

  const requestPaths = requests.map(({ path: requestPath }) => requestPath);
  assert.ok(requestPaths.indexOf("/api/auth/login") < requestPaths.indexOf("/api/platform/release-readiness/read-model"));
  assert.ok(requestPaths.includes("/api/auth/mfa/verify"));
  const protectedReads = requests.filter(({ path: requestPath }) => requestPath === "/api/platform/release-readiness/read-model");
  assert.equal(protectedReads.length, 2);
  assert.ok(protectedReads[0].cookie.includes("__Host-prio_access=direct-access"));
  assert.ok(protectedReads[1].cookie.includes("__Host-prio_access=mfa-access"));
  assert.ok(protectedReads.every(({ authorization }) => authorization === undefined));
  assert.equal(reports.length, 2);
  assert.ok(reports.every((report) => report.outcome === "success" && report.deploymentSha === deploymentSha));
  assert.equal(reports[0].workflowUrl, "https://github.com/getprio/web-app/actions/runs/19384756201");
  assert.equal(reports[1].workflowUrl, "https://github.com/getprio/web-app/actions/runs/19384756202");
});

test("missing release-evidence credentials fail the report-only smoke step instead of looking successful", () => {
  const source = fs.readFileSync(path.join(__dirname, "smoke-test.mjs"), "utf8");
  const workflow = fs.readFileSync(path.join(__dirname, "../.github/workflows/deploy-digitalocean.yml"), "utf8");
  assert.match(source, /PLATFORM_RELEASE_EVIDENCE_SECRET is missing[\s\S]*?throw new Error\("Authenticated smoke passed, but its release evidence could not be signed or recorded\."\)/);
  assert.match(workflow, /Authenticated Platform post-deploy smoke \(report-only\)[\s\S]*?continue-on-error: true/);
});
