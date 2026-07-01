const test = require("node:test");
const assert = require("node:assert/strict");

const { handleCreateTicket } = require("../src/routes/vendorQueueHandlers");

test("vendor queue handler rejects missing customer name", async () => {
  await assert.rejects(
    () =>
      handleCreateTicket({
        req: { user: {}, params: { tenantSlug: "tenant" }, query: {}, body: {} },
        res: {},
        getAuthorizedTenant: async () => ({ _id: 1 }),
        assertTenantPermission: () => {},
        getLocationForTenant: async () => ({ _id: 2 }),
        createTicket: async () => ({})
      }),
    (error) => error.statusCode === 400
  );
});

test("vendor queue handler creates tickets through the injected workflow", async () => {
  let createCalls = 0;
  const response = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
    }
  };

  await handleCreateTicket({
    req: {
      user: { _id: 9 },
      params: { tenantSlug: "tenant" },
      query: { location: "main" },
      body: {
        customerName: "Jane",
        customerEmail: "jane@example.com",
        notifyByEmail: true
      }
    },
    res: response,
    getAuthorizedTenant: async () => ({ _id: 1 }),
    assertTenantPermission: () => {},
    getLocationForTenant: async () => ({ _id: 2 }),
    createTicket: async () => {
      createCalls += 1;
      return {
        ticket: { _id: 7, ticketNumber: "Q001", lookupCode: "ABC123", status: "waiting" },
        snapshot: { ok: true }
      };
    }
  });

  assert.equal(createCalls, 1);
  assert.equal(response.statusCode, 201);
  assert.equal(response.body.ticket.lookupCode, "ABC123");
});
