const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const dashboardSource = fs.readFileSync(
  path.resolve(__dirname, "../src/pages/VendorDashboardPage.tsx"),
  "utf8",
);

test("vendor dashboard keeps the queue-capable route composition", () => {
  assert.match(dashboardSource, /ResourceDashboard/);
  assert.match(dashboardSource, /WorkflowQueuePanel/);
  assert.match(dashboardSource, /NamedQueuePanel/);
  assert.match(dashboardSource, /CounterQueueControls/);
  assert.match(dashboardSource, /currentSection === "overview"/);
  assert.match(dashboardSource, /currentSection === "queue"/);
});

test("vendor queue actions remain selected by the location queue type", () => {
  assert.match(dashboardSource, /queueIntakeMode\(/);
  assert.match(dashboardSource, /intakeMode === "workflow"/);
  assert.match(dashboardSource, /workPresentation\.resourceCounters/);
  assert.match(dashboardSource, /resourceQueueEnabled/);
});
