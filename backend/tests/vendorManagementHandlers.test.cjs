const test = require("node:test");
const assert = require("node:assert/strict");

const {
  handleUpdateSettings,
  handleListHistory,
  handleInviteStaff,
  handleCreateCounter,
  handleUpdateCounter,
  handleDeleteCounter
} = require("../src/routes/vendorManagementHandlers");

test('counter handlers preserve normalized payload scope status and write response', async () => {
  const calls = [];
  const context = {
    req: { user: { _id: '9007199254740993' }, params: { tenantSlug: 'vendor', counterSlug: 'old' },
      query: { location: 'main' }, body: { name: 'Court One!', assignedUserIds: ['9007199254740995'] } },
    getAuthorizedTenant: async () => ({ _id: '9007199254740993' }),
    assertTenantPermission: (_user, tenant, permission) => { assert.equal(tenant, '9007199254740993'); assert.equal(permission, 'tenant.counter.manage'); },
    getLocationForTenant: async (_tenant, slug) => { assert.equal(slug, 'main'); return { _id: '9007199254740995' }; },
    counterService: { mutate: async input => { calls.push(input); return { _id: '7', assignedUserIds: [] }; } }
  };
  const response = () => ({ code: 200, body: undefined, status(code) { this.code = code; return this; }, json(body) { this.body = body; }, send() {} });
  let res = response(); await handleCreateCounter({ ...context, res });
  assert.equal(res.code, 201); assert.deepEqual(res.body, { counter: { _id: '7', assignedUserIds: [] } });
  assert.equal(calls[0].data.slug, 'court-one!'); assert.equal(calls[0].data.isActive, undefined);
  assert.equal(calls[0].actorUserId, '9007199254740993');
  assert.equal(calls[0].locationId, '9007199254740995');
  res = response(); await handleUpdateCounter({ ...context, res });
  assert.equal(res.code, 200); assert.equal(calls[1].data.slug, 'court-one');
  assert.equal(calls[1].data.isActive, undefined); assert.equal(calls[1].counterSlug, 'old');
  res = response(); await handleDeleteCounter({ ...context, res });
  assert.equal(res.code, 204); assert.equal(res.body, undefined); assert.equal(calls[2].action, 'delete');
});

test('counter handler propagates transaction quota and not-found failures without returning success', async () => {
  const context = { req: { user: { _id: '1' }, params: { tenantSlug: 'vendor', counterSlug: 'missing' }, query: {}, body: { name: 'Court' } },
    res: { json() { assert.fail('unexpected success'); }, status() { assert.fail('unexpected success'); } },
    getAuthorizedTenant: async () => ({ _id: '1' }), assertTenantPermission: () => {}, getLocationForTenant: async () => ({ _id: '10' }) };
  for (const handler of [handleCreateCounter, handleUpdateCounter, handleDeleteCounter]) {
    const error = Object.assign(new Error('blocked'), { statusCode: handler === handleDeleteCounter ? 404 : 403 });
    await assert.rejects(handler({ ...context, counterService: { mutate: async () => { throw error; } } }), error);
  }
});

test('counter update and delete preserve normalization of decoded noncanonical lookup URLs', async () => {
  for (const handler of [handleUpdateCounter, handleDeleteCounter]) {
    let called = false;
    await handler({ req: { user: { _id: '1' }, params: { tenantSlug: 'vendor', counterSlug: 'Court   One' }, query: {}, body: { name: 'Court Two' } },
      res: { json(body) { assert.equal(body.counter._id, '7'); }, status(code) { assert.equal(code, 204); return this; }, send() {} },
      getAuthorizedTenant: async () => ({ _id: '1' }), assertTenantPermission: () => {}, getLocationForTenant: async () => ({ _id: '10' }),
      counterService: { mutate: async input => { called = true; assert.equal(input.counterSlug, 'court-one'); return { _id: '7' }; } } });
    assert.equal(called, true);
  }
});

test("vendor management handler updates settings through injected repositories", async () => {
  const response = { body: null, json(payload) { this.body = payload; } };
  await handleUpdateSettings({
    req: { user: { _id: 4, name: "Owner", displayName: "" }, params: { tenantSlug: "tenant" }, query: { location: "main" }, body: { name: "Updated Tenant", publicProfileDisplayName: "Public Tenant", publicProfileDescription: "<p>A <strong>public</strong> description.</p><script>alert(1)</script>", publicProfileCategory: "Sports", ownerName: "Updated Owner", ownerDisplayName: "Owner Display", queuePrefix: "ab" } },
    res: response,
    settingsService: { update: async ({ prepare, requiresContactPermission }) => {
      assert.equal(requiresContactPermission, true);
      const changes = await prepare({ _id: 1, queuePrefix: "OLD" }, { name: "Owner", displayName: "" }, null);
      return { tenant: { _id: 1, name: "Tenant", slug: "tenant", ...changes.tenantChanges }, owner: { _id: 4, ...changes.ownerChanges } };
    } },
    categoryRepository: { resolve: async () => ({ id: "1", name: "Sports" }) },
    getAuthorizedTenant: async () => ({ _id: 1, queuePrefix: "OLD" }),
    assertTenantPermission: () => {},
    getLocationForTenant: async () => ({ _id: 2 }),
    tenantRepository: { updateTenant: async (_id, data) => ({ _id: 1, name: "Tenant", slug: "tenant", ...data }) },
    userRepository: { updateUser: async (_id, data) => ({ _id: 4, ...data }) },
    getQueueSnapshot: async () => ({ ok: true })
  });
  assert.equal(response.body.tenant.queuePrefix, "AB");
  assert.equal(response.body.tenant.publicProfileCategory, "Sports");
  assert.equal(response.body.tenant.publicProfileDisplayName, "Public Tenant");
  assert.equal(response.body.tenant.publicProfileDescription, "<p>A <strong>public</strong> description.</p>");
  assert.equal(response.body.owner.displayName, "Owner Display");
});

test("vendor business description rejects more than 1000 visible characters", async () => {
  await assert.rejects(
    () => handleUpdateSettings({
      req: { user: { _id: 4, name: "Owner", displayName: "" }, params: { tenantSlug: "tenant" }, query: { location: "main" }, body: { publicProfileDescription: `<p>${"x".repeat(1001)}</p>` } },
      res: { json() {} },
      getAuthorizedTenant: async () => ({ _id: 1, publicProfileDescription: "" }),
      assertTenantPermission: () => {},
      getLocationForTenant: async () => ({ _id: 2 }),
      tenantRepository: { updateTenant: async () => ({ _id: 1 }) },
      userRepository: { updateUser: async () => ({ _id: 4 }) },
      getQueueSnapshot: async () => ({ ok: true })
    }),
    /1000 characters or fewer/
  );
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
    },
    staffInvitationResourceService: { invite: async input => { assert.equal(input.userId, 9); assert.equal(input.email, "staff@example.com"); } }
  });
  assert.equal(inviteResponse.statusCode, 201);
});

test("settings normalize current locked fallbacks and keep category reads on the transaction client", async () => {
  const client = { query() {} };
  const current = { _id: "1", name: "Fresh Tenant", publicProfileDescription: "Fresh description", queuePrefix: "NEW",
    averageServiceMinutes: 11, notificationThreshold: 4, businessCategoryId: "9", publicProfileCategory: "Fresh category",
    autoPauseEnabled: true, autoResumeEnabled: true };
  let snapshotTaken = false;
  let transactionFinished = false;
  let categoryInput;
  const result = { body: null, json(value) { this.body = value; } };
  await handleUpdateSettings({
    req: { user: { _id: "4", name: "Stale Owner", displayName: "Stale" }, params: { tenantSlug: "tenant" },
      query: { location: "main" }, body: { averageServiceMinutes: "15", queuePrefix: "abcde", notificationThreshold: 0 } },
    res: result, getAuthorizedTenant: async () => ({ _id: "1", name: "Stale Tenant" }), assertTenantPermission: () => {},
    getLocationForTenant: async () => ({ _id: "2" }),
    categoryRepository: { resolve: async (input, supplied) => { assert.equal(supplied, client); categoryInput = input; return null; } },
    settingsService: { update: async (context) => {
      assert.equal(context.requiresContactPermission, false);
      assert.equal(context.locationSlug, "main");
      const { tenantChanges, ownerChanges } = await context.prepare(current, { name: "Fresh Owner", displayName: "Fresh" }, client);
      assert.equal(tenantChanges.name, "Fresh Tenant"); assert.equal(tenantChanges.publicProfileDescription, "Fresh description");
      assert.equal(tenantChanges.notificationThreshold, 4); // Existing falsy-number fallback.
      assert.equal(tenantChanges.autoPauseEnabled, false); // Existing omitted-boolean semantics.
      assert.equal(tenantChanges.autoResumeEnabled, false);
      assert.equal(tenantChanges.autoPauseThreshold, null); assert.equal(tenantChanges.autoResumeVacancyPercent, null);
      assert.equal(ownerChanges.name, "Fresh Owner"); assert.equal(ownerChanges.displayName, "Fresh");
      transactionFinished = true;
      return { tenant: { ...current, ...tenantChanges }, owner: { _id: "4", ...ownerChanges } };
    } },
    getQueueSnapshot: async () => { assert.equal(transactionFinished, true); snapshotTaken = true; return { waiting: [] }; }
  });
  assert.equal(categoryInput.currentId, "9"); assert.equal(categoryInput.currentLabel, "Fresh category");
  assert.equal(result.body.tenant.queuePrefix, "ABCD"); assert.equal(result.body.tenant.averageServiceMinutes, 15);
  assert.equal(result.body.owner.name, "Fresh Owner"); assert.equal(snapshotTaken, true);
});
