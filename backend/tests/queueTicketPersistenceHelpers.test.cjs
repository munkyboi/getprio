const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createTicketRecord,
  reserveNextSequence
} = require("../src/services/queueTicketPersistenceHelpers");

test("reserveNextSequence returns the next counter value", async () => {
  const client = {
    async query(sql, params) {
      assert.match(sql, /INSERT INTO counters/);
      assert.deepEqual(params, [1, 2, "20260630"]);
      return { rows: [{ value: 7 }] };
    }
  };

  await assert.equal(await reserveNextSequence(client, 1, 2, "20260630"), 7);
});

test("createTicketRecord retries sequence collisions and releases savepoints", async () => {
  const savepointOps = [];
  let createCalls = 0;

  const ticketRepository = {
    async createTicket(payload) {
      createCalls += 1;
      if (createCalls === 1) {
        const error = new Error("duplicate");
        error.code = "23505";
        error.constraint = "tickets_tenant_location_date_sequence_key";
        throw error;
      }

      return { _id: 9, ...payload };
    }
  };

  const client = {
    async query(sql) {
      savepointOps.push(sql.trim());
      return { rows: [{ value: 11 }] };
    }
  };

  const result = await createTicketRecord(
    client,
    { tenantId: 1, locationId: 2, dateKey: "20260630", sequence: 3 },
    async () => 11,
    {
      ticketRepository,
      buildLookupCode: () => "ABC12345"
    }
  );

  assert.equal(result._id, 9);
  assert.equal(createCalls, 2);
  assert.ok(savepointOps.some((sql) => sql.startsWith("SAVEPOINT ticket_insert_attempt_0")));
  assert.ok(savepointOps.some((sql) => sql.startsWith("ROLLBACK TO SAVEPOINT ticket_insert_attempt_0")));
  assert.ok(savepointOps.some((sql) => sql.startsWith("SAVEPOINT ticket_insert_attempt_1")));
  assert.ok(savepointOps.some((sql) => sql.startsWith("RELEASE SAVEPOINT ticket_insert_attempt_1")));
});

test("createTicketRecord fails after exhausting retries", async () => {
  const ticketRepository = {
    async createTicket() {
      const error = new Error("duplicate");
      error.code = "23505";
      error.constraint = "tickets_tenant_location_date_sequence_key";
      throw error;
    }
  };

  const client = {
    async query() {
      return { rows: [{ value: 1 }] };
    }
  };

  await assert.rejects(
    () =>
      createTicketRecord(
        client,
        { tenantId: 1, locationId: 2, dateKey: "20260630" },
        async () => 1,
        {
          ticketRepository,
          buildLookupCode: () => "ABC12345"
        }
      ),
    (error) => error.statusCode === 500
  );
});
