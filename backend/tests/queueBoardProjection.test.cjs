const test = require("node:test");
const assert = require("node:assert/strict");
const { boardSnapshot, trackingSnapshot, queueMetadata } = require("../src/services/queueBoardProjection");
const snapshot = { tenant: { name: "Vendor", monitorUrl: "private-board-url" }, location: { name: "Location", monitorUrl: "private-board-url" },
  stats: { waitingCount: 3, currentTicketNumber: "P001" }, current: { id: "1", ticketNumber: "P001", customerName: "Other Customer", lookupCode: "SECRET" },
  calledTickets: [{ id: "1", ticketNumber: "P001", customerPhone: "private", serviceCounterId: "2" }],
  nextUp: [{ id: "3", ticketNumber: "P002", customerDisplayName: "Private", customerEmail: "private", lookupCode: "OTHER" }],
  counterDispatch: [{ counterName: "Desk", serviceCounterId: "2", currentTicketId: "1", canCallNext: false }],
  unfinishedServiceTiming: [{ secret: "staff only" }], futureSensitiveField: "must not leak",
  focusTicket: { id: "7", customerName: "Ticket Owner", lookupCode: "OWN" }, history: [{ lookupCode: "past" }] };
test("display projection allows multiple counters without identities or internal dispatch data", () => {
  const value = boardSnapshot(snapshot);
  assert.equal(value.calledTickets[0].serviceCounterId, "2");
  assert.equal(value.counterDispatch[0].counterName, "Desk");
  assert.equal(value.nextUp[0].ticketNumber, "P002");
  assert.doesNotMatch(JSON.stringify(value), /SECRET|OTHER|Private|Other Customer|staff only|must not leak|private-board-url|canCallNext|currentTicketId/);
});
test("customer tracking and discovery cannot expose full board lists", () => {
  const own = trackingSnapshot(snapshot);
  assert.equal(own.focusTicket.lookupCode, "OWN");
  assert.deepEqual(own.nextUp, []); assert.deepEqual(own.calledTickets, []); assert.equal(own.current, null);
  assert.equal(queueMetadata(snapshot).focusTicket, null);
  assert.doesNotMatch(JSON.stringify(own), /SECRET|OTHER|Other Customer|P001/);
});
