require("tsx/cjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const { QUEUE_BOARD_POLL_INTERVAL, queueBoardPollingState } = require("../src/utils/queueBoardPolling.ts");

test("pending board approval polls within the venue budget and stops at expiry", () => {
  let nextCheckAt = 0;
  let requests = 0;
  let expiryChecked = false;
  for (let now = 0; now <= 15 * 60_000; now += 1000) {
    const state = queueBoardPollingState(now, nextCheckAt, 5 * 60_000, expiryChecked);
    if (state === "check" || state === "final-check") {
      if (state === "final-check") expiryChecked = true;
      requests++;
      nextCheckAt = now + QUEUE_BOARD_POLL_INTERVAL;
    }
  }
  assert.equal(requests, 21);
  assert.equal(queueBoardPollingState(5 * 60_000, 0, 5 * 60_000, true), "expired");
  assert.equal(queueBoardPollingState(0, 0, NaN), "expired");
  assert.equal(queueBoardPollingState(0, 0, null), "check", "manual refresh starts a new request");
});

test("an approval during the last poll interval is observed before polling stops", () => {
  const expiry = 300_000;
  assert.equal(queueBoardPollingState(285_000, 285_000, expiry), "check");
  // Staff approve at 299 seconds; the final access request sees the durable grant.
  assert.equal(queueBoardPollingState(300_000, 300_000, expiry), "final-check");
  assert.equal(queueBoardPollingState(315_000, 300_000, null, true), "check", "approval clears pairing expiry");
  assert.equal(queueBoardPollingState(315_000, 300_000, expiry, true), "expired", "denial stops further requests");
});
