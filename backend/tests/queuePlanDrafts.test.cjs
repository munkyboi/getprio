const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const drafts = require("../src/repositories/queuePlanDrafts");

test("draft validation accepts incomplete lines but rejects ambiguity and injected identity", () => {
  assert.deepEqual(
    drafts.validateDraft({
      lines: [
        {
          lineId: "one",
          serviceId: null,
          quantity: null,
          durationMinutes: null,
        },
      ],
    }).lines.length,
    1,
  );
  for (const body of [
    { customer: { userId: "1" } },
    { userId: "1" },
    { expectedTicketRevision: null },
    { lines: [{ lineId: "one", quantity: 1.5 }] },
    { lines: [{ lineId: "one", quantity: 101 }] },
    { lines: [{ lineId: "one", durationMinutes: 0 }] },
    { lines: [{ lineId: "one" }, { lineId: "one" }] },
    { lines: [{ lineId: "one", serviceId: "9223372036854775808" }] },
  ])
    assert.throws(() => drafts.validateDraft(body), { code: "INVALID_PLAN" });
});

test(
  "draft persistence, receipts, revisions and isolation in PostgreSQL",
  { skip: !process.env.RESOURCE_LEDGER_TEST_DATABASE_URL },
  async (t) => {
    const url = new URL(process.env.RESOURCE_LEDGER_TEST_DATABASE_URL);
    assert.equal(url.hostname, "127.0.0.1");
    assert.ok(["/getprio_test", "/getprio_ledger_test"].includes(url.pathname));
    const schema = `draft_${randomUUID().replaceAll("-", "")}`;
    const { Pool } = require("pg");
    const pool = new Pool({
      connectionString: url.href,
      options: `-c search_path=${schema}`,
    });
    const scope = {
      tenantId: "1",
      locationId: "10",
      actorUserId: "1",
      actorRole: "admin",
    };
    async function transaction(operation) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          "SELECT id FROM store_locations WHERE id=10 FOR UPDATE",
        );
        const result = await operation(client);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }
    let created;
    try {
      await pool.query(`CREATE SCHEMA ${schema};
      CREATE TABLE users(id BIGINT PRIMARY KEY);
      CREATE TABLE store_locations(id BIGINT,tenant_id BIGINT,UNIQUE(id,tenant_id));
      CREATE TABLE tickets(id BIGINT,tenant_id BIGINT,location_id BIGINT,status TEXT,service_started_at TIMESTAMPTZ,service_ended_at TIMESTAMPTZ,UNIQUE(id,tenant_id,location_id));
      CREATE TABLE queue_plan_versions(draft_id UUID,tenant_id BIGINT,location_id BIGINT);
      CREATE TABLE allowance_audit(ticket_id BIGINT);
      CREATE TABLE resource_allocations(ticket_id BIGINT);
      INSERT INTO users VALUES(1),(2);
      INSERT INTO store_locations VALUES(10,1),(11,1),(12,2);`);
      await pool.query(
        fs.readFileSync(
          path.join(
            __dirname,
            "../../database/migrations/20261017_add_queue_plan_drafts.sql",
          ),
          "utf8",
        ),
      );
      await pool.query(
        fs.readFileSync(
          path.join(
            __dirname,
            "../../database/migrations/20261017_queue_plan_catalog_revision.sql",
          ),
          "utf8",
        ),
      );
      await pool.query(
        fs.readFileSync(
          path.join(
            __dirname,
            "../../database/migrations/20261017_queue_plan_draft_audit.sql",
          ),
          "utf8",
        ),
      );
      await pool.query(fs.readFileSync(path.join(__dirname,'../../database/migrations/20261017_queue_selection_drafts.sql'),'utf8'));
      await pool.query(fs.readFileSync(path.join(__dirname,'../../database/migrations/20261017_queue_selection_input_version.sql'),'utf8'));
      const body = {
        customer: { name: "Local customer" },
        lines: [
          {
            lineId: "court",
            serviceId: "1",
            quantity: 3,
            durationMinutes: 180,
          },
        ],
      };
      const create = { action: "create", operationKey: "create-one", body };
      await t.test(
        "save and reload without issued ticket, usage or allocations",
        async () => {
          created = await transaction((client) =>
            drafts.command(client, scope, create),
          );
          const read = drafts.dto(
            await drafts.find(pool, scope, created.plan.id),
          );
          assert.deepEqual(
            JSON.parse(JSON.stringify(read)),
            JSON.parse(JSON.stringify(created.plan)),
          );
          assert.equal(read.ticketId, null);
          assert.deepEqual(read.allowedActions, ["edit", "delete"]);
          for (const table of [
            "tickets",
            "allowance_audit",
            "resource_allocations",
          ]) {
            assert.equal(
              (await pool.query(`SELECT count(*)::int AS count FROM ${table}`))
                .rows[0].count,
              0,
            );
          }
        },
      );
      await t.test(
        "same-key replay returns original result without duplicate audit",
        async () => {
          const replay = await transaction((client) =>
            drafts.command(client, scope, create),
          );
          assert.deepEqual(
            JSON.parse(JSON.stringify(replay)),
            JSON.parse(JSON.stringify(created)),
          );
          assert.equal(
            (
              await pool.query(
                "SELECT count(*)::int AS count FROM queue_plan_events",
              )
            ).rows[0].count,
            1,
          );
          await assert.rejects(
            transaction((client) =>
              drafts.command(client, scope, {
                ...create,
                body: { ...body, notes: "different" },
              }),
            ),
            { code: "IDEMPOTENCY_CONFLICT" },
          );
        },
      );
      await t.test(
        "scope mismatch cannot read another branch or tenant",
        async () => {
          await assert.rejects(
            drafts.find(pool, { ...scope, locationId: "11" }, created.plan.id),
            { statusCode: 404 },
          );
          await assert.rejects(
            drafts.find(pool, { ...scope, tenantId: "2" }, created.plan.id),
            { statusCode: 404 },
          );
        },
      );
      await t.test(
        "concurrent editors produce exactly one revision winner",
        async () => {
          const edit = (key) =>
            transaction((client) =>
              drafts.command(client, scope, {
                action: "update",
                draftId: created.plan.id,
                operationKey: key,
                body: { ...body, expectedPlanRevision: "1", notes: key },
              }),
            );
          const results = await Promise.allSettled([
            edit("editor-one"),
            edit("editor-two"),
          ]);
          assert.equal(
            results.filter((value) => value.status === "fulfilled").length,
            1,
          );
          assert.equal(
            results.find((value) => value.status === "rejected").reason.code,
            "STALE_REVISION",
          );
          assert.equal(
            (await drafts.find(pool, scope, created.plan.id)).revision,
            "2",
          );
          assert.equal(
            (
              await pool.query(
                "SELECT count(*)::int AS count FROM queue_plan_events",
              )
            ).rows[0].count,
            2,
          );
        },
      );
      await t.test(
        "event failure rolls back draft and receipt together",
        async () => {
          await pool.query(
            `ALTER TABLE queue_plan_events ADD CONSTRAINT reject_test_event CHECK(event_type<>'draft_create') NOT VALID`,
          );
          await assert.rejects(
            transaction((client) =>
              drafts.command(client, scope, {
                ...create,
                operationKey: "rollback",
              }),
            ),
          );
          assert.equal(
            (
              await pool.query(
                "SELECT count(*)::int AS count FROM queue_plan_drafts",
              )
            ).rows[0].count,
            1,
          );
          assert.equal(
            (
              await pool.query(
                "SELECT count(*)::int AS count FROM queue_plan_command_receipts WHERE operation_key='rollback'",
              )
            ).rows[0].count,
            0,
          );
          await pool.query(
            "ALTER TABLE queue_plan_events DROP CONSTRAINT reject_test_event",
          );
        },
      );
      await t.test(
        "notes-only patch preserves omitted customer and lines with audit evidence",
        async () => {
          const before = await drafts.find(pool, scope, created.plan.id);
          const saved = await transaction((client) =>
            drafts.command(client, scope, {
              action: "update",
              draftId: created.plan.id,
              operationKey: "notes-only",
              body: { expectedPlanRevision: "2", notes: "Only notes changed" },
            }),
          );
          assert.deepEqual(saved.plan.lines, before.lines);
          assert.deepEqual(saved.plan.customer, before.customer);
          const event = (
            await pool.query(
              "SELECT actor_role,old_snapshot,snapshot FROM queue_plan_events WHERE event_type='draft_update' ORDER BY id DESC LIMIT 1",
            )
          ).rows[0];
          assert.equal(event.actor_role, "admin");
          assert.equal(event.old_snapshot.planRevision, "2");
          assert.equal(event.snapshot.planRevision, "3");
        },
      );
      await t.test(
        "draft list pages without dropping entries or crossing scope",
        async () => {
          for (let index = 0; index < 52; index++)
            await transaction((client) =>
              drafts.command(client, scope, {
                ...create,
                operationKey: `page-${index}`,
              }),
            );
          const first = await drafts.list(pool, scope);
          assert.equal(first.plans.length, 50);
          assert.ok(first.nextCursor);
          const second = await drafts.list(pool, scope, first.nextCursor);
          assert.equal(second.plans.length, 3);
          assert.equal(second.nextCursor, null);
          assert.equal(
            new Set([...first.plans, ...second.plans].map((plan) => plan.id))
              .size,
            53,
          );
          await assert.rejects(
            drafts.list(pool, { ...scope, locationId: "11" }, first.nextCursor),
            { statusCode: 400 },
          );
        },
      );
      await t.test("delete tombstones retain history and exact replay without resurrection",async()=>{
        const command={...create,operationKey:'delete-fixture-create'};
        const saved=await transaction(c=>drafts.command(c,scope,command));
        const del={draftId:saved.plan.id,operationKey:'delete-one',body:{expectedPlanRevision:saved.plan.planRevision}};
        await assert.rejects(transaction(c=>drafts.remove(c,{...scope,locationId:'11'},del)),{statusCode:404});
        await assert.rejects(transaction(c=>drafts.remove(c,scope,{...del,body:{expectedPlanRevision:'999'}})),{code:'STALE_REVISION'});
        const outcomes=await Promise.all([transaction(c=>drafts.remove(c,scope,del)),transaction(c=>drafts.remove(c,scope,del))]);
        assert.deepEqual(outcomes[0].deletedDraft,{id:saved.plan.id,planRevision:'2',state:'discarded'});assert.equal(outcomes[1].replayed,true);
        await assert.rejects(transaction(c=>drafts.remove(c,scope,{...del,operationKey:'delete-new-key'})),{code:'DRAFT_DELETED',statusCode:410});
        await assert.rejects(transaction(c=>drafts.remove(c,scope,{...del,body:{expectedPlanRevision:'2'}})),{code:'IDEMPOTENCY_CONFLICT'});
        await assert.rejects(drafts.find(pool,scope,saved.plan.id),{code:'DRAFT_DELETED'});
        await assert.rejects(transaction(c=>drafts.command(c,scope,command)),{code:'DRAFT_DELETED'});
        await assert.rejects(transaction(c=>drafts.command(c,scope,{action:'update',draftId:saved.plan.id,operationKey:'deleted-update',body:{expectedPlanRevision:'2',notes:'cannot revive'}})),{code:'DRAFT_DELETED'});
        const row=(await pool.query('SELECT state,customer,lines FROM queue_plan_drafts WHERE id=$1',[saved.plan.id])).rows[0];assert.equal(row.state,'discarded');assert.deepEqual(row.customer,body.customer);assert.deepEqual(row.lines,body.lines);
        const event=(await pool.query("SELECT old_snapshot,snapshot,actor_role FROM queue_plan_events WHERE draft_id=$1 AND event_type='draft_delete'",[saved.plan.id])).rows[0];assert.equal(event.actor_role,'admin');assert.equal(event.old_snapshot.state,'draft');assert.equal(event.snapshot.state,'discarded');assert.deepEqual(event.snapshot.customer,body.customer);
        assert.equal((await drafts.list(pool,scope)).plans.some(p=>p.id===saved.plan.id),false);
      });
      await t.test("Delete versus save has one revision winner and cannot resurrect a tombstone",async()=>{
        for(const deleteFirst of [true,false]){
          const saved=await transaction(c=>drafts.command(c,scope,{...create,operationKey:randomUUID()}));
          const remove=()=>transaction(c=>drafts.remove(c,scope,{draftId:saved.plan.id,operationKey:randomUUID(),body:{expectedPlanRevision:'1'}}));
          const update=()=>transaction(c=>drafts.command(c,scope,{action:'update',draftId:saved.plan.id,operationKey:randomUUID(),body:{expectedPlanRevision:'1',notes:'Concurrent save'}}));
          const result=await Promise.allSettled(deleteFirst?[remove(),update()]:[update(),remove()]);assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
          const row=(await pool.query('SELECT revision::text,state FROM queue_plan_drafts WHERE id=$1',[saved.plan.id])).rows[0];assert.equal(row.revision,'2');assert.ok(['draft','discarded'].includes(row.state));
        }
      });
      await t.test("linked drafts fail closed and failed deletion rolls all changes back",async()=>{
        const saved=await transaction(c=>drafts.command(c,scope,{...create,operationKey:'linked-create'}));
        const del={draftId:saved.plan.id,operationKey:'linked-delete',body:{expectedPlanRevision:'1'}};
        await pool.query('INSERT INTO queue_plan_versions VALUES($1,1,10)',[saved.plan.id]);
        await assert.rejects(transaction(c=>drafts.remove(c,scope,del)),{code:'PLAN_LOCKED'});
        await pool.query('DELETE FROM queue_plan_versions WHERE draft_id=$1',[saved.plan.id]);
        await assert.rejects(transaction(async c=>{await drafts.remove(c,scope,del);throw new Error('rollback proof');}),/rollback proof/);
        assert.equal((await drafts.find(pool,scope,saved.plan.id)).state,'draft');
        assert.equal((await pool.query("SELECT count(*)::int n FROM queue_plan_events WHERE draft_id=$1 AND event_type='draft_delete'",[saved.plan.id])).rows[0].n,0);
        assert.equal((await pool.query("SELECT count(*)::int n FROM queue_plan_command_receipts WHERE operation_key='linked-delete'")).rows[0].n,0);
        for(const table of ['tickets','allowance_audit','resource_allocations'])assert.equal((await pool.query('SELECT count(*)::int n FROM '+table)).rows[0].n,0);
      });
    } finally {
      await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await pool.end();
    }
  },
);
