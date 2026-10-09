const test = require("node:test");
const assert = require("node:assert/strict");

const db = require("../src/config/db");
function transactionFixture(threshold=5) {
  return async fn => fn({ query: async sql => ({ rows: sql.includes("FROM tenants")
    ? [{is_active:true,auto_pause_enabled:true,auto_pause_threshold:threshold,auto_resume_enabled:true,auto_resume_vacancy_percent:25}]
    : [{ id: 1, is_active:true,timezone: "Asia/Manila", queue_lifecycle_mode: "legacy" }] }) });
}
db.withTransaction = transactionFixture();
require("../src/repositories/queueEvents").createQueueEvent=async()=>({_id:"1"});

const helpers = require("../src/services/queueAutomationHelpers");

test("maybeAutoPauseQueueDay returns null when the queue is not at threshold", async () => {
  const storeLocations = require("../src/repositories/storeLocations");
  const closures = require("../src/repositories/queueDayClosures");
  const pauses = require("../src/repositories/queueDayPauses");
  const tickets = require("../src/repositories/tickets");

  storeLocations.findLocationByTenantAndSlug = async () => null;
  storeLocations.findPrimaryLocationByTenantId = async () => ({ _id: 1, slug: "main", timezone: "Asia/Manila" });
  closures.findActiveClosure = async () => null;
  pauses.findActivePause = async () => null;
  tickets.listWaitingTickets = async () => [{ _id: 1 }, { _id: 2 }];

  const result = await helpers.maybeAutoPauseQueueDay(
    { _id: 10, autoPauseEnabled: true, autoPauseThreshold: 5 },
    {}
  );

  assert.equal(result, null);
});

test("maybeAutoPauseQueueDay creates a pause when threshold is reached", async () => {
  const storeLocations = require("../src/repositories/storeLocations");
  const closures = require("../src/repositories/queueDayClosures");
  const pauses = require("../src/repositories/queueDayPauses");
  const tickets = require("../src/repositories/tickets");
  const db = require("../src/config/db");

  storeLocations.findLocationByTenantAndSlug = async () => null;
  storeLocations.findPrimaryLocationByTenantId = async () => ({ _id: 1, slug: "main", timezone: "Asia/Manila" });
  closures.findActiveClosure = async () => null;
  pauses.findActivePause = async () => null;
  tickets.listWaitingTickets = async () => [{ _id: 1 }, { _id: 2 }, { _id: 3 }];
  pauses.createPause = async () => ({ _id: 99, pauseMode: "auto_threshold" });
  db.withTransaction = transactionFixture(3);

  const result = await helpers.maybeAutoPauseQueueDay(
    { _id: 10, autoPauseEnabled: true, autoPauseThreshold: 3 },
    { client: db.pool }
  );

  assert.equal(result._id, 99);
});

test("maybeAutoResumeQueueDay returns true when auto-threshold pause can be resumed", async () => {
  const storeLocations = require("../src/repositories/storeLocations");
  const pauses = require("../src/repositories/queueDayPauses");
  const tickets = require("../src/repositories/tickets");
  const db = require("../src/config/db");

  storeLocations.findLocationByTenantAndSlug = async () => null;
  storeLocations.findPrimaryLocationByTenantId = async () => ({ _id: 1, slug: "main", timezone: "Asia/Manila" });
  pauses.findActivePause = async () => ({ _id: 5, pauseMode: "auto_threshold", pauseReason: "Auto" });
  pauses.resumePause = async () => ({});
  tickets.listWaitingTickets = async () => [{ _id: 1 }];
  db.withTransaction = transactionFixture(3);

  const result = await helpers.maybeAutoResumeQueueDay(
    {
      _id: 10,
      autoPauseEnabled: true,
      autoPauseThreshold: 3,
      autoResumeEnabled: true,
      autoResumeVacancyPercent: 25
    },
    {}
  );

  assert.equal(result, true);
});
