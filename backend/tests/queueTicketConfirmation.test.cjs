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
