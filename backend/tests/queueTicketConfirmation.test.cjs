const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("called ticket confirmation validates identity without serving and gates service completion", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/services/queueService.js"), "utf8");
  const transition = source.match(/async function updateCurrentTicketStatus[\s\S]*?return \{ ticket, snapshot \};\n\}/)?.[0] || "";
  const confirmation = source.match(/async function confirmCurrentTicket[\s\S]*?\n\}\n\nasync function cancelTicket/)?.[0] || "";

  assert.match(confirmation, /currentTicket\.lookupCode/);
  assert.match(confirmation, /confirmCurrentCalledTicket/);
  assert.match(confirmation, /"ticket_confirmed"/);
  assert.match(confirmation, /notifyCustomerQueueUpdate/);
  assert.match(confirmation, /action: "confirmed"/);
  assert.doesNotMatch(confirmation, /updateCurrentCalledTicketStatus/);
  assert.doesNotMatch(confirmation, /notifyJourneyLifecycle|notifyCalled/);
  assert.match(transition, /status === "served" && !currentTicket\.customerConfirmedAt/);
  assert.match(transition, /Confirm the called ticket before serving this customer\./);
});

test("customer confirmation persistence is present in bootstrap, migration, and schema verification", () => {
  const init = fs.readFileSync(path.resolve(__dirname, "../../database/init.sql"), "utf8");
  const migration = fs.readFileSync(
    path.resolve(__dirname, "../../database/migrations/20260809_04_add_queue_ticket_customer_confirmation.sql"),
    "utf8"
  );
  const verify = fs.readFileSync(path.resolve(__dirname, "../../scripts/db-verify-schema.sh"), "utf8");

  assert.match(init, /customer_confirmed_at TIMESTAMPTZ/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS customer_confirmed_at TIMESTAMPTZ/);
  assert.match(verify, /tickets\.customer_confirmed_at/);
});

for (const joinChannel of ["vendor", "online", "qr", undefined]) {
  for (const confirmed of [false, true]) {
    test(`${joinChannel || "legacy"} called ticket ${confirmed ? "with" : "without"} confirmation has the correct serving gate`, async () => {
      require("tsx/cjs");
      const servicePath = path.resolve(__dirname, "../src/services/queueService.js");
      const localRequire = require("node:module").createRequire(servicePath);
      const current = { _id: "7", tenantId: "1", locationId: "2", status: "called", joinChannel, customerConfirmedAt: confirmed ? new Date() : null };
      const events = [];
      const writes = [];
      const mocks = {
        "../config/db": { withTransaction: async (run) => run({}) },
        "../repositories/queueDayClosures": { findActiveClosure: async () => null },
        "../repositories/tickets": {
          findCurrentCalledTicket: async () => current,
          updateCurrentCalledTicketStatus: async (_tenantId, status) => { writes.push(status); return { ...current, status }; }
        },
        "../repositories/bookings": { updateBookingByQueueTicketId: async () => {} },
        "../repositories/queueEvents": { createQueueEvent: async (event) => events.push(event.eventType) },
        "./queueSnapshotHelpers": { resolveLocation: async () => ({ _id: "2" }), buildQueueSnapshot: async () => ({ current: null }) },
        "./queueAutomationHelpers": { maybeAutoResumeQueueDay: async () => {}, maybeNotifyUpcomingTickets: async () => {} },
        "./queueEvents": { publish: () => {} },
        "./notificationService": { notifyJourneyLifecycle: async () => {} },
        "./pushNotificationService": { notifyCustomerQueueUpdate: async () => {} }
      };
      const module = { exports: {} };
      require("node:vm").runInNewContext(fs.readFileSync(servicePath, "utf8"), {
        module, require: (name) => mocks[name] || localRequire(name), console
      });
      const serving = module.exports.updateCurrentTicketStatus({ _id: "1", slug: "clinic" }, "served");
      if (confirmed || joinChannel === "vendor") {
        const result = await serving;
        assert.equal(result.ticket.status, "served");
        assert.equal(result.ticket.customerConfirmedAt, current.customerConfirmedAt);
        assert.deepEqual(writes, ["served"]);
        assert.deepEqual(events, ["ticket_served"]);
      } else {
        await assert.rejects(serving, { statusCode: 409, message: "Confirm the called ticket before serving this customer." });
        assert.deepEqual(writes, []);
        assert.deepEqual(events, []);
      }
    });
  }
}
