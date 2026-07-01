const ticketRepository = require("../repositories/tickets");
const { buildLookupCode } = require("./queueHelpers");

async function reserveNextSequence(client, tenantId, locationId, dateKey) {
  try {
    const result = await client.query(
      `
        INSERT INTO counters (tenant_id, location_id, key, date_key, value)
        VALUES ($1, $2, 'ticket', $3, 1)
        ON CONFLICT (tenant_id, location_id, key, date_key)
        DO UPDATE SET value = counters.value + 1
        RETURNING value
      `,
      [Number(tenantId), Number(locationId), dateKey]
    );

    return result.rows[0].value;
  } catch (error) {
    console.error("reserveNextSequence failed", {
      tenantId,
      locationId,
      dateKey,
      code: error.code,
      constraint: error.constraint,
      detail: error.detail,
      table: error.table,
      column: error.column,
      message: error.message
    });
    throw error;
  }
}

async function createTicketRecord(client, data, reserveSequence, deps = {}) {
  const ticketRepo = deps.ticketRepository || ticketRepository;
  const lookupCodeFactory = deps.buildLookupCode || buildLookupCode;
  let nextTicketData = { ...data };
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const savepointName = `ticket_insert_attempt_${attempt}`;
    try {
      await client.query(`SAVEPOINT ${savepointName}`);
      return await ticketRepo.createTicket(
        {
          ...nextTicketData,
          lookupCode: lookupCodeFactory()
        },
        { client }
      );
    } catch (error) {
      console.error("createTicketRecord attempt failed", {
        attempt,
        code: error.code,
        constraint: error.constraint,
        detail: error.detail,
        table: error.table,
        column: error.column,
        message: error.message
      });
      await client.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
      if (error.code === "23505" && error.constraint === "tickets_tenant_location_date_sequence_key") {
        nextTicketData.sequence = await reserveSequence(
          client,
          nextTicketData.tenantId,
          nextTicketData.locationId,
          nextTicketData.dateKey
        );
      }
      if (error.code !== "23505") {
        throw error;
      }
    } finally {
      try {
        await client.query(`RELEASE SAVEPOINT ${savepointName}`);
      } catch {
        // Savepoint may already be gone after a successful return or rollback path.
      }
    }
  }

  const error = new Error("Unable to generate a unique ticket code.");
  error.statusCode = 500;
  throw error;
}

module.exports = {
  createTicketRecord,
  reserveNextSequence
};
