const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repositoryRoot = path.resolve(__dirname, "../..");
const verifierPath = path.join(repositoryRoot, "scripts/verify-fcm-config.sh");

const validConfiguration = {
  FCM_PROJECT_ID: "getprio",
  FCM_CLIENT_EMAIL: "firebase-adminsdk@getprio.iam.gserviceaccount.com",
  FCM_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nkey\\n-----END PRIVATE KEY-----"
};

function runVerifier(overrides = {}) {
  const environment = { ...process.env };
  for (const variableName of Object.keys(validConfiguration)) {
    delete environment[variableName];
  }
  Object.assign(environment, validConfiguration, overrides);
  return spawnSync("bash", [verifierPath], { env: environment, encoding: "utf8" });
}

test("production deployment wires and verifies all FCM credentials", () => {
  const workflow = fs.readFileSync(
    path.join(repositoryRoot, ".github/workflows/deploy-digitalocean.yml"),
    "utf8"
  );

  for (const variableName of Object.keys(validConfiguration)) {
    assert.match(workflow, new RegExp(`secrets\\.${variableName}`));
  }
  assert.match(workflow, /Missing one or more production FCM secrets/);
  assert.match(workflow, /printf "FCM_PRIVATE_KEY=.*fcm_private_key/);
  assert.match(workflow, /bash scripts\/verify-fcm-config\.sh/);
});

test("FCM verifier accepts a complete service-account configuration", () => {
  const result = runVerifier();

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /configuration is present for project getprio/);
});

test("FCM verifier rejects missing and malformed service-account configuration", () => {
  for (const variableName of Object.keys(validConfiguration)) {
    const result = runVerifier({ [variableName]: "" });
    assert.notEqual(result.status, 0, `${variableName} should be required`);
    assert.match(result.stderr, new RegExp(variableName));
  }

  const invalidEmail = runVerifier({ FCM_CLIENT_EMAIL: "service@example.com" });
  assert.notEqual(invalidEmail.status, 0);
  assert.match(invalidEmail.stderr, /service-account email/);

  const invalidKey = runVerifier({ FCM_PRIVATE_KEY: "not-a-private-key" });
  assert.notEqual(invalidKey.status, 0);
  assert.match(invalidKey.stderr, /PEM header/);
});
