const test = require("node:test");
const assert = require("node:assert/strict");

const queueEvents = require("../src/services/queueEvents");

test("queue event subscribers receive only their location updates", () => {
  const received = [];
  const unsubscribeMain = queueEvents.subscribe(
    "vendor-one",
    (payload) => received.push({ subscriber: "main", payload }),
    { locationId: "11" }
  );
  const unsubscribeAnnex = queueEvents.subscribe(
    "vendor-one",
    (payload) => received.push({ subscriber: "annex", payload }),
    { locationId: "12" }
  );

  queueEvents.publish("vendor-one", { state: "warning" }, { locationId: "11" });
  unsubscribeMain();
  unsubscribeAnnex();

  assert.deepEqual(received, [{ subscriber: "main", payload: { state: "warning" } }]);
});

test("tenant-wide queue events continue to reach every location subscriber", () => {
  const received = [];
  const unsubscribeMain = queueEvents.subscribe(
    "vendor-two",
    () => received.push("main"),
    { locationId: "21" }
  );
  const unsubscribeAnnex = queueEvents.subscribe(
    "vendor-two",
    () => received.push("annex"),
    { locationId: "22" }
  );

  queueEvents.publish("vendor-two", null);
  unsubscribeMain();
  unsubscribeAnnex();

  assert.deepEqual(received, ["main", "annex"]);
});
