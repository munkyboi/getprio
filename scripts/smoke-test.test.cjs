const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { createHmac } = require("node:crypto");
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");
const test = require("node:test");

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

test("platform smoke completes an authenticator MFA challenge before checking protected APIs", async (t) => {
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  const evidenceSecret = "evidence-signing-secret-for-test-only-32-bytes";
  const deploymentSha = "a".repeat(40);
  const requests = [];
  const server = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
    requests.push({ method: request.method, path: request.url, body, authorization: request.headers.authorization });
    response.setHeader("content-type", "application/json");

    if (request.url === "/api/auth/login") {
      response.end(JSON.stringify({ mfaRequired: true, challengeToken: "challenge-token" }));
      return;
    }
    if (request.url === "/api/auth/mfa/verify") {
      const isCurrentCode = [-30_000, 0, 30_000].some((offset) => body.code === totp(secret, Date.now() + offset));
      if (body.challengeToken !== "challenge-token" || body.method !== "totp" || !isCurrentCode) {
        response.writeHead(401);
        response.end(JSON.stringify({ message: "invalid MFA code" }));
        return;
      }
      response.end(JSON.stringify({ token: "session-token", user: { id: "smoke-user" } }));
      return;
    }
    if (request.url === "/api/health") {
      response.end(JSON.stringify({ status: "ok", deploymentSha }));
      return;
    }
    if (request.url === "/api/platform/release-readiness/read-model") {
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
  const child = spawn(process.execPath, [path.join(__dirname, "smoke-test.mjs"), "--stage", "platform"], {
    env: {
      ...process.env,
      SMOKE_API_URL: `${origin}/api`,
      SMOKE_PLATFORM_URL: origin,
      PLATFORM_SMOKE_EMAIL: "smoke@example.test",
      PLATFORM_SMOKE_PASSWORD: "not-a-real-password",
      PLATFORM_SMOKE_TOTP_SECRET: secret,
      PLATFORM_RELEASE_EVIDENCE_SECRET: evidenceSecret,
      SMOKE_EXPECTED_DEPLOY_SHA: deploymentSha,
      GITHUB_RUN_ID: "19384756201",
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
  assert.deepEqual(requests.slice(0, 2).map(({ path: requestPath }) => requestPath), [
    "/api/auth/login",
    "/api/auth/mfa/verify"
  ]);
  assert.equal(requests[1].authorization, undefined);
  assert.ok(requests.some((request) => request.path === "/api/platform/release-readiness/read-model" && request.authorization === "Bearer session-token"));
  const report = requests.find((request) => request.path === "/api/platform/release-readiness/evidence");
  assert.equal(report.body.outcome, "success");
  assert.equal(report.body.deploymentSha, deploymentSha);
  assert.equal(report.body.workflowUrl, "https://github.com/getprio/web-app/actions/runs/19384756201");
});

test("missing release-evidence credentials fail the report-only smoke step instead of looking successful", () => {
  const source = fs.readFileSync(path.join(__dirname, "smoke-test.mjs"), "utf8");
  const workflow = fs.readFileSync(path.join(__dirname, "../.github/workflows/deploy-digitalocean.yml"), "utf8");
  assert.match(source, /PLATFORM_RELEASE_EVIDENCE_SECRET is missing[\s\S]*?throw new Error\("Authenticated smoke passed, but its release evidence could not be signed or recorded\."\)/);
  assert.match(workflow, /Authenticated Platform post-deploy smoke \(report-only\)[\s\S]*?continue-on-error: true/);
});
