const crypto = require("node:crypto");
const db = require("../config/db");
const env = require("../config/env");

const ACTIVE = new Set(["waiting", "called", "skipped", "pending_carry_over"]);
const TOKEN_PATTERN = /^QB[A-F0-9]{32}$/;

function fail(message, statusCode, code) {
  throw Object.assign(new Error(message), { statusCode, code });
}

function eligible(ticket) {
  return ACTIVE.has(ticket.status) && !ticket.customer_confirmed_at && !ticket.service_started_at &&
    !ticket.service_ended_at && !ticket.service_outcome && !ticket.terminal_at;
}

function tokenFor(ticket, nonce) {
  if (!env.jwtSecret || env.jwtSecret === "change-me") fail("Ticket barcode signing is unavailable.", 503, "TICKET_BARCODE_UNAVAILABLE");
  const scope = ["getprio-ticket-barcode-v1", ticket.id, ticket.tenant_id, ticket.location_id, ticket.user_id, nonce];
  return `QB${crypto.createHmac("sha256", env.jwtSecret).update(JSON.stringify(scope)).digest("hex").slice(0, 32).toUpperCase()}`;
}

async function issueForOwner(ticketId, userId) {
  const validId = value => /^[1-9]\d{0,18}$/.test(String(value)) && BigInt(value) <= 9223372036854775807n;
  if (!validId(ticketId) || !validId(userId)) fail("Ticket not found.", 404, "TICKET_NOT_FOUND");
  const initial = (await db.pool.query("SELECT tenant_id,location_id FROM tickets WHERE id=$1 AND user_id=$2 AND developer_project_id IS NULL", [ticketId, userId])).rows[0];
  if (!initial) fail("Ticket not found.", 404, "TICKET_NOT_FOUND");
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const location = await client.query("SELECT id FROM store_locations WHERE id=$1 AND tenant_id=$2 FOR NO KEY UPDATE", [initial.location_id, initial.tenant_id]);
    if (!location.rows[0]) fail("Ticket not found.", 404, "TICKET_NOT_FOUND");
    const ticket = (await client.query("SELECT * FROM tickets WHERE id=$1 AND tenant_id=$2 AND location_id=$3 FOR UPDATE", [ticketId, initial.tenant_id, initial.location_id])).rows[0];
    const user = (await client.query("SELECT id FROM users WHERE id=$1 AND deletion_requested_at IS NULL AND platform_access_suspended_at IS NULL", [userId])).rows[0];
    if (!ticket || String(ticket.user_id) !== String(userId) || ticket.developer_project_id || !user) fail("Ticket not found.", 404, "TICKET_NOT_FOUND");
    if (!eligible(ticket)) fail("This ticket no longer has an active arrival barcode.", 409, "TICKET_BARCODE_UNAVAILABLE");
    const state = (await client.query("SELECT *,expires_at>clock_timestamp() AS valid FROM queue_ticket_barcodes WHERE ticket_id=$1 FOR UPDATE", [ticketId])).rows[0];
    const barcode = state?.valid ? state : (await client.query(`WITH stamp AS (SELECT clock_timestamp() AS now)
      INSERT INTO queue_ticket_barcodes(ticket_id,nonce,issued_at,expires_at)
      SELECT $1,$2,now,now+INTERVAL '120 seconds' FROM stamp
      ON CONFLICT(ticket_id) DO UPDATE SET nonce=EXCLUDED.nonce,issued_at=EXCLUDED.issued_at,expires_at=EXCLUDED.expires_at
      RETURNING *`, [ticketId, crypto.randomBytes(16).toString("hex").toUpperCase()])).rows[0];
    const barcodeToken = tokenFor(ticket, barcode.nonce);
    const serverNow = (await client.query("SELECT clock_timestamp() AS now")).rows[0].now;
    const completion = await client.query("COMMIT");
    if (completion.command !== "COMMIT") fail("Ticket barcode transaction did not commit.", 409, "TICKET_BARCODE_UNAVAILABLE");
    return { barcodeToken, issuedAt: barcode.issued_at.toISOString(), expiresAt: barcode.expires_at.toISOString(), serverNow: serverNow.toISOString() };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// Called only after the vendor's location and current called ticket are locked.
async function assertConfirmationCredential(client, ticket, { barcodeToken, lookupCode }) {
  const state = (await client.query("SELECT *,expires_at>clock_timestamp() AS valid FROM queue_ticket_barcodes WHERE ticket_id=$1 FOR UPDATE", [ticket._id])).rows[0];
  if (barcodeToken) {
    const row = { id: ticket._id, tenant_id: ticket.tenantId, location_id: ticket.locationId, user_id: ticket.userId,
      status: ticket.status, customer_confirmed_at: ticket.customerConfirmedAt, service_started_at: ticket.serviceStartedAt,
      service_ended_at: ticket.serviceEndedAt, service_outcome: ticket.serviceOutcome, terminal_at: ticket.terminalAt };
    if (!TOKEN_PATTERN.test(barcodeToken) || !state?.valid || !eligible(row)) fail("This barcode expired or is no longer available. Ask the customer to refresh it.", 409, "TICKET_BARCODE_INVALID");
    const expected = tokenFor(row, state.nonce);
    if (!crypto.timingSafeEqual(Buffer.from(barcodeToken), Buffer.from(expected))) fail("Scanned ticket does not match the current called ticket.", 409, "TICKET_BARCODE_INVALID");
    return;
  }
  if (state) fail("This ticket requires its current rotating barcode.", 409, "TICKET_BARCODE_REQUIRED");
  if (String(ticket.lookupCode || "").toUpperCase() !== lookupCode) fail("Scanned ticket does not match the current called ticket.", 409, "TICKET_CODE_MISMATCH");
}

module.exports = { issueForOwner, assertConfirmationCredential };
