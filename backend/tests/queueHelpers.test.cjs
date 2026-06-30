const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildLookupCode,
  buildQueueEventActor,
  formatTicketNumber,
  getAutoResumeWaitingCount,
  getDateKey,
  getQueueIntakeState,
  getRecoveryDeadline,
  redactPublicContactDetails
} = require("../src/services/queueHelpers");
const env = require("../src/config/env");

test("queue helpers format identifiers and redact public contact data", () => {
  assert.equal(formatTicketNumber("Q", 7), "Q007");
  assert.deepEqual(buildQueueEventActor({ actorUserId: 5, actorRole: "vendor_admin", source: "api" }), {
    actorUserId: 5,
    actorRole: "vendor_admin",
    source: "api"
  });
  assert.deepEqual(buildQueueEventActor(), {
    actorUserId: null,
    actorRole: null,
    source: "system"
  });

  const redacted = redactPublicContactDetails({
    name: "Sample",
    contactEmail: "a@example.com",
    contactPhone: "123"
  });
  assert.deepEqual(redacted, { name: "Sample" });
  assert.equal(redactPublicContactDetails(null), null);
  assert.equal(typeof buildLookupCode(), "string");
  assert.equal(buildLookupCode().length, 8);
});

test("queue helpers compute date and recovery values", () => {
  assert.equal(getDateKey(new Date("2026-06-30T16:00:00Z"), "Asia/Manila").length, 8);
  assert.equal(
    getRecoveryDeadline(new Date("2026-06-30T00:00:00Z")).toISOString(),
    new Date(Date.parse("2026-06-30T00:00:00Z") + env.queueRecoveryGraceMinutes * 60 * 1000).toISOString()
  );
});

test("queue intake helper covers disabled paused near-limit and open states", () => {
  assert.deepEqual(getQueueIntakeState({
    waitingCount: 1,
    autoPauseEnabled: false,
    autoPauseThreshold: 10,
    autoResumeEnabled: true,
    autoResumeVacancyPercent: 25,
    isPaused: false,
    pauseMode: null
  }).state, "disabled");

  assert.deepEqual(getQueueIntakeState({
    waitingCount: 9,
    autoPauseEnabled: true,
    autoPauseThreshold: 10,
    autoResumeEnabled: true,
    autoResumeVacancyPercent: 30,
    isPaused: true,
    pauseMode: "manual"
  }).stateLabel, "Paused");

  assert.deepEqual(getQueueIntakeState({
    waitingCount: 9,
    autoPauseEnabled: true,
    autoPauseThreshold: 10,
    autoResumeEnabled: true,
    autoResumeVacancyPercent: 30,
    isPaused: false,
    pauseMode: null
  }).state, "near_limit");

  assert.deepEqual(getQueueIntakeState({
    waitingCount: 2,
    autoPauseEnabled: true,
    autoPauseThreshold: 10,
    autoResumeEnabled: true,
    autoResumeVacancyPercent: 30,
    isPaused: false,
    pauseMode: null
  }).state, "open");
});

test("queue helper computes auto resume threshold only when enabled", () => {
  assert.equal(
    getAutoResumeWaitingCount({
      autoPauseEnabled: true,
      autoPauseThreshold: 20,
      autoResumeEnabled: true,
      autoResumeVacancyPercent: 25
    }),
    15
  );

  assert.equal(
    getAutoResumeWaitingCount({
      autoPauseEnabled: true,
      autoPauseThreshold: 20,
      autoResumeEnabled: false,
      autoResumeVacancyPercent: 25
    }),
    null
  );
});
