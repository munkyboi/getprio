const test = require("node:test");
const assert = require("node:assert/strict");

const {
  handleUpdateSettings,
  handleListHistory,
  handleInviteStaff
} = require("../src/routes/vendorManagementHandlers");

test("vendor management handler updates settings through injected repositories", async () => {
  const response = { body: null, json(payload) { this.body = payload; } };
  await handleUpdateSettings({
    req: { user: { _id: 4, name: "Owner", displayName: "" }, params: { tenantSlug: "tenant" }, query: { location: "main" }, body: { name: "Updated Tenant", publicProfileCategory: "Sports", ownerName: "Updated Owner", ownerDisplayName: "Owner Display", queuePrefix: "ab" } },
    res: response,
    getAuthorizedTenant: async () => ({ _id: 1, queuePrefix: "OLD" }),
    assertTenantPermission: () => {},
    getLocationForTenant: async () => ({ _id: 2 }),
    tenantRepository: { updateTenant: async (_id, data) => ({ _id: 1, name: "Tenant", slug: "tenant", ...data }) },
    userRepository: { updateUser: async (_id, data) => ({ _id: 4, ...data }) },
    getQueueSnapshot: async () => ({ ok: true })
  });
  assert.equal(response.body.tenant.queuePrefix, "AB");
  assert.equal(response.body.tenant.publicProfileCategory, "Sports");
  assert.equal(response.body.owner.displayName, "Owner Display");
});

test("vendor management handler lists history and invites staff", async () => {
  const historyResponse = { body: null, json(payload) { this.body = payload; } };
  await handleListHistory({
    req: { user: {}, params: { tenantSlug: "tenant" }, query: { location: "main", limit: "5" } },
    res: historyResponse,
    getAuthorizedTenant: async () => ({ _id: 1 }),
    assertTenantPermission: () => {},
    getLocationForTenant: async () => ({ _id: 2 }),
    billingService: { getTenantEntitlements: async () => ({ historyDays: 30, historyLabel: "30 days" }) },
    ticketRepository: { listHistoryTickets: async () => [{ _id: 7, ticketNumber: "A001", customerName: "Jane", status: "served", updatedAt: "2026-07-01" }] }
  });
  assert.equal(historyResponse.body.tickets[0].ticketNumber, "A001");

  const inviteResponse = { statusCode: null, body: null, status(code) { this.statusCode = code; return this; }, json(payload) { this.body = payload; } };
  await handleInviteStaff({
    req: { user: { tenantMemberships: [{ tenantId: 1, role: "owner", isActive: true }] }, params: { tenantSlug: "tenant" }, body: { email: "staff@example.com", role: "staff" } },
    res: inviteResponse,
    getAuthorizedTenant: async () => ({ _id: 1 }),
    assertTenantPermission: () => {},
    billingService: { getTenantEntitlements: async () => ({ staffSeats: 3 }) },
    userRepository: {
      listUsersByTenantId: async () => [{ tenantMemberships: [{ tenantId: 1, role: "owner", isActive: true }] }],
      findUserByEmail: async () => ({ _id: 9 }),
      addTenantMembership: async () => {}
    }
  });
  assert.equal(inviteResponse.statusCode, 201);
});
