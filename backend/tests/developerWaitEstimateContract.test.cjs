const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const openapi = require("../src/routes/developerApiOpenapi");
const root = path.resolve(__dirname, "../..");

test("published Ticket contract documents the optional nullable Sandbox issuance estimate", () => {
  const ticket = openapi.components.schemas.Ticket;
  const estimate = ticket.properties.estimated_wait_minutes;
  assert.deepEqual(estimate.type, ["number", "null"]);
  assert.equal(estimate.minimum, 0);
  assert.ok(!ticket.required.includes("estimated_wait_minutes"));
  assert.match(estimate.description, /Sandbox ticket issuance/);
  assert.match(estimate.description, /idempotent replay/);
  assert.match(estimate.description, /Omitted from production/);
});

test("Developer Portal ticket example includes the estimate and its Sandbox-only scope", () => {
  const source = fs.readFileSync(path.join(root, "developer-portal/src/DeveloperReferencePage.tsx"), "utf8");
  const example = source.match(/const ticketResponseExample = \[([\s\S]*?)\]\.join/)[1];
  const lines = [...example.matchAll(/^\s*("(?:[^"\\]|\\.)*")\s*,?$/gm)].map((match) => JSON.parse(match[1]));
  assert.equal(JSON.parse(lines.join("\n")).data.ticket.estimated_wait_minutes, 15);
  assert.match(source, /optional <code>estimated_wait_minutes<\/code>/);
  assert.match(source, /Production and other ticket responses omit this field/);
});

test("deployment guide keeps environment values and audit commands in separate balanced fences", () => {
  const lines = fs.readFileSync(path.join(root, "docs/digitalocean-deployment.md"), "utf8").split("\n");
  let language = null;
  let sawB2 = false;
  let sawAudit = false;
  for (const line of lines) {
    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      if (language === null) language = fence[1];
      else {
        assert.equal(fence[1], "", "A new fenced block cannot start inside an existing block");
        language = null;
      }
      continue;
    }
    if (line.startsWith("B2_S3_ENDPOINT=")) {
      sawB2 = true;
      assert.equal(language, "env");
    }
    if (line.includes("node scripts/wait-time-prediction-audit.mjs")) {
      sawAudit = true;
      assert.equal(language, "bash");
    }
    if (line.startsWith("## Sandbox API deployment") || line.startsWith("OAuth deployment checklist:")) assert.equal(language, null);
  }
  assert.equal(language, null, "All code fences must be closed");
  assert.ok(sawB2 && sawAudit);
});
