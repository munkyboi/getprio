const test = require("node:test");
const assert = require("node:assert/strict");
const { handleInviteStaff } = require("../src/routes/vendorManagementHandlers");
const { requireWithMocks } = require("./testSupport.cjs");
const { createStaffWriterFixture } = require("./helpers/staffWriterFixture.cjs");
const { createStaffAccessEmailService } = require("../src/services/staffAccessEmailService");

function context({ members = [], targetId = "2", requesterRole = "owner", requestedRole = "staff", seats = 5 } = {}) {
  const client = {};
  const writes = [];
  let serialized = false;
  const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  return { writes, res, input: {
    req: { user: { _id: "1", tenantMemberships: [{ tenantId: "10", role: requesterRole, isActive: true }] },
      params: { tenantSlug: "studio" }, body: { email: " Staff@Example.test ", role: requestedRole } },
    res, getAuthorizedTenant: async () => ({ _id: "10" }),
    assertTenantPermission: (_actor, tenantId, permission) => {
      assert.equal(tenantId, "10"); assert.equal(permission, "tenant.staff.invite");
    },
    billingService: { getTenantEntitlements: async () => ({ staffSeats: seats }) },
    userRepository: {
      findUserByEmail: async email => {
        assert.equal(email, "staff@example.test");
        // Deliberately stale preflight membership data must not determine absence.
        return { _id: targetId, tenantMemberships: [] };
      },
      listUsersByTenantId: async (tenantId, options) => {
        assert.equal(serialized, true); assert.equal(options.client, client);
        assert.equal(tenantId, "10"); return members;
      },
      addTenantMembership: async (...args) => { assert.equal(args[3].client, client); writes.push(args); }
    },
    staffAccessEmailService: { change: async (_input, mutate) => {
      serialized = true; await mutate({ client }); writes.push("notice");
    } }
  } };
}

test("staff invitation rejects every existing vendor membership before overwriting access", async t => {
  for (const role of ["owner", "admin", "staff"]) {
    for (const isActive of [true, false]) {
      await t.test(`${role}, active=${isActive}`, async () => {
        const c = context({ requesterRole: "admin", members: [{ _id: "2",
          tenantMemberships: [{ tenantId: "10", role, isActive }] }] });
        await assert.rejects(handleInviteStaff(c.input), error => error.statusCode === 409
          && error.message.includes("staff list"));
        assert.deepEqual(c.writes, []); assert.equal(c.res.code, undefined);
      });
    }
  }
});

test("an owner cannot downgrade their own existing membership through invitation", async () => {
  const c = context({ targetId: "1", members: [{ _id: "1", tenantMemberships: [{ tenantId: "10", role: "owner" }] }] });
  await assert.rejects(handleInviteStaff(c.input), error => error.statusCode === 409);
  assert.deepEqual(c.writes, []);
});

test("duplicate membership is a conflict even when the existing seats are full", async () => {
  const c = context({ seats: 1, members: [{ _id: "2", tenantMemberships: [{ tenantId: "10", role: "staff" }] }] });
  await assert.rejects(handleInviteStaff(c.input), error => error.statusCode === 409);
  assert.deepEqual(c.writes, []);
});

test("a global account without this vendor membership remains eligible with distinct exact IDs", async () => {
  const c = context({ targetId: "9007199254740993", requesterRole: "admin",
    members: [{ _id: "9007199254740992", tenantMemberships: [{ tenantId: "10", role: "staff" }] }] });
  await handleInviteStaff(c.input);
  assert.equal(c.res.code, 201);
  assert.deepEqual(c.res.body, { userId: "9007199254740993" });
  assert.deepEqual(c.writes[0].slice(0, 3), ["9007199254740993", "10", "staff"]);
  assert.equal(c.writes[1], "notice");
});

test("new-member invitation still enforces seats and administrator role restrictions", async () => {
  for (const options of [{ seats: 0 }, { requesterRole: "admin", requestedRole: "owner" },
    { requesterRole: "admin", requestedRole: "admin" }]) {
    const c = context(options);
    await assert.rejects(handleInviteStaff(c.input), error => error.statusCode === 403);
    assert.deepEqual(c.writes, []);
  }
});

const databaseUrl = process.env.RESOURCE_LEDGER_TEST_DATABASE_URL;
test("existing membership conflicts preserve access and notices under PostgreSQL serialization", { skip: !databaseUrl }, async t => {
  const fixture = createStaffWriterFixture(databaseUrl, "invitation");
  const { pool } = fixture;
  const users = requireWithMocks("../src/repositories/users", { "../config/db": { pool } });
  const emails = createStaffAccessEmailService({ userRepository: users, database: {
    withTransaction: async callback => {
      const client = await fixture.transaction();
      try { const result = await callback(client); await client.query("COMMIT"); return result; }
      catch (error) { await client.query("ROLLBACK"); throw error; }
      finally { client.release(); }
    }
  } });
  const invite = async (email, requesterRole = "owner") => {
    const c = context({ requesterRole });
    c.input.req.user.tenantMemberships[0].tenantId = "1";
    c.input.req.body.email = email;
    c.input.getAuthorizedTenant = async () => ({ _id: "1", name: "Studio" });
    // These regressions exercise the handler's current role rules, not real HTTP authorization.
    c.input.assertTenantPermission = () => {};
    c.input.userRepository = users;
    c.input.staffAccessEmailService = emails;
    await handleInviteStaff(c.input);
    return c.res;
  };
  try {
    await fixture.initialize();
    await pool.query(`ALTER TABLE tenant_memberships ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY;
      ALTER TABLE tenant_memberships ADD UNIQUE(user_id,tenant_id)`);
    await t.test("administrator invitation cannot overwrite an existing owner or reactivate them", async () => {
      for (const active of [true, false]) {
        await fixture.reset();
        await pool.query("UPDATE tenant_memberships SET role='admin' WHERE id=1");
        await pool.query("UPDATE tenant_memberships SET role='owner',is_active=$1 WHERE id=2", [active]);
        const before = (await pool.query("SELECT role,is_active FROM tenant_memberships WHERE id=2")).rows;
        await assert.rejects(invite("staff@example.test", "admin"), error => error.statusCode === 409);
        assert.deepEqual((await pool.query("SELECT role,is_active FROM tenant_memberships WHERE id=2")).rows, before);
        assert.equal((await pool.query("SELECT 1 FROM staff_access_email_outbox")).rowCount, 0);
        assert.ok((await fixture.revisions()).every(row => row.revision === "1"));
      }
    });
    await t.test("concurrent additions create one membership and notice; subsequent attempts conflict", async () => {
      await fixture.reset();
      await pool.query("INSERT INTO tenant_memberships(id,user_id,tenant_id,role,is_active) VALUES(4,3,2,'admin',FALSE)");
      await pool.query("SELECT setval(pg_get_serial_sequence('tenant_memberships','id'),4)");
      const results = await Promise.allSettled([invite("other@example.test"), invite("other@example.test"), invite("other@example.test")]);
      assert.equal(results.filter(result => result.status === "fulfilled" && result.value.code === 201).length, 1);
      assert.equal(results.filter(result => result.status === "rejected" && result.reason.statusCode === 409).length, 2);
      assert.equal((await pool.query("SELECT 1 FROM tenant_memberships WHERE user_id=3 AND tenant_id=1")).rowCount, 1);
      assert.equal((await pool.query("SELECT 1 FROM staff_access_email_outbox")).rowCount, 1);
      assert.deepEqual((await pool.query("SELECT role,is_active FROM tenant_memberships WHERE user_id=3 AND tenant_id=2")).rows,
        [{ role: "admin", is_active: false }]);
      assert.ok((await fixture.revisions()).every(row => row.revision === "1"));
    });
  } finally { await fixture.dispose(); }
});
