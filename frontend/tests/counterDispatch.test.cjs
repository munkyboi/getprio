require("tsx/cjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const { selectCounterDispatch, countCalledTicketsForQueueDay } = require("../src/utils/counterDispatch.ts");
const { queueBoardReturnPath } = require("../src/utils/queueBoardReturnPath.ts");
const snapshot = { tenant: { slug: "vendor" }, location: { slug: "main" }, current: { id: "wrong-summary" },
  calledTickets: [{ id: "a", serviceCounterId: "1" }, { id: "legacy", serviceCounterId: null }],
  counterDispatch: [{ counterSlug: "desk-a", currentTicketId: "a", canCallNext: false },
    { counterSlug: "desk-b", currentTicketId: null, canCallNext: true },
    { counterSlug: null, currentTicketId: "legacy", canCallNext: false }] };
test("counter selection never targets compatibility current or another counter's call", () => {
  assert.equal(selectCounterDispatch(snapshot, "vendor", "main", "desk-a").ticket.id, "a");
  const second = selectCounterDispatch(snapshot, "vendor", "main", "desk-b");
  assert.equal(second.ticket, null); assert.equal(second.lane.canCallNext, true);
  assert.equal(selectCounterDispatch(snapshot, "vendor", "main", "__unassigned__").ticket.id, "legacy");
});
test("pairing returns survive login and enrollment without accepting external redirects", () => {
  const code = "a".repeat(32);
  const target = `/dashboard/queue?boardPairing=${code}`;
  assert.equal(queueBoardReturnPath(`?boardPairing=${code}`), target);
  assert.equal(queueBoardReturnPath(`?next=${encodeURIComponent(target)}`), target);
  assert.equal(queueBoardReturnPath(`?next=${encodeURIComponent(`https://attacker.example${target}`)}`), null);
  assert.equal(queueBoardReturnPath("?boardPairing=bad"), null);
});
test("missing/loading/stale location context disables dispatch and clears current target", () => {
  for (const [data, tenant, location, counter] of [[null, "vendor", "main", "desk-a"], [snapshot, "other", "main", "desk-a"], [snapshot, "vendor", "other", "desk-a"], [snapshot, "vendor", "main", ""]]) {
    const value = selectCounterDispatch(data, tenant, location, counter);
    assert.equal(value.lane, undefined); assert.equal(value.ticket, null);
  }
});

test("close warnings count every current-day called lane and exclude older calls", () => {
  assert.equal(countCalledTicketsForQueueDay(null), 0);
  assert.equal(countCalledTicketsForQueueDay({ queueDay: {}, calledTickets: [] }), 0);
  const value = { queueDay: {id: "today"}, current: {id: "old"}, calledTickets: [
    {id: "a", currentQueueDayId: "today"}, {id: "b", currentQueueDayId: "today"},
    {id: "old", currentQueueDayId: "yesterday"}, {id: "legacy", currentQueueDayId: null}
  ] };
  assert.equal(countCalledTicketsForQueueDay(value), 2);
});
