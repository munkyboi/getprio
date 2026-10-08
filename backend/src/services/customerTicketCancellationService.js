const resourceLedger = require("../repositories/resourceLedger");
const tickets = require("../repositories/tickets");
const access = require("./customerTicketAccess");

function assertOwnership(customer, ticket) {
  if (!access.userOwnsTicket(customer.user, ticket) && !access.requestMatchesTicket(customer.contact, ticket)) {
    throw Object.assign(new Error("We could not verify that this ticket belongs to you."), { statusCode: 403 });
  }
}

async function withCustomerTicketCancellation({ pool, tenant, location, lookupCode, actorUserId, contact }, callback) {
  let ticket;
  let customer;
  return resourceLedger.withCustomerTicketCancellationTransaction({
    pool, tenantId: String(tenant._id), locationId: String(location._id), lookupCode,
    actorUserId: actorUserId == null ? null : String(actorUserId),
    authorize: async (client, scope) => {
      let user = null;
      if (scope.actorUserId) {
        const row = (await client.query(`SELECT id::text,email,phone FROM users WHERE id=$1
          AND deletion_requested_at IS NULL AND platform_access_suspended_at IS NULL`, [scope.actorUserId])).rows[0];
        if (!row) return false;
        user = { _id: row.id, email: row.email, phone: row.phone };
      }
      ticket = await tickets.findTicketByScopedLookupCodeForUpdate(scope.tenantId, scope.locationId, lookupCode, { client });
      if (!ticket) throw Object.assign(new Error("Waiting ticket not found."), { statusCode: 404 });
      customer = { user, contact: { customerEmail: contact?.customerEmail, customerPhone: contact?.customerPhone } };
      assertOwnership(customer, ticket);
      if (!["waiting", "pending_carry_over"].includes(ticket.status)) {
        throw Object.assign(new Error("Only waiting or carried-over tickets can be cancelled."), { statusCode: 409 });
      }
      return true;
    }
  }, (client, ledger) => callback(client, ledger, ticket, customer));
}

module.exports = { withCustomerTicketCancellation, assertOwnership };
