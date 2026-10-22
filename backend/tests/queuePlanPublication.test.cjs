const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { loadModuleWithMocks } = require("./helpers/loadModuleWithMocks.cjs");
const drafts = require("../src/repositories/queuePlanDrafts");
const {
  captureLines,
  readCatalog,
} = require("../src/services/queuePlanCatalog");
const ledger = require("../src/repositories/resourceLedger");
const realReadActor =
  require("../src/services/vendorQueueTransactionService").readAuthorizedVendorQueueActor;

test(
  "queue plan publication transaction and replay",
  { skip: !process.env.RESOURCE_LEDGER_TEST_DATABASE_URL },
  async (t) => {
    const url = new URL(process.env.RESOURCE_LEDGER_TEST_DATABASE_URL);
    assert.equal(url.hostname, "127.0.0.1");
    assert.equal(url.pathname, "/getprio_test");
    const schema = "publish_" + randomUUID().replaceAll("-", "");
    const { Pool } = require("pg");
    const pool = new Pool({
      connectionString: url.href,
      options: `-c search_path=${schema}`,
      application_name: schema,
    });
    const scope = {
      tenantId: "1",
      locationId: "10",
      actorUserId: "1",
      actorRole: "admin",
    };
    const context = {
      tenant: { _id: "1" },
      location: { _id: "10" },
      actorUserId: "1",
    };
    const realAllowance = loadModuleWithMocks(
      require.resolve("../src/services/allowanceService"),
      {
        "../config/releaseControls": { allowanceQueueTickets: true },
        "./entitlementResolver": {
          resolveTenantPolicy: async () => ({
            lifecycle: { state: "active", subscriptionId: "1" },
            authority: { served: "new" },
            period: {
              start: "2026-10-01T00:00:00Z",
              end: "2026-11-01T00:00:00Z",
            },
            allowances: { queueTickets: { limit: 100 } },
          }),
        },
      },
    );
    let failEvent = false;
    async function transaction(options, fn) {
      assert.equal(options.permission, "tenant.queue.operate");
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          "SELECT id FROM store_locations WHERE id=10 FOR UPDATE",
        );
        const result = await fn(
          client,
          {},
          { tenantMemberships: [{ role: "admin" }] },
        );
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }
    const service = loadModuleWithMocks(
      require.resolve("../src/services/queuePlanPublishService"),
      {
        "../config/db": { pool },
        "./vendorQueueTransactionService": {
          withVendorQueueTransaction: transaction,
        },
        "./platformMaintenanceService": { assertNewIntake: async () => {} },
        "./entitlementAdmissionService": { admit: async () => {} },
        "./storeHoursService": {
          assertLocationOpenForCustomerJoin: async () => {},
        },
        "./queueService": {
          assertQueueIntakeOpen: async () => ({ businessDate: "2026-10-17" }),
          assertWaitingIntakeCapacityAvailable: async () => {},
          createTicketForTenantInTransaction: async (client, input) => {
            assert.equal(input.joinChannel, "vendor");
            assert.equal(input.queueDateKey, "20261017");
            const row = (
              await client.query(
                `INSERT INTO tickets(tenant_id,location_id,ticket_number,status) VALUES(1,10,'Q-test','waiting') RETURNING id::text`,
              )
            ).rows[0];
            await realAllowance.consumeAllowance(
              {
                tenantId: "1",
                resourceKey: "queueTickets",
                operationKey: `queue-ticket:${row.id}:created`,
                subjectType: "queue_ticket",
                subjectId: row.id,
                units: 1,
              },
              { client },
            );
            await client.query(
              "INSERT INTO allowance_audit(ticket_id,units) VALUES($1,1)",
              [row.id],
            );
            return { _id: row.id };
          },
          recordCreatedTicketEvent: async () => {
            if (failEvent) throw new Error("event failure");
          },
        },
      },
    );
    let catalogRevision;
    async function create(key, quantity = 2) {
      return transaction({ permission: "tenant.queue.operate" }, (client) =>
        drafts.command(client, scope, {
          action: "create",
          operationKey: key,
          body: {
            catalogRevision,
            customer: { name: "Local test" },
            lines: [
              { lineId: "a", serviceId: "1", quantity, durationMinutes: 180 },
              {
                lineId: "b",
                serviceId: "2",
                quantity: 1,
                durationMinutes: 180,
              },
            ],
          },
        }),
      );
    }
    try {
      await pool.query(`CREATE SCHEMA ${schema};CREATE TABLE users(id BIGINT PRIMARY KEY,name TEXT DEFAULT 'Operator',display_name TEXT,roles TEXT[] DEFAULT '{}',deletion_requested_at TIMESTAMPTZ,platform_access_suspended_at TIMESTAMPTZ);INSERT INTO users(id) VALUES(1),(2),(3);
   CREATE TABLE tenants(id BIGINT PRIMARY KEY,is_active BOOLEAN,auto_pause_enabled BOOLEAN,auto_pause_threshold INTEGER,queue_prefix TEXT);
   INSERT INTO tenants VALUES(1,TRUE,FALSE,NULL,'Q');
   CREATE TABLE store_locations(id BIGINT,tenant_id BIGINT,is_active BOOLEAN,queue_lifecycle_mode TEXT,timezone TEXT,service_timing_enabled BOOLEAN DEFAULT TRUE,UNIQUE(id,tenant_id));
   INSERT INTO store_locations(id,tenant_id,is_active,queue_lifecycle_mode,timezone) VALUES(10,1,TRUE,'enforced','Asia/Manila');
   CREATE TABLE service_counters(id BIGINT PRIMARY KEY,tenant_id BIGINT,location_id BIGINT,name TEXT,slug TEXT,is_active BOOLEAN);
   INSERT INTO service_counters VALUES(1,1,10,'Counter A','counter-a',TRUE),(2,1,10,'Counter B','counter-b',TRUE);
   CREATE TABLE tenant_memberships(id BIGINT PRIMARY KEY,user_id BIGINT,tenant_id BIGINT,role TEXT,is_active BOOLEAN);
   INSERT INTO tenant_memberships VALUES(1,1,1,'owner',TRUE),(2,2,1,'staff',TRUE),(3,3,1,'staff',TRUE);
   CREATE TABLE tenant_membership_locations(tenant_membership_id BIGINT,location_id BIGINT);
   INSERT INTO tenant_membership_locations VALUES(2,10),(3,10);
   CREATE TABLE service_counter_assignments(counter_id BIGINT,user_id BIGINT);
   INSERT INTO service_counter_assignments VALUES(1,2),(2,3);
   CREATE TABLE tickets(id BIGSERIAL PRIMARY KEY,tenant_id BIGINT,location_id BIGINT,ticket_number TEXT,status TEXT,join_channel TEXT DEFAULT 'vendor',customer_confirmed_at TIMESTAMPTZ,service_started_at TIMESTAMPTZ,service_ended_at TIMESTAMPTZ,service_outcome TEXT,service_counter_id BIGINT,date_key TEXT DEFAULT '20261017',called_at TIMESTAMPTZ,skipped_at TIMESTAMPTZ,rejoin_deadline_at TIMESTAMPTZ,notified_called_at TIMESTAMPTZ,service_priority_band TEXT DEFAULT 'normal',sequence BIGINT DEFAULT 1,created_at TIMESTAMPTZ DEFAULT NOW(),updated_at TIMESTAMPTZ DEFAULT NOW(),UNIQUE(id,tenant_id,location_id));
   CREATE TABLE ticket_service_plans(ticket_id BIGINT PRIMARY KEY,tenant_id BIGINT,location_id BIGINT,source TEXT,execution_mode TEXT,items JSONB,created_by_user_id BIGINT,created_at TIMESTAMPTZ DEFAULT NOW());
   CREATE TABLE allowance_audit(ticket_id BIGINT,units INTEGER);
   CREATE TABLE usage_accounts(id BIGSERIAL PRIMARY KEY,tenant_id BIGINT,resource_key TEXT,UNIQUE(tenant_id,resource_key));
   CREATE TABLE subscription_allowance_periods(id BIGSERIAL PRIMARY KEY,subscription_id BIGINT,period_start TIMESTAMPTZ,period_end TIMESTAMPTZ,UNIQUE(subscription_id,period_start));
   CREATE TABLE allowance_operations(id BIGSERIAL PRIMARY KEY,usage_account_id BIGINT,allowance_period_id BIGINT,operation_key TEXT,operation_type TEXT,signed_units INTEGER,
    subject_type TEXT,subject_id TEXT,actor_user_id BIGINT,reason TEXT,metadata JSONB,UNIQUE(usage_account_id,operation_key));
   CREATE TABLE allowance_allocations(id BIGSERIAL PRIMARY KEY,operation_id BIGINT,source_type TEXT,allowance_period_id BIGINT,credit_lot_id BIGINT,units INTEGER);
   CREATE TABLE allowance_reservations(id BIGSERIAL PRIMARY KEY,usage_account_id BIGINT,allowance_period_id BIGINT,units INTEGER,status TEXT,expires_at TIMESTAMPTZ);
   CREATE TABLE allowance_warning_claims(id BIGSERIAL PRIMARY KEY,usage_account_id BIGINT,allowance_period_id BIGINT,threshold_percent INTEGER,UNIQUE(usage_account_id,allowance_period_id,threshold_percent));
   CREATE TABLE usage_credit_lots(id BIGSERIAL PRIMARY KEY,tenant_id BIGINT,resource_key TEXT,granted_units INTEGER,revoked_units INTEGER,frozen_units INTEGER,
    source_type TEXT,status TEXT,expires_at TIMESTAMPTZ,created_at TIMESTAMPTZ);
   CREATE TABLE resource_ledger_scopes(tenant_id BIGINT,location_id BIGINT,revision BIGINT DEFAULT 1,PRIMARY KEY(tenant_id,location_id));INSERT INTO resource_ledger_scopes VALUES(1,10,1);
   CREATE TABLE vendor_services(id BIGINT,tenant_id BIGINT,name TEXT,duration_minutes INTEGER,updated_at TIMESTAMPTZ DEFAULT NOW(),price_display TEXT,is_active BOOLEAN,UNIQUE(id,tenant_id));
   INSERT INTO vendor_services(id,tenant_id,name,duration_minutes,price_display,is_active) VALUES(1,1,'Court A',180,'450',TRUE),(2,1,'Court B',180,'450',TRUE);
   CREATE TABLE location_services(service_id BIGINT,tenant_id BIGINT,location_id BIGINT,is_active BOOLEAN,UNIQUE(location_id,service_id));
   INSERT INTO location_services VALUES(1,1,10,TRUE),(2,1,10,TRUE);
   CREATE TABLE service_resource_requirements(service_id BIGINT,tenant_id BIGINT,location_id BIGINT,pool_id BIGINT,units_required INTEGER,revision INTEGER);
   INSERT INTO service_resource_requirements VALUES(1,1,10,1,1,1),(2,1,10,1,1,1);
   CREATE TABLE location_resource_pools(id BIGINT,tenant_id BIGINT,location_id BIGINT,revision INTEGER,name TEXT,capacity INTEGER,tracking_enabled BOOLEAN,UNIQUE(id,tenant_id,location_id));
   INSERT INTO location_resource_pools VALUES(1,1,10,1,'Courts',4,TRUE);`);
      // This suite owns a minimal schema; reuse the actual bootstrap hours table.
      const initSql = fs.readFileSync(path.join(__dirname, "../../database/init.sql"), "utf8");
      await pool.query("ALTER TABLE store_locations ADD UNIQUE(id)");
      await pool.query(initSql.match(/CREATE TABLE store_hours \([\s\S]*?\n\);/)[0]);
      // Ordinary lifecycle cases need a real open window; dedicated hours tests cover rejection.
      await pool.query(`INSERT INTO store_hours(location_id,weekday,opens_at,closes_at,is_closed)
        SELECT 10,day,(clock_timestamp() AT TIME ZONE 'Asia/Manila' - interval '1 hour')::time,
          (clock_timestamp() AT TIME ZONE 'Asia/Manila' - interval '1 hour')::time,FALSE FROM generate_series(0,6) day`);
      for (const filename of [
        "20261017_add_queue_plan_drafts.sql",
        "20261017_queue_plan_catalog_revision.sql",
        "20261017_queue_plan_draft_audit.sql",
        "20261017_queue_selection_drafts.sql",
        "20261017_queue_selection_input_version.sql",
        "20261017_queue_plan_publication.sql",
      ])
        await pool.query(
          fs.readFileSync(
            path.join(__dirname, "../../database/migrations", filename),
            "utf8",
          ),
        );
      await pool.query(`CREATE TABLE resource_ledger_reservations(id BIGSERIAL PRIMARY KEY,tenant_id BIGINT,location_id BIGINT,ticket_id BIGINT,
    pool_id BIGINT,pool_revision INTEGER,requirement_revision INTEGER,units INTEGER,starts_at TIMESTAMPTZ,ends_at TIMESTAMPTZ,state TEXT DEFAULT 'protected');
   CREATE UNIQUE INDEX resource_reservation_live_ticket_idx ON resource_ledger_reservations(ticket_id) WHERE state IN('protected','converted');
   CREATE TABLE resource_allocations(id BIGSERIAL PRIMARY KEY,tenant_id BIGINT,location_id BIGINT,ticket_id BIGINT UNIQUE,pool_id BIGINT,pool_revision INTEGER,
    units INTEGER,reservation_id BIGINT UNIQUE,started_at TIMESTAMPTZ,expected_end_at TIMESTAMPTZ,released_at TIMESTAMPTZ,outcome TEXT,reason TEXT);
   CREATE TABLE resource_ledger_commands(tenant_id BIGINT,location_id BIGINT,operation_key TEXT,command TEXT,payload_hash TEXT,actor_user_id BIGINT,result JSONB,
    PRIMARY KEY(tenant_id,location_id,operation_key));`);
      await pool.query(
        fs.readFileSync(
          path.join(
            __dirname,
            "../../database/migrations/20261017_queue_reservation_groups.sql",
          ),
          "utf8",
        ),
      );
      await pool.query(
        fs.readFileSync(
          path.join(
            __dirname,
            "../../database/migrations/20261017_queue_station_workflows.sql",
          ),
          "utf8",
        ),
      );
      await pool.query(
        fs.readFileSync(
          path.join(
            __dirname,
            "../../database/migrations/20261017_resource_members_and_queue_policies.sql",
          ),
          "utf8",
        ),
      );
      await pool.query(
        fs.readFileSync(
          path.join(
            __dirname,
            "../../database/migrations/20261017_selection_child_execution.sql",
          ),
          "utf8",
        ),
      );
      await pool.query(
        fs.readFileSync(
          path.join(
            __dirname,
            "../../database/migrations/20261017_queue_service_configuration_v4.sql",
          ),
          "utf8",
        ),
      );
      await pool.query(fs.readFileSync(path.join(__dirname,"../../database/migrations/20261017_resource_pool_lifecycle.sql"),"utf8"));
      await pool.query(fs.readFileSync(path.join(__dirname,"../../database/migrations/20261017_named_resource_archival.sql"),"utf8"));
      await pool.query(fs.readFileSync(path.join(__dirname,"../../database/migrations/20261017_named_extra_members_v1.sql"),"utf8"));
      await pool.query(fs.readFileSync(path.join(__dirname,"../../database/migrations/20261017_queue_plan_skip_recall_v1.sql"),"utf8"));
      await pool.query(fs.readFileSync(path.join(__dirname,"../../database/migrations/20261020_add_resource_display_order.sql"),"utf8"));
      catalogRevision = (await readCatalog(pool, scope)).catalogRevision;
      await t.test(
        "parallel snapshot treats quantity separately from duration and rejects excess or multi-pool demand",
        async () => {
          const items = await captureLines(pool, scope, [
            { lineId: "a", serviceId: "1", quantity: 3, durationMinutes: 180 },
          ]);
          assert.equal(items[0].resource.totalUnits, 3);
          assert.equal(items[0].durationMinutes, 180);
          await assert.rejects(
            captureLines(pool, scope, [
              { lineId: "a", serviceId: "1", quantity: 3 },
              { lineId: "b", serviceId: "2", quantity: 2 },
            ]),
            { code: "INVALID_PLAN" },
          );
          await assert.rejects(
            captureLines(pool, scope, [
              { lineId: "a", serviceId: "1", quantity: 1, durationMinutes: 60 },
            ]),
            { code: "INVALID_PLAN" },
          );
        },
      );
      await t.test(
        "publish once under concurrent retries, one allowance unit, immutable lines and current stage",
        async () => {
          const draft = await create("draft-one");
          const command = {
            draftId: draft.plan.id,
            operationKey: "publish-one",
            body: {
              expectedPlanRevision: "1",
              expectedCatalogRevision: catalogRevision,
            },
          };
          const results = await Promise.all([
            service.publish(context, command),
            service.publish(context, command),
          ]);
          assert.deepEqual(
            JSON.parse(JSON.stringify(results[0])),
            JSON.parse(JSON.stringify(results[1])),
          );
          assert.equal(results[0].plan.state, "waiting");
          assert.equal(results[0].plan.lines.length, 2);
          assert.equal(results[0].plan.currentStage.state, "waiting");
          assert.equal(
            (
              await pool.query(
                "SELECT count(*)::int AS count,sum(units)::int AS units FROM allowance_audit",
              )
            ).rows[0].units,
            1,
          );
          assert.deepEqual(
            (
              await pool.query(
                "SELECT count(*)::int AS count,sum(signed_units)::int AS units FROM allowance_operations",
              )
            ).rows[0],
            { count: 1, units: 1 },
          );
          assert.equal(
            (
              await pool.query(
                "SELECT count(*)::int AS count FROM queue_plan_versions",
              )
            ).rows[0].count,
            1,
          );
          assert.equal(
            (
              await pool.query(
                "SELECT count(*)::int AS count FROM queue_stage_attempts",
              )
            ).rows[0].count,
            1,
          );
          assert.equal(
            (
              await pool.query(
                "SELECT count(*)::int AS count FROM queue_plan_notification_outbox",
              )
            ).rows[0].count,
            1,
          );
          await assert.rejects(
            service.publish(context, {
              ...command,
              operationKey: "different-key",
            }),
            { code: "PLAN_LOCKED" },
          );
          await assert.rejects(
            service.publish(context, {
              ...command,
              body: { expectedPlanRevision: "2" },
            }),
            { code: "IDEMPOTENCY_CONFLICT" },
          );
        },
      );
      await t.test(
        "event failure rolls publication, issuance and usage back together",
        async () => {
          const draft = await create("draft-rollback");
          failEvent = true;
          await assert.rejects(
            service.publish(context, {
              draftId: draft.plan.id,
              operationKey: "publish-rollback",
              body: {
                expectedPlanRevision: "1",
                expectedCatalogRevision: catalogRevision,
              },
            }),
            /event failure/u,
          );
          failEvent = false;
          assert.equal(
            (await drafts.find(pool, scope, draft.plan.id)).state,
            "draft",
          );
          assert.equal(
            (await pool.query("SELECT count(*)::int AS count FROM tickets"))
              .rows[0].count,
            1,
          );
          assert.equal(
            (
              await pool.query(
                "SELECT sum(units)::int AS units FROM allowance_audit",
              )
            ).rows[0].units,
            1,
          );
          assert.deepEqual(
            (
              await pool.query(
                "SELECT count(*)::int AS count,sum(signed_units)::int AS units FROM allowance_operations",
              )
            ).rows[0],
            { count: 1, units: 1 },
          );
          assert.equal(
            (
              await pool.query(
                "SELECT count(*)::int AS count FROM queue_plan_command_receipts WHERE operation_key='publish-rollback'",
              )
            ).rows[0].count,
            0,
          );
        },
      );
      await t.test(
        "catalog writer waits for the branch reader and stale reviewed selection cannot publish",
        async () => {
          const draft = await create("catalog-review");
          let ready, release;
          const entered = new Promise((resolve) => {
            ready = resolve;
          });
          const gate = new Promise((resolve) => {
            release = resolve;
          });
          const reader = ledger.withScopeTransaction(
            { pool, ...scope, authorize: async () => true },
            async (client) => {
              assert.equal(
                (await readCatalog(client, scope)).catalogRevision,
                catalogRevision,
              );
              ready();
              await gate;
              return captureLines(
                client,
                scope,
                [
                  {
                    lineId: "a",
                    serviceId: "1",
                    quantity: 1,
                    durationMinutes: 180,
                  },
                ],
                catalogRevision,
              );
            },
          );
          await entered;
          const writer = ledger.withTenantCatalogTransaction(
            {
              pool,
              tenantId: "1",
              actorUserId: "1",
              authorize: async () => true,
            },
            (client) =>
              client.query(
                "UPDATE vendor_services SET price_display='500' WHERE id=1",
              ),
          );
          let blocked = false;
          try {
            for (let attempt = 0; attempt < 100; attempt++) {
              blocked = (
                await pool.query(
                  "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock') AS blocked",
                  [schema],
                )
              ).rows[0].blocked;
              if (blocked) break;
              await new Promise((resolve) => setTimeout(resolve, 5));
            }
          } finally {
            release();
          }
          await reader;
          await writer;
          assert.equal(blocked, true);
          await assert.rejects(
            service.publish(context, {
              draftId: draft.plan.id,
              operationKey: "catalog-stale-publish",
              body: {
                expectedPlanRevision: "1",
                expectedCatalogRevision: catalogRevision,
              },
            }),
            { code: "CATALOG_ACCEPTANCE_REQUIRED" },
          );
          assert.equal(
            (await drafts.find(pool, scope, draft.plan.id)).state,
            "draft",
          );
          await ledger.withTenantCatalogTransaction(
            {
              pool,
              tenantId: "1",
              actorUserId: "1",
              authorize: async () => true,
            },
            (client) =>
              client.query(
                "UPDATE vendor_services SET price_display='450' WHERE id=1",
              ),
          );
          assert.equal(
            (await readCatalog(pool, scope)).catalogRevision,
            catalogRevision,
          );
        },
      );
      const execute = (command, payload, key) =>
        ledger.executeCommand({
          pool,
          ...scope,
          command,
          payload,
          operationKey: key,
        });
      async function call(ticketId, key) {
        return ledger.withScopeTransaction(
          { pool, ...scope, authorize: async () => true },
          async (client, capability) => {
            await client.query(
              "UPDATE tickets SET status='called' WHERE id=$1",
              [ticketId],
            );
            return capability.executeCommand({
              command: "reserveTicket",
              payload: { ticketId },
              operationKey: key,
            });
          },
        );
      }
      let firstGroup;
      await t.test(
        "multiple same-pool lines reserve 3 units for 180 minutes and replay without duplication",
        async () => {
          firstGroup = await call("1", "call-first");
          assert.ok(firstGroup.reservationGroupId);
          const reservations = (
            await pool.query(
              "SELECT units,ends_at-starts_at AS duration FROM resource_ledger_reservations ORDER BY id",
            )
          ).rows;
          assert.deepEqual(
            reservations.map((row) => row.units),
            [2, 1],
          );
          assert.ok(reservations.every((row) => row.duration.hours === 3));
          assert.deepEqual(await call("1", "call-first"), firstGroup);
          assert.equal(
            (
              await pool.query(
                "SELECT count(*)::int AS count FROM resource_ledger_reservations",
              )
            ).rows[0].count,
            2,
          );
        },
      );
      await t.test(
        "capacity failure rolls back Called status, partial protection and command receipt",
        async () => {
          const draft = await create("contender");
          const published = await service.publish(context, {
            draftId: draft.plan.id,
            operationKey: "publish-contender",
            body: {
              expectedPlanRevision: "1",
              expectedCatalogRevision: catalogRevision,
            },
          });
          const ticketId = published.plan.ticketId;
          await assert.rejects(call(ticketId, "call-contender"), {
            code: "RESOURCE_CAPACITY_UNAVAILABLE",
          });
          assert.equal(
            (
              await pool.query("SELECT status FROM tickets WHERE id=$1", [
                ticketId,
              ])
            ).rows[0].status,
            "waiting",
          );
          assert.equal(
            (
              await pool.query(
                "SELECT count(*)::int AS count FROM queue_reservation_groups",
              )
            ).rows[0].count,
            1,
          );
          assert.equal(
            (
              await pool.query(
                "SELECT count(*)::int AS count FROM resource_ledger_commands WHERE operation_key='call-contender'",
              )
            ).rows[0].count,
            0,
          );
        },
      );
      await t.test(
        "database rejects cross-ticket stages, groups and grouped members without line identity",
        async () => {
          const other = (
            await pool.query(
              "SELECT ticket_id::text,id,stage_id FROM queue_stage_attempts WHERE ticket_id<>1 LIMIT 1",
            )
          ).rows[0];
          await assert.rejects(
            pool.query(
              "UPDATE ticket_service_plans SET stage_attempt_id=$1,stage_id=$2 WHERE ticket_id=1",
              [other.id, other.stage_id],
            ),
            { code: "23503" },
          );
          await assert.rejects(
            pool.query(
              "UPDATE resource_ledger_reservations SET ticket_id=$1 WHERE group_id=$2",
              [other.ticket_id, firstGroup.reservationGroupId],
            ),
            { code: "23503" },
          );
          await assert.rejects(
            pool.query(
              "UPDATE resource_ledger_reservations SET line_id=NULL WHERE group_id=$1",
              [firstGroup.reservationGroupId],
            ),
            { code: "23514" },
          );
          await assert.rejects(
            pool.query(
              `INSERT INTO queue_allocation_groups(id,tenant_id,location_id,ticket_id,reservation_group_id,stage_attempt_id,expected_members,started_at)
    VALUES($1,1,10,$2,$3,$4,'[]',clock_timestamp())`,
              [
                randomUUID(),
                other.ticket_id,
                firstGroup.reservationGroupId,
                other.id,
              ],
            ),
            { code: "23503" },
          );
        },
      );
      await t.test(
        "Start domain rollback restores every protected member",
        async () => {
          await assert.rejects(
            ledger.withScopeTransaction(
              { pool, ...scope, authorize: async () => true },
              async (_client, capability) => {
                await capability.executeCommand({
                  command: "allocate",
                  payload: { ticketId: "1" },
                  operationKey: "rollback-start",
                });
                throw new Error("domain failure");
              },
            ),
            /domain failure/u,
          );
          assert.equal(
            (
              await pool.query(
                "SELECT count(*)::int AS count FROM resource_allocations",
              )
            ).rows[0].count,
            0,
          );
          assert.deepEqual(
            (
              await pool.query(
                "SELECT DISTINCT state FROM resource_ledger_reservations",
              )
            ).rows.map((row) => row.state),
            ["protected"],
          );
        },
      );
      await t.test(
        "expired or stale member prevents Start without partial allocation",
        async () => {
          await pool.query(
            "UPDATE queue_reservation_groups SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
            [firstGroup.reservationGroupId],
          );
          await assert.rejects(
            execute("allocate", { ticketId: "1" }, "expired-start"),
            { code: "RESERVATION_EXPIRED" },
          );
          await pool.query(
            "UPDATE queue_reservation_groups SET expires_at=clock_timestamp()+interval '5 minutes' WHERE id=$1",
            [firstGroup.reservationGroupId],
          );
          await pool.query(
            "UPDATE service_resource_requirements SET revision=2 WHERE service_id=2",
          );
          await assert.rejects(
            execute("allocate", { ticketId: "1" }, "stale-start"),
            { code: "STALE_REVISION" },
          );
          await pool.query(
            "UPDATE service_resource_requirements SET revision=1 WHERE service_id=2",
          );
          assert.equal(
            (
              await pool.query(
                "SELECT count(*)::int AS count FROM resource_allocations",
              )
            ).rows[0].count,
            0,
          );
        },
      );
      await t.test(
        "Start converts all members once and release uses recorded IDs after catalog changes",
        async () => {
          const started = await execute(
            "allocate",
            { ticketId: "1" },
            "start-first",
          );
          assert.deepEqual(
            await execute("allocate", { ticketId: "1" }, "start-first"),
            started,
          );
          assert.equal(
            (
              await pool.query(
                "SELECT sum(units)::int AS units FROM resource_allocations WHERE released_at IS NULL",
              )
            ).rows[0].units,
            3,
          );
          assert.deepEqual(
            (
              await pool.query(
                "SELECT DISTINCT state FROM resource_ledger_reservations",
              )
            ).rows.map((row) => row.state),
            ["converted"],
          );
          await pool.query(
            "UPDATE resource_allocations SET expected_end_at=started_at-interval '1 minute'",
          );
          assert.equal(
            (
              await pool.query(
                "SELECT sum(units)::int AS units FROM resource_allocations WHERE released_at IS NULL",
              )
            ).rows[0].units,
            3,
          );
          await pool.query(
            "UPDATE ticket_service_plans SET items='[]' WHERE ticket_id=1",
          );
          await execute(
            "release",
            { allocationId: started.allocationId, outcome: "completed" },
            "complete-first",
          );
          await execute(
            "release",
            { allocationId: started.allocationId, outcome: "completed" },
            "complete-again",
          );
          assert.equal(
            (
              await pool.query(
                "SELECT count(*)::int AS count FROM resource_allocations WHERE released_at IS NULL",
              )
            ).rows[0].count,
            0,
          );
          assert.equal(
            (
              await pool.query(
                "SELECT count(DISTINCT released_at)::int AS count FROM resource_allocations",
              )
            ).rows[0].count,
            1,
          );
          await assert.rejects(
            execute(
              "release",
              {
                allocationId: started.allocationId,
                outcome: "terminated",
                reason: "different outcome",
              },
              "interrupt-after-complete",
            ),
            { code: "INVALID_STATE" },
          );
        },
      );
      async function readTicket(id, { client }) {
        const row = (
          await client.query("SELECT * FROM tickets WHERE id=$1", [id])
        ).rows[0];
        return (
          row && {
            _id: String(row.id),
            tenantId: String(row.tenant_id),
            locationId: String(row.location_id),
            status: row.status,
            joinChannel: row.join_channel,
            customerConfirmedAt: row.customer_confirmed_at,
            dateKey: row.date_key || "20261017",
            serviceStartedAt: row.service_started_at,
            serviceEndedAt: row.service_ended_at,
            serviceCounterId: row.service_counter_id == null ? null : String(row.service_counter_id),
          }
        );
      }
      const parentSelectionTransitions = [];
      let recallIntakeBlocked=false,recallNoDay=false;
      const commands = loadModuleWithMocks(
        require.resolve("../src/services/queuePlanCommandService"),
        {
          "../config/db": { pool },
          "../repositories/tickets": { findTicketByIdForUpdate: readTicket },
          "./vendorQueueTransactionService": {
            readAuthorizedVendorQueueActor: realReadActor,
            withVendorQueueTransaction: async (options, fn) =>
              ledger.withScopeTransaction(
                {
                  pool,
                  ...scope,
                  locationKeyShareCompatible: options.lockTenantActivity,
                  authorize: async (client) => {
                    if (options.lockTenantActivity)
                      await client.query(
                        "SELECT id FROM tenants WHERE id=$1 FOR SHARE",
                        [scope.tenantId],
                      );
                    return true;
                  },
                },
                (client, capability) =>
                  fn(client, capability, {
                    tenantMemberships: [{ role: "admin" }],
                  }),
              ),
          },
          "./queueService": {
            assertQueueDayOpen: async () => ({ businessDate: "2026-10-17" }),
            assertQueueIntakeOpen: async () => {if(recallIntakeBlocked)throw Object.assign(new Error("Queue closed"),{code:"QUEUE_DAY_CLOSED",statusCode:409});return recallNoDay?undefined:{businessDate:"2026-10-17"};},
            assertWaitingIntakeCapacityAvailable: async () => {},
          },
          "./counterDispatchService": {
            claimNext: async (client, _scope, { serviceCounter }) => {
              await client.query(
                "UPDATE tickets SET status='called',called_at=clock_timestamp(),service_counter_id=$2 WHERE id=$1",
                [serviceCounter.targetTicketId, serviceCounter._id],
              );
              return readTicket(serviceCounter.targetTicketId, { client });
            },
          },
          "../repositories/queueEvents": {
            createQueueEvent: async (data) => data,
          },
          "./developerWebhookService": { enqueueQueueEvent: async () => {} },
          "./ticketServiceTimingService": {
            applySelectionTiming: async (
              client,
              _tenant,
              id,
              action,
              _options,
              allocationId,
            ) => {
              if (
                action === "start" &&
                (
                  await client.query(
                    "SELECT service_started_at FROM tickets WHERE id=$1",
                    [id],
                  )
                ).rows[0].service_started_at
              )
                return;
              parentSelectionTransitions.push({ id, action });
              if (action === "start")
                await client.query(
                  "UPDATE tickets SET service_started_at=(SELECT started_at FROM resource_allocations WHERE id=$2) WHERE id=$1 AND service_started_at IS NULL",
                  [id, allocationId],
                );
              else
                await client.query(
                  "UPDATE tickets SET service_ended_at=(SELECT released_at FROM resource_allocations WHERE id=$2),service_outcome='completed',status='served' WHERE id=$1",
                  [id, allocationId],
                );
            },
            applyTicketService: async (
              client,
              capability,
              _tenant,
              id,
              action,
              options,
            ) => {
              if (action === "start") {
                const allocation = await capability.executeCommand({
                  command: "allocate",
                  payload: { ticketId: id },
                  operationKey: `ticket:${id}:service:start`,
                });
                await client.query(
                  "UPDATE tickets SET service_started_at=(SELECT started_at FROM resource_allocations WHERE id=$2) WHERE id=$1",
                  [id, allocation.allocationId],
                );
              } else {
                const first = (
                  await client.query(
                    `SELECT a.id::text FROM resource_allocations a JOIN queue_allocation_groups g ON g.id=a.group_id
       JOIN ticket_service_plans p ON p.stage_attempt_id=g.stage_attempt_id AND p.ticket_id=a.ticket_id WHERE a.ticket_id=$1 ORDER BY a.id LIMIT 1`,
                    [id],
                  )
                ).rows[0];
                await capability.executeCommand({
                  command: "release",
                  payload: {
                    allocationId: first.id,
                    outcome: action === "complete" ? "completed" : "terminated",
                    ...(action === "interrupt"
                      ? { reason: options.reason }
                      : {}),
                  },
                  operationKey: `ticket:${id}:service:${action}`,
                });
                await client.query(
                  "UPDATE tickets SET service_ended_at=(SELECT released_at FROM resource_allocations WHERE id=$2),status=$3 WHERE id=$1",
                  [id, first.id, action === "complete" ? "served" : "unserved"],
                );
              }
            },
          },
        },
      );
      function guarded(plan, extra = {}) {
        return {
          expectedTicketRevision: plan.ticketRevision,
          expectedPlanRevision: plan.planRevision,
          currentStageId: plan.currentStage.id,
          expectedStageRevision: plan.currentStage.revision,
          ...extra,
        };
      }
      async function publishNew(key, quantity) {
        const d = await create(key, quantity);
        return (
          await service.publish(context, {
            draftId: d.plan.id,
            operationKey: key + "-publish",
            body: {
              expectedPlanRevision: "1",
              expectedCatalogRevision: catalogRevision,
            },
          })
        ).plan;
      }
      const invoke = (plan, action, key, extra = {}) =>
        commands.execute(context, {
          draftId: plan.id,
          action,
          operationKey: key,
          body: guarded(plan, extra),
          serviceCounter: {
            _id: plan.currentStage.serviceCounterIds?.[0] || "1",
            targetTicketId: plan.ticketId,
          },
        });
      let holder, candidate;
      await t.test(
        "command boundary enforces revisions, group identity and durable capacity wait",
        async () => {
          holder = await publishNew("command-holder", 1);
          holder = (
            await invoke(holder, "call", "command-holder-call", {
              counterSlug: "dispatch",
            })
          ).plan;
          assert.equal(holder.reservationGroups.at(-1).members.length, 2);
          const currentGroup = holder.reservationGroups.at(-1).id;
          await assert.rejects(
            invoke(
              { ...holder, ticketRevision: "0" },
              "start",
              "stale-command",
              { reservationGroupId: currentGroup },
            ),
            { code: "STALE_REVISION" },
          );
          await assert.rejects(
            invoke(holder, "start", "wrong-group", {
              reservationGroupId: randomUUID(),
            }),
            { code: "INVALID_STATE" },
          );
          await assert.rejects(
            invoke(holder, "start", "malformed-group", {
              reservationGroupId: "-".repeat(36),
            }),
            { code: "INVALID_PLAN", statusCode: 400 },
          );
          holder = (
            await invoke(holder, "start", "command-holder-start", {
              reservationGroupId: currentGroup,
            })
          ).plan;
          assert.equal(holder.state, "in_service");
          candidate = await publishNew("command-candidate", 2);
          let waitError;
          try {
            await invoke(candidate, "call", "command-capacity", {
              counterSlug: "dispatch",
            });
          } catch (error) {
            waitError = error;
          }
          assert.equal(waitError.code, "RESOURCE_CAPACITY_UNAVAILABLE");
          candidate = waitError.plan;
          assert.equal(candidate.state, "waiting");
          assert.equal(
            candidate.resourceWait.code,
            "RESOURCE_CAPACITY_UNAVAILABLE",
          );
          assert.equal(candidate.reservationGroups.length, 0);
        },
      );
      await t.test(
        "agreed reduction is explicit and a failed called replacement preserves old plan and holds",
        async () => {
          const lines = [
            { lineId: "a", serviceId: "1", quantity: 1, durationMinutes: 180 },
            { lineId: "b", serviceId: "2", quantity: 1, durationMinutes: 180 },
          ];
          const amendment = {
            lines,
            reason: "Customer agreed to use two courts.",
            expectedCatalogRevision: catalogRevision,
          };
          await assert.rejects(
            invoke(candidate, "amend", "reduction-no-consent", amendment),
            { code: "CUSTOMER_AGREEMENT_REQUIRED" },
          );
          candidate = (
            await invoke(candidate, "amend", "reduction-consent", {
              ...amendment,
              customerAgreement: { confirmed: true },
            })
          ).plan;
          assert.equal(candidate.planRevision, "2");
          assert.equal(candidate.resourceWait, null);
          candidate = (
            await invoke(candidate, "call", "reduced-call", {
              counterSlug: "dispatch",
            })
          ).plan;
          const protectedId = candidate.reservationGroups.at(-1).id;
          await assert.rejects(
            invoke(candidate, "amend", "failed-replacement", {
              ...amendment,
              lines: [{ ...lines[0], quantity: 2 }, lines[1]],
            }),
            { code: "RESOURCE_CAPACITY_UNAVAILABLE" },
          );
          const stored =
            await require("../src/repositories/queuePlanProjection").read(
              pool,
              scope,
              await drafts.find(pool, scope, candidate.id),
            );
          assert.equal(stored.planRevision, "2");
          assert.equal(
            stored.reservationGroups.filter(
              (group) => group.state === "protected",
            ).length,
            1,
          );
          assert.equal(
            stored.reservationGroups.find(
              (group) => group.state === "protected",
            ).id,
            protectedId,
          );
          assert.equal(
            stored.reservationGroups
              .find((group) => group.state === "protected")
              .members.reduce((sum, m) => sum + m.units, 0),
            2,
          );
        },
      );
      await t.test(
        "command Start/release keeps usage distinct and retry receipts stable",
        async () => {
          candidate = (
            await invoke(candidate, "start", "candidate-start", {
              reservationGroupId: candidate.reservationGroups.at(-1).id,
            })
          ).plan;
          assert.equal(
            (
              await pool.query(
                "SELECT sum(units)::int AS units FROM resource_allocations WHERE released_at IS NULL",
              )
            ).rows[0].units,
            4,
          );
          const completed = await invoke(
            holder,
            "complete",
            "holder-complete",
            { allocationGroupId: holder.allocationGroups.at(-1).id, completeAll: true },
          );
          assert.deepEqual(
            JSON.parse(
              JSON.stringify(
                await invoke(holder, "complete", "holder-complete", {
                  allocationGroupId: holder.allocationGroups.at(-1).id, completeAll: true,
                }),
              ),
            ),
            JSON.parse(JSON.stringify(completed)),
          );
          assert.equal(completed.plan.state, "served");
          const interrupted = await invoke(
            candidate,
            "interrupt",
            "candidate-interrupt",
            {
              allocationGroupId: candidate.allocationGroups.at(-1).id,
              reason: "Customer ended the session early.",
            },
          );
          assert.equal(interrupted.plan.state, "unserved");
          assert.equal(
            (
              await pool.query(
                "SELECT count(*)::int AS count FROM resource_allocations WHERE released_at IS NULL",
              )
            ).rows[0].count,
            0,
          );
          assert.deepEqual(
            (
              await pool.query(
                "SELECT DISTINCT reason FROM resource_allocations WHERE ticket_id=$1",
                [candidate.ticketId],
              )
            ).rows,
            [{ reason: "Customer ended the session early." }],
          );
        },
      );
      await t.test(
        "unstarted TTL expiry commits Waiting without touching active allocations",
        async () => {
          let plan = await publishNew("expiry-command", 1);
          plan = (
            await invoke(plan, "call", "expiry-call", {
              counterSlug: "dispatch",
            })
          ).plan;
          const group = plan.reservationGroups.at(-1).id;
          await pool.query(
            "UPDATE queue_reservation_groups SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
            [group],
          );
          let expired;
          try {
            await invoke(plan, "start", "expired-command", {
              reservationGroupId: group,
            });
          } catch (error) {
            expired = error;
          }
          assert.equal(expired.code, "RESERVATION_EXPIRED");
          assert.equal(expired.plan.state, "waiting");
          assert.equal(expired.plan.reservationGroups.at(-1).state, "expired");
          assert.equal(
            (
              await pool.query(
                "SELECT count(*)::int AS count FROM resource_allocations WHERE ticket_id=$1",
                [plan.ticketId],
              )
            ).rows[0].count,
            0,
          );
        },
      );
      await t.test(
        "real allowance ledger counts issued tickets once, never service lines, quantities, Start or release",
        async () => {
          const tickets = (
            await pool.query("SELECT count(*)::int AS count FROM tickets")
          ).rows[0].count;
          const usage = (
            await pool.query(
              "SELECT count(*)::int AS count,sum(signed_units)::int AS units FROM allowance_operations",
            )
          ).rows[0];
          assert.equal(usage.count, tickets);
          assert.equal(usage.units, tickets);
          assert.equal(
            (
              await pool.query(
                "SELECT count(*)::int AS count FROM allowance_allocations",
              )
            ).rows[0].count,
            tickets,
          );
        },
      );
      await t.test(
        "legacy mutation boundary rejects v2 plans without changing recorded groups",
        async () => {
          const boundary = require("../src/services/queuePlanBoundary");
          const before = (
            await pool.query(
              "SELECT count(*)::int AS count FROM resource_allocations",
            )
          ).rows[0].count;
          await assert.rejects(
            boundary.assertLegacyTicket(pool, {
              _id: "1",
              tenantId: "1",
              locationId: "10",
            }),
            { code: "USE_QUEUE_PLAN_COMMAND", statusCode: 409 },
          );
          assert.equal(
            (
              await pool.query(
                "SELECT count(*)::int AS count FROM resource_allocations",
              )
            ).rows[0].count,
            before,
          );
        },
      );
      const workflowService = loadModuleWithMocks(
        require.resolve("../src/services/queueWorkflowService"),
        { "../config/db": { pool } },
      );
      const stationA = randomUUID(),
        stationB = randomUUID(),
        stageA = randomUUID(),
        stageB = randomUUID();
      const configuration = {
        expectedConfigurationRevision: "1",
        mode: "multi_station",
        stations: [
          { stationId: stationA, name: "Assessment", serviceCounterIds: ["1"] },
          { stationId: stationB, name: "Treatment", serviceCounterIds: ["2"] },
        ],
        stages: [
          {
            stageId: stageA,
            stationId: stationA,
            label: "Assessment",
            serviceIds: ["1"],
          },
          {
            stageId: stageB,
            stationId: stationB,
            label: "Treatment",
            serviceIds: ["2"],
          },
        ],
      };
      await t.test(
        "workflow administration uses real current role checks, revisions, scoped stations and replay",
        async () => {
          await assert.rejects(
            workflowService.get({ ...context, actorUserId: "2" }),
            { statusCode: 403 },
          );
          assert.equal(
            (await workflowService.get(context)).workflow.configurationRevision,
            "1",
          );
          const result = await workflowService.put(
            context,
            configuration,
            "workflow-two",
          );
          assert.equal(result.workflow.configurationRevision, "2");
          assert.equal(result.workflow.mode, "multi_station");
          assert.deepEqual(
            JSON.parse(
              JSON.stringify(
                await workflowService.put(
                  context,
                  configuration,
                  "workflow-two",
                ),
              ),
            ),
            JSON.parse(JSON.stringify(result)),
          );
          await assert.rejects(
            workflowService.put(context, configuration, "workflow-stale"),
            { code: "STALE_REVISION" },
          );
          await assert.rejects(
            workflowService.put(
              context,
              {
                ...configuration,
                expectedConfigurationRevision: "2",
                stages: [
                  configuration.stages[0],
                  { ...configuration.stages[1], serviceIds: ["1", "2"] },
                ],
              },
              "workflow-ambiguous",
            ),
            { code: "INVALID_WORKFLOW" },
          );
          await assert.rejects(
            workflowService.put(
              context,
              {
                ...configuration,
                expectedConfigurationRevision: "2",
                stations: [
                  { ...configuration.stations[0], serviceCounterIds: ["99"] },
                  configuration.stations[1],
                ],
              },
              "workflow-wrong-counter",
            ),
            { code: "INVALID_WORKFLOW" },
          );
          assert.equal(
            (
              await pool.query(
                "SELECT workflow_mode FROM ticket_service_plans WHERE ticket_id=1",
              )
            ).rows[0].workflow_mode,
            "linear",
          );
          catalogRevision = (await readCatalog(pool, scope)).catalogRevision;
        },
      );
      let multi, firstParentStart;
      await t.test(
        "publication pins required stages, leaves future stages pending and protects only the current stage",
        async () => {
          multi = await publishNew("station-plan", 1);
          assert.equal(multi.workflow.mode, "multi_station");
          assert.equal(multi.workflow.configurationRevision, "2");
          assert.deepEqual(
            multi.stages.map((stage) => stage.state),
            ["waiting", "pending"],
          );
          assert.equal(multi.currentStage.stationId, stationA);
          assert.equal(multi.reservationGroups.length, 0);
          await workflowService.put(
            context,
            {
              ...configuration,
              expectedConfigurationRevision: "2",
              mode: "linear",
            },
            "workflow-three",
          );
          assert.equal(
            (await readCatalog(pool, scope)).workflow.mode,
            "linear",
          );
          await assert.rejects(
            commands.execute(context, {
              draftId: multi.id,
              action: "call",
              operationKey: "wrong-station",
              body: guarded(multi, { counterSlug: "counter-b" }),
              serviceCounter: { _id: "2", targetTicketId: multi.ticketId },
            }),
            { code: "INVALID_STATE" },
          );
          multi = (
            await invoke(multi, "call", "station-one-call", {
              counterSlug: "counter-a",
            })
          ).plan;
          assert.equal(multi.reservationGroups.length, 1);
          assert.equal(multi.reservationGroups[0].members.length, 1);
          assert.equal(multi.reservationGroups[0].members[0].lineId, "a");
          assert.equal(
            multi.stages.find((stage) => stage.id === stageB).state,
            "pending",
          );
          multi = (
            await invoke(multi, "start", "station-one-start", {
              reservationGroupId: multi.reservationGroups.at(-1).id,
            })
          ).plan;
          firstParentStart = (
            await pool.query(
              "SELECT service_started_at FROM tickets WHERE id=$1",
              [multi.ticketId],
            )
          ).rows[0].service_started_at;
          assert.equal(multi.workflow.configurationRevision, "2");
        },
      );
      await t.test(
        "pause/resume and authorized within-station operator reassignment preserve occupancy",
        async () => {
          const groupId = multi.allocationGroups.at(-1).id;
          assert.ok(
            multi.permittedReassignmentUsers.some((user) => user.id === "2"),
          );
          assert.equal(
            multi.permittedReassignmentUsers.some((user) => user.id === "3"),
            false,
          );
          await assert.rejects(
            invoke(multi, "reassign", "station-wrong-operator", {
              assignedUserId: "3",
            }),
            { code: "FORBIDDEN_SCOPE" },
          );
          multi = (
            await invoke(multi, "reassign", "station-operator", {
              assignedUserId: "2",
            })
          ).plan;
          assert.equal(multi.currentStage.assignedUserId, "2");
          multi = (
            await invoke(multi, "pause", "station-pause", {
              allocationGroupId: groupId,
            })
          ).plan;
          assert.equal(multi.currentStage.state, "paused");
          assert.equal(multi.state, "in_service");
          assert.equal(
            (
              await pool.query(
                "SELECT count(*)::int AS count FROM resource_allocations WHERE ticket_id=$1 AND released_at IS NULL",
                [multi.ticketId],
              )
            ).rows[0].count,
            1,
          );
          multi = (
            await invoke(multi, "resume", "station-resume", {
              allocationGroupId: groupId,
            })
          ).plan;
          assert.equal(multi.currentStage.state, "in_service");
          assert.equal(multi.allocationGroups.at(-1).id, groupId);
        },
      );
      await t.test('archive rejects a pool still required by a future stage of an already-started parent',async()=>{
        const lifecycle=require('../src/services/resourcePoolLifecycleService');
        const block=await lifecycle.archiveBlock(pool,scope,'1');
        assert.equal(block.code,'RESOURCE_POOL_WORKFLOW_IN_PROGRESS');
        await assert.rejects(lifecycle.execute(pool,scope,{action:'deletePool',poolId:'1',operationKey:randomUUID(),version:'test'},async()=>({}),{version:'test'}),e=>{assert.equal(e.code,'RESOURCE_POOL_REFERENCED');assert.equal(e.poolDeletion.archiveAllowed,false);assert.equal(e.poolDeletion.archiveBlock.code,'RESOURCE_POOL_WORKFLOW_IN_PROGRESS');return true;});
        await assert.rejects(lifecycle.execute(pool,scope,{action:'archivePool',poolId:'1',operationKey:randomUUID(),version:'test'},async()=>({}),{version:'test'}),{code:'RESOURCE_POOL_WORKFLOW_IN_PROGRESS'});
        assert.equal((await pool.query('SELECT archived_at FROM location_resource_pools WHERE id=1')).rows[0].archived_at,null);
      });
      await t.test(
        "intermediate Complete releases only its stage and explicit Handoff advances once",
        async () => {
          multi = (
            await invoke(multi, "complete", "station-one-complete", {
              allocationGroupId: multi.allocationGroups.at(-1).id, completeAll: true,
            })
          ).plan;
          assert.equal(multi.currentStage.state, "completed");
          assert.equal(multi.state, "in_service");
          assert.ok(multi.allowedActions.includes("handoff"));
          assert.equal(
            (
              await pool.query(
                "SELECT service_ended_at FROM tickets WHERE id=$1",
                [multi.ticketId],
              )
            ).rows[0].service_ended_at,
            null,
          );
          assert.equal(multi.reservationGroups.length, 1);
          assert.equal(
            multi.stages.find((stage) => stage.id === stageB).state,
            "pending",
          );
          const before = multi;
          const result = await invoke(before, "handoff", "station-handoff");
          assert.deepEqual(
            JSON.parse(
              JSON.stringify(
                await invoke(before, "handoff", "station-handoff"),
              ),
            ),
            JSON.parse(JSON.stringify(result)),
          );
          multi = result.plan;
          assert.equal(multi.state, "waiting");
          assert.equal(multi.currentStage.stationId, stationB);
          assert.equal(multi.currentStage.state, "waiting");
          assert.equal(multi.reservationGroups.length, 1);
        },
      );
      await t.test(
        "interruption leaves parent unresolved; explicit Retry preserves immutable prior attempt",
        async () => {
          multi = (
            await invoke(multi, "call", "station-two-call", {
              counterSlug: "counter-b",
            })
          ).plan;
          multi = (
            await invoke(multi, "start", "station-two-start", {
              reservationGroupId: multi.reservationGroups.at(-1).id,
            })
          ).plan;
          assert.deepEqual(
            (
              await pool.query(
                "SELECT service_started_at FROM tickets WHERE id=$1",
                [multi.ticketId],
              )
            ).rows[0].service_started_at,
            firstParentStart,
          );
          multi = (
            await invoke(multi, "interrupt", "station-two-interrupt", {
              allocationGroupId: multi.allocationGroups.at(-1).id,
              reason: "Explicit temporary interruption.",
            })
          ).plan;
          assert.equal(multi.currentStage.state, "interrupted");
          assert.equal(multi.state, "in_service");
          assert.equal((await require('../src/services/resourcePoolLifecycleService').archiveBlock(pool,scope,'1')).code,'RESOURCE_POOL_WORKFLOW_IN_PROGRESS');
          assert.ok(multi.allowedActions.includes("retry"));
          assert.equal(
            (
              await pool.query(
                "SELECT service_ended_at FROM tickets WHERE id=$1",
                [multi.ticketId],
              )
            ).rows[0].service_ended_at,
            null,
          );
          const oldAttempt = multi.currentStage.attemptId;
          const before = multi;
          const result = await invoke(before, "retry", "station-two-retry");
          assert.deepEqual(
            JSON.parse(
              JSON.stringify(
                await invoke(before, "retry", "station-two-retry"),
              ),
            ),
            JSON.parse(JSON.stringify(result)),
          );
          multi = result.plan;
          assert.equal(multi.state, "waiting");
          assert.equal(multi.currentStage.attempt, "2");
          assert.equal(multi.stages.length, 3);
          assert.equal(
            multi.stages.find((stage) => stage.attemptId === oldAttempt).state,
            "interrupted",
          );
          assert.equal(multi.reservationGroups.length, 2);
        },
      );
      await t.test(
        "final required stage completes parent once without duplicate ticket usage or parent start",
        async () => {
          multi = (
            await invoke(multi, "call", "station-two-retry-call", {
              counterSlug: "counter-b",
            })
          ).plan;
          multi = (
            await invoke(multi, "start", "station-two-retry-start", {
              reservationGroupId: multi.reservationGroups.at(-1).id,
            })
          ).plan;
          multi = (
            await invoke(multi, "complete", "station-two-final", {
              allocationGroupId: multi.allocationGroups.at(-1).id, completeAll: true,
            })
          ).plan;
          assert.equal(multi.state, "served");
          assert.equal(multi.currentStage.state, "completed");
          assert.equal(multi.stages.length, 3);
          assert.deepEqual(
            (
              await pool.query(
                "SELECT service_started_at FROM tickets WHERE id=$1",
                [multi.ticketId],
              )
            ).rows[0].service_started_at,
            firstParentStart,
          );
          assert.equal(
            (
              await pool.query(
                "SELECT count(*)::int AS count FROM resource_allocations WHERE ticket_id=$1 AND released_at IS NULL",
                [multi.ticketId],
              )
            ).rows[0].count,
            0,
          );
          assert.equal(
            (
              await pool.query(
                "SELECT count(*)::int AS count FROM allowance_operations WHERE subject_id=$1",
                [multi.ticketId],
              )
            ).rows[0].count,
            1,
          );
          assert.equal(
            (
              await pool.query(
                "SELECT count(*)::int AS count FROM resource_allocations WHERE ticket_id=$1",
                [multi.ticketId],
              )
            ).rows[0].count,
            3,
          );
        },
      );
      await t.test('completed historical stages and interrupted old attempts do not block archive',async()=>{
        assert.equal(await require('../src/services/resourcePoolLifecycleService').archiveBlock(pool,scope,'1'),null);
      });
      const named = loadModuleWithMocks(
        require.resolve(
          "../src/services/queueNamedResourceConfigurationService",
        ),
        { "../config/db": { pool } },
      );
      const memberIds = [];
      await t.test(
        "named member configuration is scoped, role-protected, revisioned and inert",
        async () => {
          await assert.rejects(
            named.listMembers({ ...context, actorUserId: "2" }, "1"),
            { statusCode: 403 },
          );
          const before = (
            await pool.query(
              "SELECT count(*)::int AS count FROM allowance_operations",
            )
          ).rows[0].count;
          for (let index = 1; index <= 4; index++) {
            const command = {
              body: { poolId: "1", name: `Court ${index}`, isActive: true },
              operationKey: `named-court-${index}`,
            };
            const result = await named.saveMember(context, command);
            memberIds.push(result.member.id);
            assert.deepEqual(
              JSON.parse(
                JSON.stringify(await named.saveMember(context, command)),
              ),
              JSON.parse(JSON.stringify(result)),
            );
          }
          const listed = await named.listMembers(context, "1");
          assert.equal(listed.members.length, 4);
          assert.equal(listed.holdsCreated, false);
          assert.ok(
            listed.members.every((member) => member.availability.provisional),
          );
          const namedPoolBefore = (await pool.query("SELECT capacity,revision::text FROM location_resource_pools WHERE id=1")).rows[0];
          assert.equal(namedPoolBefore.capacity, 8, "creating four active members expands pool capacity from four to eight");
          // Exercise the current hard limit rather than the obsolete fixed-capacity creation rule.
          await pool.query("UPDATE location_resource_pools SET capacity=100 WHERE id=1");
          await assert.rejects(
            named.saveMember(context, {
              body: { poolId: "1", name: "Court 5", isActive: true },
              operationKey: "named-court-five",
            }),
            { code: "RESOURCE_CAPACITY_EXCEEDED" },
          );
          assert.equal((await pool.query("SELECT count(*)::int AS count FROM resource_pool_members WHERE pool_id=1")).rows[0].count, 4);
          assert.deepEqual((await pool.query("SELECT capacity,revision::text FROM location_resource_pools WHERE id=1")).rows[0], {...namedPoolBefore, capacity:100});
          await pool.query("UPDATE location_resource_pools SET capacity=$1 WHERE id=1",[namedPoolBefore.capacity]);
          assert.deepEqual((await pool.query("SELECT capacity,revision::text FROM location_resource_pools WHERE id=1")).rows[0], namedPoolBefore);
          await assert.rejects(
            named.saveMember(context, {
              body: { poolId: "999", name: "Wrong branch", isActive: true },
              operationKey: "named-wrong-pool",
            }),
            { statusCode: 404 },
          );
          await assert.rejects(
            pool.query(
              "UPDATE location_resource_pools SET capacity=3 WHERE id=1",
            ),
            {
              code: "23514",
              constraint: "resource_pool_active_member_capacity",
            },
          );
          assert.equal(
            (
              await pool.query(
                "SELECT count(*)::int AS count FROM resource_pool_member_versions",
              )
            ).rows[0].count,
            4,
          );
          assert.equal(
            (
              await pool.query(
                "SELECT count(*)::int AS count FROM allowance_operations",
              )
            ).rows[0].count,
            before,
          );
        },
      );
      await t.test(
        "named protection and actual occupancy bind one scoped member and prohibit editing held identity",
        async () => {
          const member = memberIds[0];
          const held = (
            await pool.query(
              `INSERT INTO resource_ledger_reservations(tenant_id,location_id,ticket_id,pool_id,pool_revision,requirement_revision,units,starts_at,ends_at,resource_member_id)
          VALUES(1,10,1,1,1,1,1,clock_timestamp(),clock_timestamp()+interval '3 hours',$1) RETURNING id::text`,
              [member],
            )
          ).rows[0].id;
          await assert.rejects(
            named.saveMember(context, {
              memberId: member,
              body: {
                name: "Court 1 renamed",
                isActive: true,
                expectedRevision: "1",
              },
              operationKey: "rename-protected-court",
            }),
            { code: "RESOURCE_IN_USE" },
          );
          await assert.rejects(
            pool.query(
              `INSERT INTO resource_ledger_reservations(tenant_id,location_id,ticket_id,pool_id,pool_revision,requirement_revision,units,starts_at,ends_at,resource_member_id)
          VALUES(1,10,$1,1,1,1,1,clock_timestamp(),clock_timestamp()+interval '3 hours',$2)`,
              [holder.ticketId, member],
            ),
            { code: "23505" },
          );
          await pool.query(
            "UPDATE resource_ledger_reservations SET state='cancelled' WHERE id=$1",
            [held],
          );
          const allocation = (
            await pool.query(
              `INSERT INTO resource_allocations(tenant_id,location_id,ticket_id,pool_id,pool_revision,units,started_at,expected_end_at,resource_member_id)
          VALUES(1,10,1,1,1,1,clock_timestamp(),clock_timestamp()+interval '3 hours',$1) RETURNING id::text`,
              [member],
            )
          ).rows[0].id;
          await assert.rejects(
            pool.query(
              `INSERT INTO resource_allocations(tenant_id,location_id,ticket_id,pool_id,pool_revision,units,started_at,expected_end_at,resource_member_id)
          VALUES(1,10,$1,1,1,1,clock_timestamp(),clock_timestamp()+interval '3 hours',$2)`,
              [holder.ticketId, member],
            ),
            { code: "23505" },
          );
          await assert.rejects(
            named.saveMember(context, {
              memberId: member,
              body: { name: "Court 1", isActive: false, expectedRevision: "1" },
              operationKey: "disable-occupied-court",
            }),
            { code: "RESOURCE_IN_USE" },
          );
          await pool.query(
            "UPDATE resource_allocations SET released_at=clock_timestamp(),outcome='completed' WHERE id=$1",
            [allocation],
          );
          const updated = await named.saveMember(context, {
            memberId: member,
            body: { name: "Court 1", isActive: false, expectedRevision: "1" },
            operationKey: "disable-released-court",
          });
          assert.equal(updated.member.revision, "2");
          assert.equal(updated.member.isActive, false);
          await assert.rejects(
            named.saveMember(context, {
              memberId: member,
              body: { name: "Court 1", isActive: true, expectedRevision: "1" },
              operationKey: "stale-member",
            }),
            { code: "STALE_REVISION" },
          );
        },
      );
      await t.test(
        "queue duration and extra policies are independent from booking/catalog duration and never infer a quote",
        async () => {
          await pool.query(`INSERT INTO location_resource_pools VALUES(2,1,10,1,'Equipment',8,TRUE),(3,1,10,1,'Trainers',1,TRUE);
          INSERT INTO vendor_services(id,tenant_id,name,duration_minutes,price_display,is_active) VALUES(3,1,'Basic equipment',60,'180',TRUE),(4,1,'Trainer',60,'500',TRUE);
          INSERT INTO location_services VALUES(3,1,10,TRUE),(4,1,10,TRUE);
          INSERT INTO service_resource_requirements VALUES(3,1,10,2,1,1),(4,1,10,3,1,1);`);
          const body = {
            expectedRevision: "0",
            selectionMode: "named",
            durationOptionsMinutes: [180, 60, 120],
            allowedExtraServiceIds: ["3", "4"],
          };
          await assert.rejects(
            named.savePolicy(
              { ...context, actorUserId: "2" },
              "1",
              body,
              "staff-policy",
            ),
            { statusCode: 403 },
          );
          const result = await named.savePolicy(
            context,
            "1",
            body,
            "court-policy",
          );
          assert.deepEqual(
            result.policy.durationOptionsMinutes,
            [60, 120, 180],
          );
          assert.equal(
            result.policy.extraScheduling,
            "same_start_within_parent",
          );
          assert.equal(result.policy.quote.status, "unavailable");
          assert.equal(result.executionEnabled, false);
          assert.deepEqual(
            JSON.parse(
              JSON.stringify(
                await named.savePolicy(context, "1", body, "court-policy"),
              ),
            ),
            JSON.parse(JSON.stringify(result)),
          );
          for (const [serviceId, durations] of [
            ["3", [60, 120]],
            ["4", [60]],
          ])
            await named.savePolicy(
              context,
              serviceId,
              {
                expectedRevision: "0",
                selectionMode: "pooled",
                durationOptionsMinutes: durations,
                allowedExtraServiceIds: [],
              },
              `extra-policy-${serviceId}`,
            );
          await assert.rejects(
            named.savePolicy(
              context,
              "1",
              { ...body, expectedRevision: "1", allowedExtraServiceIds: ["2"] },
              "extra-same-court-demand",
            ),
            { code: "INVALID_RESOURCE_CONFIGURATION" },
          );
          await assert.rejects(
            named.savePolicy(
              context,
              "1",
              { ...body, durationOptionsMinutes: [60, 60] },
              "duplicate-duration",
            ),
            { code: "INVALID_RESOURCE_CONFIGURATION" },
          );
          await assert.rejects(
            named.savePolicy(
              context,
              "1",
              { ...body, durationOptionsMinutes: [481] },
              "overlong-duration",
            ),
            { code: "INVALID_RESOURCE_CONFIGURATION" },
          );
          await assert.rejects(
            named.savePolicy(
              context,
              "1",
              { ...body, unitPrice: 100 },
              "invent-price",
            ),
            { code: "INVALID_RESOURCE_CONFIGURATION" },
          );
          const old = (
            await pool.query(
              "SELECT duration_minutes,price_display FROM vendor_services WHERE id=1",
            )
          ).rows[0];
          assert.deepEqual(old, {
            duration_minutes: 180,
            price_display: "450",
          });
          assert.equal((await named.getPolicies(context)).policies.length, 3);
          assert.equal(
            (
              await pool.query(
                "SELECT count(*)::int AS count FROM queue_service_policy_versions",
              )
            ).rows[0].count,
            3,
          );
        },
      );
      const selections = require("../src/services/queueSelectionCapture");
      let nested, selectionCatalog;
      await t.test(
        "named-resource capture preserves one service, three independently timed courts and parent-specific extras",
        async () => {
          await named.saveMember(context, {
            memberId: memberIds[0],
            body: { name: "Court 1", isActive: true, expectedRevision: "2" },
            operationKey: "reactivate-court-one",
          });
          selectionCatalog = await selections.readCatalog(pool, scope);
          nested = [
            {
              serviceSelectionId: "rental",
              serviceId: "1",
              resources: [
                {
                  resourceSelectionId: "court-one",
                  resourceMemberId: memberIds[0],
                  quantity: 1,
                  durationMinutes: 180,
                  extras: [
                    {
                      extraSelectionId: "equipment-one",
                      serviceId: "3",
                      quantity: 1,
                      durationMinutes: 120,
                    },
                    {
                      extraSelectionId: "trainer-one",
                      serviceId: "4",
                      quantity: 1,
                      durationMinutes: 60,
                    },
                  ],
                },
                {
                  resourceSelectionId: "court-two",
                  resourceMemberId: memberIds[1],
                  quantity: 1,
                  durationMinutes: 180,
                  extras: [],
                },
                {
                  resourceSelectionId: "court-three",
                  resourceMemberId: memberIds[2],
                  quantity: 1,
                  durationMinutes: 60,
                  extras: [
                    {
                      extraSelectionId: "equipment-three",
                      serviceId: "3",
                      quantity: 1,
                      durationMinutes: 60,
                    },
                  ],
                },
              ],
            },
          ];
          const before = (
            await pool.query(
              "SELECT count(*)::int AS count FROM allowance_operations",
            )
          ).rows[0].count;
          const result = await selections.capture(
            pool,
            scope,
            nested,
            selectionCatalog.catalogRevision,
          );
          assert.equal(result.serviceSelections.length, 1);
          assert.equal(result.serviceSelections[0].resources.length, 3);
          assert.equal(result.items.length, 6);
          const courts = result.items.filter(
            (item) => item.selectionKind === "resource",
          );
          assert.deepEqual(
            courts.map((item) => item.durationMinutes),
            [180, 180, 60],
          );
          assert.equal(
            courts.reduce((sum, item) => sum + item.resource.totalUnits, 0),
            3,
          );
          const equipment = result.items.filter(
            (item) => item.serviceId === "3",
          );
          assert.equal(equipment.length, 2);
          assert.deepEqual(
            equipment.map((item) => item.parentResourceSelectionId),
            ["court-one", "court-three"],
          );
          assert.equal(
            result.items.filter((item) => item.serviceId === "4")[0]
              .parentResourceSelectionId,
            "court-one",
          );
          assert.equal(result.quote.status, "unavailable");
          assert.equal(result.extraScheduling, "same_start_within_parent");
          assert.equal(
            (
              await pool.query(
                "SELECT count(*)::int AS count FROM allowance_operations",
              )
            ).rows[0].count,
            before,
          );
          const reordered = structuredClone(nested);
          reordered[0].resources.reverse();
          const next = await selections.capture(
            pool,
            scope,
            reordered,
            selectionCatalog.catalogRevision,
          );
          const identity = (items) =>
            Object.fromEntries(
              items.map((item) => [
                item.selectionId,
                {
                  member: item.resourceMemberId,
                  parent: item.parentResourceSelectionId,
                },
              ]),
            );
          assert.deepEqual(identity(next.items), identity(result.items));
        },
      );
      await t.test(
        "nested validation rejects delayed/overlong extras, named duplication, unsafe scope and unapproved durations without correction",
        async () => {
          const invalid = structuredClone(nested);
          invalid[0].resources[0].durationMinutes = 60;
          await assert.rejects(
            selections.capture(
              pool,
              scope,
              invalid,
              selectionCatalog.catalogRevision,
            ),
            { code: "EXTRA_DURATION_EXCEEDS_PARENT" },
          );
          assert.equal(invalid[0].resources[0].extras[0].durationMinutes, 120);
          const delayed = structuredClone(nested);
          delayed[0].resources[0].extras[0].startsAfterMinutes = 30;
          assert.throws(() => selections.validateSelections(delayed), {
            code: "INVALID_SELECTION_PLAN",
          });
          const duplicate = structuredClone(nested);
          duplicate[0].resources[1].resourceMemberId = memberIds[0];
          await assert.rejects(
            selections.capture(
              pool,
              scope,
              duplicate,
              selectionCatalog.catalogRevision,
            ),
            { code: "NAMED_RESOURCE_DUPLICATE" },
          );
          const unknown = structuredClone(nested);
          unknown[0].resources[0].resourceMemberId = randomUUID();
          await assert.rejects(
            selections.capture(
              pool,
              scope,
              unknown,
              selectionCatalog.catalogRevision,
            ),
            { code: "NAMED_RESOURCE_REQUIRED" },
          );
          const duration = structuredClone(nested);
          duration[0].resources[1].durationMinutes = 90;
          await assert.rejects(
            selections.capture(
              pool,
              scope,
              duration,
              selectionCatalog.catalogRevision,
            ),
            { code: "INVALID_DURATION_OPTION" },
          );
          const count = structuredClone(nested);
          count[0].resources[1].quantity = 3;
          await assert.rejects(
            selections.capture(
              pool,
              scope,
              count,
              selectionCatalog.catalogRevision,
            ),
            { code: "NAMED_RESOURCE_REQUIRED" },
          );
          const parentage = structuredClone(nested);
          parentage[0].resources[1].resourceSelectionId = "court-one";
          assert.throws(() => selections.validateSelections(parentage), {
            code: "INVALID_SELECTION_PLAN",
          });
        },
      );
      await t.test(
        "provisional extra availability is not a hold or catalog revision and does not reject valid waiting demand",
        async () => {
          const allocation = (
            await pool.query(
              `INSERT INTO resource_allocations(tenant_id,location_id,ticket_id,pool_id,pool_revision,units,started_at,expected_end_at)
          VALUES(1,10,$1,3,1,1,clock_timestamp(),clock_timestamp()+interval '1 hour') RETURNING id::text`,
              [multi.ticketId],
            )
          ).rows[0].id;
          const busy = await selections.readCatalog(pool, scope);
          assert.equal(busy.catalogRevision, selectionCatalog.catalogRevision);
          const trainer = busy.services
            .find((service) => service.id === "1")
            .extras.find((extra) => extra.serviceId === "4");
          assert.equal(trainer.availability.availableUnits, 0);
          assert.equal(trainer.availability.provisional, true);
          const result = await selections.capture(
            pool,
            scope,
            nested,
            selectionCatalog.catalogRevision,
          );
          assert.equal(result.items.length, 6);
          assert.equal(busy.capabilities.publication, true);
          await pool.query(
            "UPDATE resource_allocations SET released_at=clock_timestamp(),outcome='completed' WHERE id=$1",
            [allocation],
          );
        },
      );
      let nestedPublished;
      await t.test(
        "nested draft survives reload and publication atomically creates one ticket, six children and one allowance",
        async () => {
          const before = (
            await pool.query(
              "SELECT count(*)::int AS count FROM allowance_operations",
            )
          ).rows[0].count;
          const created = await transaction(
            { permission: "tenant.queue.operate" },
            (client) =>
              drafts.command(client, scope, {
                action: "create",
                operationKey: "nested-draft",
                body: {
                  customer: { name: "Named court customer" },
                  notes: "Nested selection verification",
                  catalogRevision: selectionCatalog.catalogRevision,
                  serviceSelections: nested,
                },
              }),
          );
          assert.equal(created.plan.contractVersion, 3);
          assert.equal(created.plan.ticketId, null);
          assert.equal(Object.hasOwn(created.plan, "lines"), false);
          const loaded = drafts.dto(
            await drafts.find(pool, scope, created.plan.id),
          );
          assert.deepEqual(loaded.serviceSelections, nested);
          const patched = await transaction(
            { permission: "tenant.queue.operate" },
            (client) =>
              drafts.command(client, scope, {
                action: "update",
                draftId: created.plan.id,
                operationKey: "nested-note",
                body: {
                  expectedPlanRevision: "1",
                  notes: "Only notes changed",
                },
              }),
          );
          assert.deepEqual(patched.plan.serviceSelections, nested);
          assert.equal(patched.plan.planRevision, "2");
          const command = {
            draftId: created.plan.id,
            operationKey: "nested-publish",
            body: {
              expectedPlanRevision: "2",
              expectedCatalogRevision: selectionCatalog.catalogRevision,
            },
          };
          const settled = await Promise.allSettled([
            service.publish(context, command),
            service.publish(context, command),
          ]);
          const failed = settled.find((result) => result.status === "rejected");
          if (failed) throw failed.reason;
          const results = settled.map((result) => result.value);
          assert.deepEqual(
            JSON.parse(JSON.stringify(results[0])),
            JSON.parse(JSON.stringify(results[1])),
          );
          nestedPublished = results[0].plan;
          assert.equal(nestedPublished.contractVersion, 3);
          assert.equal(nestedPublished.serviceSelections.length, 1);
          assert.equal(nestedPublished.childAttempts.length, 6);
          assert.ok(
            nestedPublished.childAttempts.every(
              (child) => child.state === "waiting",
            ),
          );
          assert.equal(nestedPublished.reservationGroups.length, 0);
          assert.equal(nestedPublished.allocationGroups.length, 0);
          assert.equal(nestedPublished.quote.status, "unavailable");
          assert.equal(
            (
              await pool.query(
                "SELECT count(*)::int AS count FROM allowance_operations",
              )
            ).rows[0].count,
            before + 1,
          );
          assert.equal(
            (
              await pool.query(
                "SELECT count(*)::int AS count FROM queue_selection_definitions WHERE ticket_id=$1",
                [nestedPublished.ticketId],
              )
            ).rows[0].count,
            7,
          );
          await assert.rejects(
            require("../src/services/queuePlanBoundary").assertLegacyTicket(
              pool,
              {
                _id: nestedPublished.ticketId,
                tenantId: "1",
                locationId: "10",
              },
            ),
            { code: "USE_QUEUE_PLAN_COMMAND" },
          );
        },
      );
      const nestedLedger = require("../src/repositories/queueSelectionLedger");
      let nestedReservation;
      await t.test(
        "nested Call rolls every court and extra hold back when the trainer is unavailable",
        async () => {
          const blocker = (
            await pool.query(
              `UPDATE resource_allocations SET released_at=NULL,outcome=NULL
          WHERE ticket_id=$1 AND pool_id=3 AND line_id IS NULL RETURNING id::text`,
              [multi.ticketId],
            )
          ).rows[0].id;
          await assert.rejects(
            transaction(
              { permission: "tenant.queue.operate" },
              async (client) => {
                await client.query(
                  "UPDATE tickets SET status='called' WHERE id=$1",
                  [nestedPublished.ticketId],
                );
                await nestedLedger.reserve(
                  client,
                  ["1", "10"],
                  nestedPublished.ticketId,
                );
              },
            ),
            { code: "RESOURCE_CAPACITY_UNAVAILABLE" },
          );
          assert.equal(
            (
              await pool.query("SELECT status FROM tickets WHERE id=$1", [
                nestedPublished.ticketId,
              ])
            ).rows[0].status,
            "waiting",
          );
          assert.equal(
            (
              await pool.query(
                "SELECT count(*)::int AS n FROM resource_ledger_reservations WHERE ticket_id=$1",
                [nestedPublished.ticketId],
              )
            ).rows[0].n,
            0,
          );
          assert.equal(
            (
              await pool.query(
                "SELECT count(*)::int AS n FROM queue_child_attempts WHERE ticket_id=$1 AND state='waiting'",
                [nestedPublished.ticketId],
              )
            ).rows[0].n,
            6,
          );
          await pool.query(
            "UPDATE resource_allocations SET released_at=clock_timestamp(),outcome='completed' WHERE id=$1",
            [blocker],
          );
        },
      );
      await t.test(
        "nested Call protects six exact child bindings and replay creates no duplicate holds",
        async () => {
          nestedReservation = await transaction(
            { permission: "tenant.queue.operate" },
            async (client) => {
              await client.query(
                "UPDATE tickets SET status='called' WHERE id=$1",
                [nestedPublished.ticketId],
              );
              return nestedLedger.reserve(
                client,
                ["1", "10"],
                nestedPublished.ticketId,
              );
            },
          );
          const replay = await transaction(
            { permission: "tenant.queue.operate" },
            (client) =>
              nestedLedger.reserve(
                client,
                ["1", "10"],
                nestedPublished.ticketId,
              ),
          );
          assert.deepEqual(replay, nestedReservation);
          assert.equal(
            (
              await pool.query(
                "SELECT count(*)::int AS n FROM resource_ledger_reservations WHERE ticket_id=$1 AND state='protected'",
                [nestedPublished.ticketId],
              )
            ).rows[0].n,
            6,
          );
        },
      );
      await t.test(
        "nested Start requires recorded protection and starts every court and extra together with independent durations",
        async () => {
          await assert.rejects(
            transaction({ permission: "tenant.queue.operate" }, (client) =>
              nestedLedger.allocate(
                client,
                ["1", "10"],
                nestedPublished.ticketId,
                randomUUID(),
              ),
            ),
            { code: "RESERVATION_EXPIRED" },
          );
          await assert.rejects(
            transaction(
              { permission: "tenant.queue.operate" },
              async (client) => {
                await nestedLedger.allocate(
                  client,
                  ["1", "10"],
                  nestedPublished.ticketId,
                  nestedReservation.reservationGroupId,
                );
                throw new Error("Downstream domain failure");
              },
            ),
            /Downstream domain failure/u,
          );
          assert.equal(
            (
              await pool.query(
                "SELECT count(*)::int AS n FROM resource_allocations WHERE ticket_id=$1",
                [nestedPublished.ticketId],
              )
            ).rows[0].n,
            0,
          );
          await transaction({ permission: "tenant.queue.operate" }, (client) =>
            nestedLedger.allocate(
              client,
              ["1", "10"],
              nestedPublished.ticketId,
              nestedReservation.reservationGroupId,
            ),
          );
          const rows = (
            await pool.query(
              `SELECT c.selection_id,c.duration_minutes,c.state,c.started_at,a.started_at AS allocation_started,
          extract(epoch from(a.expected_end_at-a.started_at))/60 AS minutes FROM queue_child_attempts c
          JOIN resource_allocations a ON a.child_attempt_id=c.id WHERE c.ticket_id=$1`,
              [nestedPublished.ticketId],
            )
          ).rows;
          assert.equal(rows.length, 6);
          assert.equal(
            new Set(rows.map((row) => row.started_at.toISOString())).size,
            1,
          );
          for (const row of rows) {
            assert.equal(row.state, "in_service");
            assert.equal(
              row.started_at.toISOString(),
              row.allocation_started.toISOString(),
            );
            assert.equal(Number(row.minutes), row.duration_minutes);
          }
        },
      );
      await t.test(
        "child completion releases only recorded capacity and a court cannot complete ahead of its extras",
        async () => {
          const children = (
            await pool.query(
              "SELECT *,revision::text FROM queue_child_attempts WHERE ticket_id=$1",
              [nestedPublished.ticketId],
            )
          ).rows;
          const court = children.find((c) => c.selection_id === "court-one"),
            extra = children.find(
              (c) => c.parent_child_attempt_id === court.id,
            );
          const group = (
            await pool.query(
              "SELECT id FROM queue_allocation_groups WHERE ticket_id=$1",
              [nestedPublished.ticketId],
            )
          ).rows[0].id;
          const input = (c) => ({
            childAttemptId: c.id,
            expectedChildRevision: c.revision,
            allocationGroupId: group,
            outcome: "completed",
          });
          await assert.rejects(
            transaction({ permission: "tenant.queue.operate" }, (client) =>
              nestedLedger.releaseChild(
                client,
                ["1", "10"],
                nestedPublished.ticketId,
                input(court),
              ),
            ),
            { code: "REQUIRED_EXTRAS_UNFINISHED" },
          );
          const result = await transaction(
            { permission: "tenant.queue.operate" },
            (client) =>
              nestedLedger.releaseChild(
                client,
                ["1", "10"],
                nestedPublished.ticketId,
                input(extra),
              ),
          );
          assert.equal(result.stageCompleted, false);
          assert.equal(result.resolutionState, "partial");
          assert.equal(
            (
              await pool.query(
                "SELECT count(*)::int AS n FROM resource_allocations WHERE ticket_id=$1 AND released_at IS NULL",
                [nestedPublished.ticketId],
              )
            ).rows[0].n,
            5,
          );
          await assert.rejects(
            transaction({ permission: "tenant.queue.operate" }, (client) =>
              nestedLedger.releaseChild(
                client,
                ["1", "10"],
                nestedPublished.ticketId,
                input(extra),
              ),
            ),
            { code: "STALE_REVISION" },
          );
          assert.equal(
            (
              await pool.query(
                "SELECT state FROM queue_child_attempts WHERE id=$1",
                [court.id],
              )
            ).rows[0].state,
            "in_service",
          );
        },
      );
      let retryInput;
      await t.test(
        "court interruption explicitly resolves unfinished extras while preserving other courts",
        async () => {
          const children = (
            await pool.query(
              "SELECT *,revision::text FROM queue_child_attempts WHERE ticket_id=$1 AND is_current",
              [nestedPublished.ticketId],
            )
          ).rows;
          const court = children.find((c) => c.selection_id === "court-one");
          const extras = children.filter(
            (c) =>
              c.parent_child_attempt_id === court.id &&
              c.state === "in_service",
          );
          const group = (
            await pool.query(
              "SELECT id FROM queue_allocation_groups WHERE ticket_id=$1",
              [nestedPublished.ticketId],
            )
          ).rows[0].id;
          const body = {
            childAttemptId: court.id,
            expectedChildRevision: court.revision,
            allocationGroupId: group,
            outcome: "terminated",
            reason: "Customer requested a break",
          };
          await assert.rejects(
            transaction({ permission: "tenant.queue.operate" }, (client) =>
              nestedLedger.releaseChild(
                client,
                ["1", "10"],
                nestedPublished.ticketId,
                body,
              ),
            ),
            { code: "REQUIRED_EXTRAS_UNFINISHED" },
          );
          body.interruptedExtras = extras.map((c) => ({
            childAttemptId: c.id,
            expectedChildRevision: c.revision,
          }));
          await transaction({ permission: "tenant.queue.operate" }, (client) =>
            nestedLedger.releaseChild(
              client,
              ["1", "10"],
              nestedPublished.ticketId,
              body,
            ),
          );
          assert.equal(
            (
              await pool.query(
                "SELECT count(*)::int AS n FROM resource_allocations WHERE ticket_id=$1 AND released_at IS NULL",
                [nestedPublished.ticketId],
              )
            ).rows[0].n,
            3,
          );
          const after = (
            await pool.query(
              "SELECT *,revision::text FROM queue_child_attempts WHERE ticket_id=$1 AND is_current",
              [nestedPublished.ticketId],
            )
          ).rows;
          retryInput = {
            childAttemptId: court.id,
            expectedChildRevision: after.find((c) => c.id === court.id)
              .revision,
            interruptedExtras: after
              .filter(
                (c) =>
                  c.parent_child_attempt_id === court.id &&
                  c.state === "interrupted",
              )
              .map((c) => ({
                childAttemptId: c.id,
                expectedChildRevision: c.revision,
              })),
          };
        },
      );
      await t.test(
        "failed court-tree retry preserves interrupted history and unrelated allocations atomically",
        async () => {
          const blocker = (
            await pool.query(
              `UPDATE resource_allocations SET released_at=NULL,outcome=NULL
          WHERE ticket_id=$1 AND pool_id=3 AND line_id IS NULL RETURNING id::text`,
              [multi.ticketId],
            )
          ).rows[0].id;
          await assert.rejects(
            transaction({ permission: "tenant.queue.operate" }, (client) =>
              nestedLedger.retryCourt(
                client,
                ["1", "10"],
                nestedPublished.ticketId,
                retryInput,
              ),
            ),
            { code: "RESOURCE_CAPACITY_UNAVAILABLE" },
          );
          assert.equal(
            (
              await pool.query(
                "SELECT count(*)::int AS n FROM queue_child_attempts WHERE ticket_id=$1",
                [nestedPublished.ticketId],
              )
            ).rows[0].n,
            6,
          );
          assert.equal(
            (
              await pool.query(
                "SELECT is_current,state FROM queue_child_attempts WHERE id=$1",
                [retryInput.childAttemptId],
              )
            ).rows[0].is_current,
            true,
          );
          await pool.query(
            "UPDATE resource_allocations SET released_at=clock_timestamp(),outcome='completed' WHERE id=$1",
            [blocker],
          );
        },
      );
      await t.test(
        "court retry starts a new tree together and proves completed extras without reallocating them",
        async () => {
          await transaction({ permission: "tenant.queue.operate" }, (client) =>
            nestedLedger.retryCourt(
              client,
              ["1", "10"],
              nestedPublished.ticketId,
              retryInput,
            ),
          );
          const rows = (
            await pool.query(
              "SELECT *,revision::text FROM queue_child_attempts WHERE ticket_id=$1 ORDER BY attempt",
              [nestedPublished.ticketId],
            )
          ).rows;
          assert.equal(rows.length, 8);
          const retry = rows.filter((c) => Number(c.attempt) === 2);
          assert.equal(retry.length, 2);
          assert.equal(
            new Set(retry.map((c) => c.started_at.toISOString())).size,
            1,
          );
          const court = retry.find((c) => c.selection_kind === "resource"),
            completed = rows.find((c) => c.state === "completed");
          assert.deepEqual(court.satisfied_dependencies, [completed.id]);
          assert.equal(completed.is_current, true);
          assert.equal(
            (
              await pool.query(
                "SELECT count(*)::int AS n FROM resource_allocations WHERE child_attempt_id=$1",
                [completed.id],
              )
            ).rows[0].n,
            1,
          );
          assert.equal(
            (
              await pool.query(
                "SELECT count(*)::int AS n FROM resource_allocations WHERE ticket_id=$1 AND released_at IS NULL",
                [nestedPublished.ticketId],
              )
            ).rows[0].n,
            5,
          );
        },
      );
      await t.test(
        "successful retry and remaining children finish the stage without rewriting the mixed original group",
        async () => {
          let last;
          for (const kind of ["extra", "resource"]) {
            const active = (
              await pool.query(
                `SELECT c.*,c.revision::text,a.group_id FROM queue_child_attempts c
            JOIN resource_allocations a ON a.child_attempt_id=c.id WHERE c.ticket_id=$1 AND c.is_current
            AND c.state='in_service' AND c.selection_kind=$2 ORDER BY c.selection_id`,
                [nestedPublished.ticketId, kind],
              )
            ).rows;
            for (const child of active)
              last = await transaction(
                { permission: "tenant.queue.operate" },
                (client) =>
                  nestedLedger.releaseChild(
                    client,
                    ["1", "10"],
                    nestedPublished.ticketId,
                    {
                      childAttemptId: child.id,
                      expectedChildRevision: child.revision,
                      allocationGroupId: child.group_id,
                      outcome: "completed",
                    },
                  ),
              );
          }
          assert.equal(last.stageCompleted, true);
          const groups = (
            await pool.query(
              "SELECT resolution_state,released_at FROM queue_allocation_groups WHERE ticket_id=$1",
              [nestedPublished.ticketId],
            )
          ).rows;
          assert.deepEqual(groups.map((g) => g.resolution_state).sort(), [
            "completed",
            "mixed",
          ]);
          assert.ok(groups.every((g) => g.released_at));
          assert.equal(
            (
              await pool.query(
                "SELECT count(*)::int AS n FROM resource_allocations WHERE ticket_id=$1 AND released_at IS NULL",
                [nestedPublished.ticketId],
              )
            ).rows[0].n,
            0,
          );
          assert.equal(
            (
              await pool.query(
                "SELECT count(*)::int AS n FROM queue_child_attempts WHERE ticket_id=$1 AND is_current AND state='completed'",
                [nestedPublished.ticketId],
              )
            ).rows[0].n,
            6,
          );
        },
      );
      await t.test(
        "named command contract persists capacity wait, requires agreed extra removal and resolves one parent with replay protection",
        async () => {
          const created = await transaction(
            { permission: "tenant.queue.operate" },
            (client) =>
              drafts.command(client, scope, {
                action: "create",
                operationKey: "named-command-draft",
                body: {
                  customer: { name: "Command verification" },
                  catalogRevision: selectionCatalog.catalogRevision,
                  serviceSelections: nested,
                },
              }),
          );
          let plan = (
            await service.publish(context, {
              draftId: created.plan.id,
              operationKey: "named-command-publish",
              body: {
                expectedPlanRevision: "1",
                expectedCatalogRevision: selectionCatalog.catalogRevision,
              },
            })
          ).plan;
          const blocker = (
            await pool.query(
              `UPDATE resource_allocations SET released_at=NULL,outcome=NULL WHERE ticket_id=$1 AND pool_id=3 AND line_id IS NULL RETURNING id::text`,
              [multi.ticketId],
            )
          ).rows[0].id;
          try {
            await commands.execute(context, {
              draftId: plan.id,
              action: "call",
              operationKey: "named-command-wait",
              body: guarded(plan, { counterSlug: "court" }),
              serviceCounter: { _id: "20", targetTicketId: plan.ticketId },
            });
            assert.fail("Busy trainer must prevent Call");
          } catch (error) {
            assert.equal(error.code, "RESOURCE_CAPACITY_UNAVAILABLE");
            plan = error.plan;
          }
          assert.equal(plan.state, "waiting");
          assert.equal(plan.resourceWait.code, "RESOURCE_CAPACITY_UNAVAILABLE");
          assert.equal(plan.resourceWait.selectionId, "trainer-one");
          assert.equal(plan.resourceWait.selectionKind, "extra");
          assert.equal(
            plan.resourceWait.parentResourceSelectionId,
            "court-one",
          );
          assert.equal(typeof plan.resourceWait.parentResourceName, "string");
          assert.equal(plan.reservationGroups.length, 0);
          const reduced = structuredClone(nested);
          reduced[0].resources[0].extras =
            reduced[0].resources[0].extras.filter(
              (extra) => extra.serviceId !== "4",
            );
          const amend = {
            draftId: plan.id,
            action: "amend",
            operationKey: "named-command-amend",
            body: guarded(plan, {
              serviceSelections: reduced,
              expectedCatalogRevision: selectionCatalog.catalogRevision,
              reason: "Customer agreed to proceed without trainer",
            }),
          };
          await assert.rejects(commands.execute(context, amend), {
            code: "CUSTOMER_AGREEMENT_REQUIRED",
          });
          amend.body.customerAgreement = { confirmed: true };
          plan = (await commands.execute(context, amend)).plan;
          assert.equal(plan.planRevision, "2");
          assert.equal(plan.serviceSelections[0].resources[0].extras.length, 1);
          const beforeCallRevision = (
            await pool.query(
              "SELECT revision::text FROM resource_ledger_scopes WHERE tenant_id=1 AND location_id=10",
            )
          ).rows[0].revision;
          plan = (
            await commands.execute(context, {
              draftId: plan.id,
              action: "call",
              operationKey: "named-command-call",
              body: guarded(plan, { counterSlug: "court" }),
              serviceCounter: { _id: "20", targetTicketId: plan.ticketId },
            })
          ).plan;
          assert.equal(plan.reservationGroups.at(-1).members.length, 5);
          assert.equal(
            (
              await pool.query(
                "SELECT revision::text FROM resource_ledger_scopes WHERE tenant_id=1 AND location_id=10",
              )
            ).rows[0].revision,
            String(BigInt(beforeCallRevision) + 1n),
          );
          const gearBlocker = (
            await pool.query(
              `INSERT INTO resource_allocations(tenant_id,location_id,ticket_id,pool_id,pool_revision,units,started_at,expected_end_at)
            VALUES(1,10,$1,2,1,1,clock_timestamp(),clock_timestamp()+interval '1 hour') RETURNING id::text`,
              [nestedPublished.ticketId],
            )
          ).rows[0].id;
          const expanded = structuredClone(reduced);
          expanded[0].resources[0].extras[0].quantity = 7;
          await assert.rejects(
            commands.execute(context, {
              draftId: plan.id,
              action: "amend",
              operationKey: "named-failed-called-replacement",
              body: guarded(plan, {
                serviceSelections: expanded,
                expectedCatalogRevision: selectionCatalog.catalogRevision,
                reason: "Requested additional equipment",
              }),
            }),
            { code: "RESOURCE_CAPACITY_UNAVAILABLE" },
          );
          const preserved =
            await require("../src/repositories/queuePlanProjection").read(
              pool,
              scope,
              await drafts.find(pool, scope, plan.id),
            );
          assert.equal(preserved.planRevision, plan.planRevision);
          assert.equal(preserved.ticketRevision, plan.ticketRevision);
          assert.deepEqual(
            JSON.parse(JSON.stringify(preserved.reservationGroups)),
            JSON.parse(JSON.stringify(plan.reservationGroups)),
          );
          await pool.query(
            "UPDATE resource_allocations SET released_at=clock_timestamp(),outcome='completed' WHERE id=$1",
            [gearBlocker],
          );
          await assert.rejects(
            commands.execute(context, {
              draftId: plan.id,
              action: "start",
              operationKey: "named-stale-start",
              body: {
                ...guarded(plan, {
                  reservationGroupId: plan.reservationGroups.at(-1).id,
                }),
                expectedTicketRevision: "1",
              },
            }),
            { code: "STALE_REVISION" },
          );
          plan = (
            await commands.execute(context, {
              draftId: plan.id,
              action: "start",
              operationKey: "named-command-start",
              body: guarded(plan, {
                reservationGroupId: plan.reservationGroups.at(-1).id,
              }),
            })
          ).plan;
          const courtToRetry = plan.childAttempts.find(
            (child) => child.selectionId === "court-two" && child.isCurrent,
          );
          plan = (
            await commands.execute(context, {
              draftId: plan.id,
              action: "interrupt",
              operationKey: "named-activity-interrupt",
              body: guarded(plan, {
                childAttemptId: courtToRetry.childAttemptId,
                expectedChildRevision: courtToRetry.revision,
                allocationGroupId: courtToRetry.allocationGroupId,
                reason: "Activity-lock contention verification",
                interruptedExtras: [],
              }),
            })
          ).plan;
          const interruptedCourt = plan.childAttempts.find(
            (child) => child.selectionId === "court-two" && child.isCurrent,
          );
          assert.equal((await require('../src/services/resourcePoolLifecycleService').archiveBlock(pool,scope,'1')).code,'RESOURCE_POOL_WORKFLOW_IN_PROGRESS');
          const retryMember=(await named.listMembers(context,'1')).members.find(m=>m.id===plan.serviceSelections.flatMap(s=>s.resources).find(r=>r.resourceSelectionId===interruptedCourt.selectionId).resourceMemberId);
          await assert.rejects(named.saveMember(context,{memberId:retryMember.id,body:{name:retryMember.name,isActive:false,expectedRevision:retryMember.revision},operationKey:randomUUID()}),{code:'RESOURCE_MEMBER_WORKFLOW_IN_PROGRESS'});
          await assert.rejects(named.archiveMember(context,{memberId:retryMember.id,body:{expectedRevision:retryMember.revision},operationKey:randomUUID()}),{code:'RESOURCE_MEMBER_WORKFLOW_IN_PROGRESS'});
          const retryCommand = {
            draftId: plan.id,
            action: "retry",
            operationKey: "named-activity-retry",
            body: guarded(plan, {
              childAttemptId: interruptedCourt.childAttemptId,
              expectedChildRevision: interruptedCourt.revision,
              interruptedExtras: [],
            }),
          };
          const deactivation = await pool.connect();
          let pending,
            settled = false;
          try {
            await deactivation.query("BEGIN");
            await deactivation.query(
              "UPDATE tenants SET is_active=FALSE WHERE id=1",
            );
            pending = commands.execute(context, retryCommand).then(
              (value) => {
                settled = true;
                return { value };
              },
              (error) => {
                settled = true;
                return { error };
              },
            );
            await pool.query("SELECT pg_sleep(0.03)");
            assert.equal(
              settled,
              false,
              "Retry must wait for the tenant activity writer",
            );
            await deactivation.query("COMMIT");
            const result = await pending;
            assert.equal(result.error?.code, "INVALID_STATE");
            assert.equal(
              (
                await pool.query(
                  "SELECT count(*)::int AS n FROM queue_child_attempts WHERE ticket_id=$1 AND plan_revision=$2 AND selection_id='court-two'",
                  [plan.ticketId, plan.planRevision],
                )
              ).rows[0].n,
              1,
            );
          } finally {
            await deactivation.query("ROLLBACK");
            deactivation.release();
            if (pending) await pending;
            await pool.query("UPDATE tenants SET is_active=TRUE WHERE id=1");
          }
          plan = (await commands.execute(context, retryCommand)).plan;
          for (const kind of ["extra", "resource"]) {
            for (const old of plan.childAttempts.filter(
              (child) =>
                child.isCurrent &&
                child.planRevision === plan.planRevision &&
                child.selectionKind === kind,
            )) {
              const child = plan.childAttempts.find(
                (c) => c.childAttemptId === old.childAttemptId,
              );
              const command = {
                draftId: plan.id,
                action: "complete",
                operationKey: `named-child-${child.childAttemptId}`,
                body: guarded(plan, {
                  childAttemptId: child.childAttemptId,
                  expectedChildRevision: child.revision,
                  allocationGroupId: child.allocationGroupId,
                }),
              };
              const result = await commands.execute(context, command);
              plan = result.plan;
              const replay = await commands.execute(context, command);
              assert.deepEqual(
                JSON.parse(JSON.stringify(result)),
                JSON.parse(JSON.stringify(replay)),
              );
            }
          }
          assert.equal(plan.state, "served");
          assert.deepEqual(
            parentSelectionTransitions
              .filter((entry) => entry.id === plan.ticketId)
              .map((entry) => entry.action),
            ["start", "complete"],
          );
          assert.equal(
            (
              await pool.query(
                "SELECT count(*)::int AS n FROM resource_allocations WHERE ticket_id=$1 AND released_at IS NULL",
                [plan.ticketId],
              )
            ).rows[0].n,
            0,
          );
          await pool.query(
            "UPDATE resource_allocations SET released_at=clock_timestamp(),outcome='completed' WHERE id=$1",
            [blocker],
          );
        },
      );
      await t.test(
        "named expiry returns all children to Waiting and a new Call exposes the newest reservation binding",
        async () => {
          const onlyCourt = structuredClone(nested);
          onlyCourt[0].resources = onlyCourt[0].resources.slice(1, 3);
          for (const resource of onlyCourt[0].resources) resource.extras = [];
          const created = await transaction(
            { permission: "tenant.queue.operate" },
            (client) =>
              drafts.command(client, scope, {
                action: "create",
                operationKey: "named-expiry-draft",
                body: {
                  customer: { name: "Expiry verification" },
                  catalogRevision: selectionCatalog.catalogRevision,
                  serviceSelections: onlyCourt,
                },
              }),
          );
          let plan = (
            await service.publish(context, {
              draftId: created.plan.id,
              operationKey: "named-expiry-publish",
              body: {
                expectedPlanRevision: "1",
                expectedCatalogRevision: selectionCatalog.catalogRevision,
              },
            })
          ).plan;
          plan = (
            await commands.execute(context, {
              draftId: plan.id,
              action: "call",
              operationKey: "named-expiry-call",
              body: guarded(plan, { counterSlug: "court" }),
              serviceCounter: { _id: "20", targetTicketId: plan.ticketId },
            })
          ).plan;
          const oldGroup = plan.reservationGroups[0].id;
          await pool.query(
            "UPDATE queue_reservation_groups SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
            [oldGroup],
          );
          try {
            await commands.execute(context, {
              draftId: plan.id,
              action: "start",
              operationKey: "named-expired-start",
              body: guarded(plan, { reservationGroupId: oldGroup }),
            });
            assert.fail("Expired Start must fail");
          } catch (error) {
            assert.equal(error.code, "RESERVATION_EXPIRED");
            plan = error.plan;
          }
          assert.equal(plan.state, "waiting");
          assert.equal(plan.childAttempts[0].state, "waiting");
          assert.equal(plan.reservationGroups[0].state, "expired");
          plan = (
            await commands.execute(context, {
              draftId: plan.id,
              action: "call",
              operationKey: "named-expiry-recall",
              body: guarded(plan, { counterSlug: "court" }),
              serviceCounter: { _id: "20", targetTicketId: plan.ticketId },
            })
          ).plan;
          assert.notEqual(plan.childAttempts[0].reservationGroupId, oldGroup);
          assert.equal(
            plan.childAttempts[0].reservationGroupId,
            plan.reservationGroups.find((g) => g.state === "protected").id,
          );
          const protectedGroup = plan.reservationGroups.find(
            (g) => g.state === "protected",
          );
          assert.equal(protectedGroup.members.length, 2);
          const cancel = () =>
            ledger.withScopeTransaction(
              { pool, ...scope, authorize: async () => true },
              (_client, capability) =>
                capability.executeCommand({
                  command: "cancelReservation",
                  operationKey: "cancel-named-promise",
                  payload: { reservationId: protectedGroup.members[0].id },
                }),
            );
          await pool.query(
            "UPDATE resource_ledger_reservations SET state='converted' WHERE id=$1",
            [protectedGroup.members[1].id],
          );
          await assert.rejects(cancel(), { code: "INVALID_STATE" });
          assert.equal(
            (
              await pool.query(
                "SELECT state FROM resource_ledger_reservations WHERE id=$1",
                [protectedGroup.members[0].id],
              )
            ).rows[0].state,
            "protected",
          );
          await pool.query(
            "UPDATE resource_ledger_reservations SET state='protected' WHERE id=$1",
            [protectedGroup.members[1].id],
          );
          const cancelled = await cancel();
          assert.equal(
            cancelled.groupCancellation.oldState.groupState,
            "protected",
          );
          assert.equal(
            cancelled.groupCancellation.newState.groupState,
            "cancelled",
          );
          const audit = (
            await pool.query(
              "SELECT actor_user_id::text,result FROM resource_ledger_commands WHERE operation_key='cancel-named-promise'",
            )
          ).rows[0];
          assert.equal(audit.actor_user_id, scope.actorUserId);
          assert.equal(
            audit.result.groupCancellation.oldState.children.length,
            2,
          );
          const refreshed =
            await require("../src/repositories/queuePlanProjection").read(
              pool,
              scope,
              await drafts.find(pool, scope, plan.id),
            );
          assert.equal(refreshed.state, "waiting");
          assert.ok(
            refreshed.childAttempts.every((c) => c.state === "waiting"),
          );
          assert.equal(
            (
              await pool.query(
                "SELECT count(*)::int AS n FROM resource_ledger_reservations WHERE ticket_id=$1 AND state='protected'",
                [plan.ticketId],
              )
            ).rows[0].n,
            0,
          );
        },
      );
      await t.test(
        "named multi-stage commands keep future children inert, require Handoff and emit one parent start",
        async () => {
          const nextConfig = structuredClone(configuration);
          nextConfig.expectedConfigurationRevision = (
            await workflowService.get(context)
          ).workflow.configurationRevision;
          nextConfig.stages[1].serviceIds = ["3"];
          await workflowService.put(
            context,
            nextConfig,
            "named-multistage-config",
          );
          const catalog = await selections.readCatalog(pool, scope);
          const input = [
            {
              serviceSelectionId: "court-stage",
              serviceId: "1",
              resources: [
                {
                  resourceSelectionId: "named-stage-court",
                  resourceMemberId: memberIds[0],
                  quantity: 1,
                  durationMinutes: 60,
                  extras: [],
                },
              ],
            },
            {
              serviceSelectionId: "gear-stage",
              serviceId: "3",
              resources: [
                {
                  resourceSelectionId: "pooled-stage-gear",
                  resourceMemberId: null,
                  quantity: 1,
                  durationMinutes: 60,
                  extras: [],
                },
              ],
            },
          ];
          const created = await transaction(
            { permission: "tenant.queue.operate" },
            (client) =>
              drafts.command(client, scope, {
                action: "create",
                operationKey: "named-multistage-draft",
                body: {
                  customer: { name: "Named multi-stage verification" },
                  catalogRevision: catalog.catalogRevision,
                  serviceSelections: input,
                },
              }),
          );
          let plan = (
            await service.publish(context, {
              draftId: created.plan.id,
              operationKey: "named-multistage-publish",
              body: {
                expectedPlanRevision: "1",
                expectedCatalogRevision: catalog.catalogRevision,
              },
            })
          ).plan;
          assert.equal(
            plan.childAttempts.find(
              (c) => c.selectionId === "pooled-stage-gear",
            ).state,
            "pending",
          );
          const invoke = async (action, key, extra = {}) => {
            plan = (
              await commands.execute(context, {
                draftId: plan.id,
                action,
                operationKey: key,
                body: guarded(plan, extra),
                ...(action === "call"
                  ? {
                      serviceCounter: {
                        _id: plan.currentStage.serviceCounterIds[0],
                        targetTicketId: plan.ticketId,
                      },
                    }
                  : {}),
              })
            ).plan;
            return plan;
          };
          await invoke("call", "named-first-stage-call", {
            counterSlug: "first",
          });
          assert.equal(plan.reservationGroups[0].members.length, 1);
          await invoke("start", "named-first-stage-start", {
            reservationGroupId: plan.reservationGroups[0].id,
          });
          const court = plan.childAttempts.find(
            (c) => c.selectionId === "named-stage-court",
          );
          await invoke("complete", "named-first-stage-complete", {
            childAttemptId: court.childAttemptId,
            expectedChildRevision: court.revision,
            allocationGroupId: court.allocationGroupId,
          });
          assert.equal(plan.state, "awaiting_handoff");
          assert.equal(
            (await readTicket(plan.ticketId, { client: pool })).serviceEndedAt,
            null,
          );
          await invoke("handoff", "named-stage-handoff");
          assert.equal(plan.state, "waiting");
          assert.equal(plan.currentStage.id, stageB);
          assert.equal(
            plan.childAttempts.find(
              (c) => c.selectionId === "pooled-stage-gear",
            ).state,
            "waiting",
          );
          await invoke("call", "named-second-stage-call", {
            counterSlug: "second",
          });
          assert.equal(plan.state, "called");
          await invoke("start", "named-second-stage-start", {
            reservationGroupId: plan.reservationGroups.find(
              (g) => g.state === "protected",
            ).id,
          });
          const gear = plan.childAttempts.find(
            (c) => c.selectionId === "pooled-stage-gear",
          );
          await invoke("complete", "named-second-stage-complete", {
            childAttemptId: gear.childAttemptId,
            expectedChildRevision: gear.revision,
            allocationGroupId: gear.allocationGroupId,
          });
          assert.equal(plan.state, "served");
          assert.deepEqual(
            parentSelectionTransitions
              .filter((entry) => entry.id === plan.ticketId)
              .map((entry) => entry.action),
            ["start", "complete"],
          );
        },
      );
      const selections4 = require("../src/services/queueSelectionCaptureV4");
      const genericConfig = (
        mode,
        baseMinutes,
        maxCount,
        defaultCount = 1,
      ) => ({
        labels: {
          service: "Service",
          resources: "Resources",
          duration: "Duration",
          extras: "Extras",
        },
        assignment: {
          mode,
          allocationIdentity:
            mode === "named" ? "named_member" : "pooled_capacity",
        },
        duration: {
          mode: "adjustable",
          visible: true,
          baseMinutes,
          minCount: 1,
          maxCount,
          stepCount: 1,
          defaultCount,
        },
        extras: [],
        execution: {
          resourceStart: "together",
          extraStart: "with_parent",
          extraContainment: "within_parent",
          selectedExtraResolution: "explicit_required",
        },
      });
      let options4, input4, published4;
      await t.test(
        "explicit service configurations require current permission and revision and preserve prior policy versions",
        async () => {
          const before = (await named.getConfiguration(context, "1")).policy;
          assert.equal(before, null);
          await assert.rejects(
            named.saveConfiguration(
              { ...context, actorUserId: "2" },
              "1",
              {
                expectedRevision: "1",
                configuration: genericConfig("named", 60, 3),
              },
              "v4-denied",
            ),
            { statusCode: 403 },
          );
          for (const [id, config] of [
            ["3", genericConfig("automatic", 30, 6, 2)],
            [
              "4",
              {
                ...genericConfig("automatic", 30, 2, 2),
                duration: {
                  mode: "fixed",
                  visible: false,
                  baseMinutes: 30,
                  minCount: 2,
                  maxCount: 2,
                  stepCount: 1,
                  defaultCount: 2,
                },
              },
            ],
            [
              "1",
              {
                ...genericConfig("named", 60, 3),
                extras: [
                  { serviceId: "3", selection: "optional" },
                  { serviceId: "4", selection: "optional" },
                ],
              },
            ],
          ]) {
            const expectedRevision = (
              await pool.query(
                "SELECT revision::text FROM queue_service_policies WHERE service_id=$1 AND tenant_id=1 AND location_id=10",
                [id],
              )
            ).rows[0].revision;
            const body = { expectedRevision, configuration: config },
              result = await named.saveConfiguration(
                context,
                id,
                body,
                "v4-config-" + id,
              );
            assert.equal(result.contractVersion, 4);
            assert.deepEqual(
              await named.saveConfiguration(
                context,
                id,
                body,
                "v4-config-" + id,
              ),
              result,
            );
            await assert.rejects(
              named.saveConfiguration(context, id, body, "v4-stale-" + id),
              { code: "STALE_REVISION" },
            );
          }
          options4 = await selections4.readCatalog(pool, scope);
          assert.equal(options4.contractVersion, 4);
          const root = options4.services.find((s) => s.id === "1");
          assert.equal(root.durationPolicy.baseMinutes, 60);
          assert.equal(root.assignmentPolicy.mode, "named");
          assert.equal(
            root.extras.find((e) => e.serviceId === "4").durationPolicy.visible,
            false,
          );
          const extraRevision = (id) =>
            root.extras.find((extra) => extra.serviceId === id).durationPolicy
              .revision;
          input4 = [
            {
              serviceSelectionId: "generic-service",
              serviceId: "1",
              resources: [
                {
                  resourceSelectionId: "resource-one",
                  resourceMemberId: memberIds[0],
                  quantity: 1,
                  durationCount: 3,
                  durationPolicyRevision: root.durationPolicy.revision,
                  extras: [
                    {
                      extraSelectionId: "extra-one",
                      serviceId: "3",
                      quantity: 1,
                      durationCount: 4,
                      durationPolicyRevision: extraRevision("3"),
                    },
                    {
                      extraSelectionId: "extra-two",
                      serviceId: "4",
                      quantity: 1,
                      durationCount: 2,
                      durationPolicyRevision: extraRevision("4"),
                    },
                  ],
                },
                {
                  resourceSelectionId: "resource-two",
                  resourceMemberId: memberIds[1],
                  quantity: 1,
                  durationCount: 3,
                  durationPolicyRevision: root.durationPolicy.revision,
                  extras: [],
                },
                {
                  resourceSelectionId: "resource-three",
                  resourceMemberId: memberIds[2],
                  quantity: 1,
                  durationCount: 1,
                  durationPolicyRevision: root.durationPolicy.revision,
                  extras: [
                    {
                      extraSelectionId: "extra-three",
                      serviceId: "3",
                      quantity: 1,
                      durationCount: 2,
                      durationPolicyRevision: extraRevision("3"),
                    },
                  ],
                },
              ],
            },
          ];
          const accepted = await selections4.capture(
            pool,
            scope,
            input4,
            options4.catalogRevision,
          );
          assert.equal(accepted.items[0].durationCount, 3);
          assert.equal(accepted.items[0].baseMinutes, 60);
          assert.equal(accepted.items[0].durationMinutes, 180);
          assert.equal(accepted.items[0].quantity, 1);
          assert.equal(
            accepted.items[0].executionPolicy.extraContainment,
            "within_parent",
          );
          assert.equal(
            accepted.serviceSelections[0].resources[0].extras[0]
              .selectionRequirement,
            "optional",
          );
        },
      );
      await t.test(
        "v4 count inputs reject tampered totals, invalid integer/fixed count, stale policy and containment without clamping",
        async () => {
          const total = structuredClone(input4);
          total[0].resources[0].durationMinutes = 1;
          assert.throws(() => selections4.validateSelections(total), {
            code: "INVALID_SELECTION_PLAN",
          });
          for(const field of ['resources','extras','resourceMemberId']){
            const unsupported=structuredClone(input4);unsupported[0].resources[0].extras[0][field]=field==='resourceMemberId'?memberIds[0]:[];
            assert.throws(()=>selections4.validateSelections(unsupported),{code:'INVALID_SELECTION_PLAN'});
          }
          const count = structuredClone(input4);
          count[0].resources[0].durationCount = 1.5;
          assert.throws(() => selections4.validateSelections(count), {
            code: "INVALID_DURATION_COUNT",
          });
          const fixed = structuredClone(input4);
          fixed[0].resources[0].extras[1].durationCount = 1;
          await assert.rejects(
            selections4.capture(pool, scope, fixed, options4.catalogRevision),
            { code: "INVALID_DURATION_COUNT" },
          );
          const stale = structuredClone(input4);
          stale[0].resources[0].durationPolicyRevision = "1";
          await assert.rejects(
            selections4.capture(pool, scope, stale, options4.catalogRevision),
            { code: "STALE_DURATION_POLICY" },
          );
          const short = structuredClone(input4);
          short[0].resources[0].durationCount = 1;
          await assert.rejects(
            selections4.capture(pool, scope, short, options4.catalogRevision),
            { code: "EXTRA_DURATION_EXCEEDS_PARENT" },
          );
          assert.equal(short[0].resources[0].extras[0].durationCount, 4);
        },
      );
      await t.test(
        "v4 draft reload and one-ticket publication freeze count/base/total/policy separately from resource units",
        async () => {
          const before = (
            await pool.query(
              "SELECT count(*)::int AS n FROM allowance_operations",
            )
          ).rows[0].n;
          const created = await transaction(
            { permission: "tenant.queue.operate" },
            (client) =>
              drafts.command(client, scope, {
                action: "create",
                operationKey: "v4-draft",
                body: {
                  contractVersion: 4,
                  customer: { name: "Generic count verification" },
                  catalogRevision: options4.catalogRevision,
                  serviceSelections: input4,
                },
              }),
          );
          assert.equal(created.plan.contractVersion, 4);
          assert.deepEqual(
            drafts.dto(await drafts.find(pool, scope, created.plan.id))
              .serviceSelections,
            input4,
          );
          const command = {
            draftId: created.plan.id,
            operationKey: "v4-publish",
            body: {
              expectedPlanRevision: "1",
              expectedCatalogRevision: options4.catalogRevision,
            },
          };
          const result = await service.publish(context, command);
          assert.deepEqual(
            JSON.parse(JSON.stringify(await service.publish(context, command))),
            JSON.parse(JSON.stringify(result)),
          );
          published4 = result.plan;
          assert.equal(published4.contractVersion, 4);
          assert.equal(published4.childAttempts.length, 6);
          const snapshot = published4.serviceSelections[0].resources[0];
          assert.equal(snapshot.durationCount, 3);
          assert.equal(snapshot.baseMinutes, 60);
          assert.equal(snapshot.durationMinutes, 180);
          assert.equal(snapshot.quantity, 1);
          assert.equal(
            snapshot.durationPolicy.revision,
            snapshot.durationPolicyRevision,
          );
          assert.equal(
            (
              await pool.query(
                "SELECT count(*)::int AS n FROM allowance_operations",
              )
            ).rows[0].n,
            before + 1,
          );
        },
      );
      await t.test(
        "v4 pre-start duration-count reduction requires agreement and preserves count-policy snapshots without extra allowance",
        async () => {
          const reduced = structuredClone(input4);
          reduced[0].resources[1].durationCount = 2;
          const command = {
            draftId: published4.id,
            action: "amend",
            operationKey: "v4-agreed-duration-reduction",
            body: guarded(published4, {
              contractVersion: 4,
              serviceSelections: reduced,
              expectedCatalogRevision: options4.catalogRevision,
              reason: "Customer agreed to a shorter selected resource duration",
            }),
          };
          await assert.rejects(commands.execute(context, command), {
            code: "CUSTOMER_AGREEMENT_REQUIRED",
          });
          const before = (
            await pool.query(
              "SELECT count(*)::int AS n FROM allowance_operations",
            )
          ).rows[0].n;
          command.body.customerAgreement = { confirmed: true };
          published4 = (await commands.execute(context, command)).plan;
          assert.equal(published4.contractVersion, 4);
          assert.equal(published4.planRevision, "2");
          assert.equal(
            published4.serviceSelections[0].resources[1].durationCount,
            2,
          );
          assert.equal(
            published4.serviceSelections[0].resources[1].durationMinutes,
            120,
          );
          assert.equal(
            (
              await pool.query(
                "SELECT count(*)::int AS n FROM allowance_operations",
              )
            ).rows[0].n,
            before,
          );
        },
      );
      await t.test(
        "catalog base changes do not rewrite historical v4 count/base/total; existing execution still uses frozen duration",
        async () => {
          const old = await named.getConfiguration(context, "1"),
            changed = structuredClone(old.policy.configuration);
          changed.duration.baseMinutes = 30;
          changed.duration.maxCount = 6;
          await named.saveConfiguration(
            context,
            "1",
            { expectedRevision: old.policy.revision, configuration: changed },
            "v4-new-base",
          );
          const latest = await selections4.readCatalog(pool, scope);
          await assert.rejects(
            selections4.capture(pool, scope, input4, latest.catalogRevision),
            { code: "STALE_DURATION_POLICY" },
          );
          const read =
            await require("../src/repositories/queuePlanProjection").read(
              pool,
              scope,
              await drafts.find(pool, scope, published4.id),
            );
          assert.equal(read.serviceSelections[0].resources[0].baseMinutes, 60);
          assert.equal(
            read.serviceSelections[0].resources[0].durationMinutes,
            180,
          );
          published4 = (
            await commands.execute(context, {
              draftId: read.id,
              action: "call",
              operationKey: "v4-call",
              body: guarded(read, { counterSlug: "first" }),
              serviceCounter: { _id: "1", targetTicketId: read.ticketId },
            })
          ).plan;
          published4 = (
            await commands.execute(context, {
              draftId: read.id,
              action: "start",
              operationKey: "v4-start",
              body: guarded(published4, {
                reservationGroupId: published4.reservationGroups[0].id,
              }),
            })
          ).plan;
          const allocations = published4.allocationGroups[0].members;
          assert.equal(allocations.length, 6);
          const first = allocations.find(
            (a) => a.selectionId === "resource-one",
          );
          assert.equal(
            (new Date(first.expectedEndAt) - new Date(first.startedAt)) / 60000,
            180,
          );
          for (const kind of ["extra", "resource"])
            for (const prior of published4.childAttempts.filter(
              (c) => c.isCurrent && c.selectionKind === kind,
            )) {
              const child = published4.childAttempts.find(
                (c) => c.childAttemptId === prior.childAttemptId,
              );
              published4 = (
                await commands.execute(context, {
                  draftId: read.id,
                  action: "complete",
                  operationKey: "v4-complete-" + child.childAttemptId,
                  body: guarded(published4, {
                    childAttemptId: child.childAttemptId,
                    expectedChildRevision: child.revision,
                    allocationGroupId: child.allocationGroupId,
                  }),
                })
              ).plan;
            }
          assert.equal(published4.state, "served");
          assert.deepEqual(
            parentSelectionTransitions
              .filter((e) => e.id === published4.ticketId)
              .map((e) => e.action),
            ["start", "complete"],
          );
        },
      );
      await t.test(
        "required extras cannot be omitted while optional selection stays optional and selected extras remain dependencies",
        async () => {
          const old = await named.getConfiguration(context, "1"),
            config = structuredClone(old.policy.configuration);
          config.extras.find((extra) => extra.serviceId === "3").selection =
            "required";
          await named.saveConfiguration(
            context,
            "1",
            { expectedRevision: old.policy.revision, configuration: config },
            "v4-required-extra",
          );
          const catalog = await selections4.readCatalog(pool, scope),
            p = catalog.services.find((s) => s.id === "1");
          const chosen = structuredClone(input4);
          chosen[0].resources = chosen[0].resources.slice(0, 1);
          chosen[0].resources[0].durationCount = 6;
          chosen[0].resources[0].durationPolicyRevision =
            p.durationPolicy.revision;
          chosen[0].resources[0].extras = chosen[0].resources[0].extras.filter(
            (extra) => extra.serviceId === "3",
          );
          const accepted = await selections4.capture(
            pool,
            scope,
            chosen,
            catalog.catalogRevision,
          );
          assert.equal(
            accepted.serviceSelections[0].resources[0].extras.length,
            1,
          );
          assert.equal(
            accepted.serviceSelections[0].resources[0].extras[0]
              .selectionRequirement,
            "required",
          );
          assert.equal(
            accepted.serviceSelections[0].resources[0].extras[0].required,
            true,
          );
          chosen[0].resources[0].extras = [];
          await assert.rejects(
            selections4.capture(pool, scope, chosen, catalog.catalogRevision),
            { code: "REQUIRED_EXTRA_MISSING" },
          );
        },
      );
      await t.test(
        "automatic pooled assignment and adjustable duration execute without inventing a physical member or multiplying resource units by duration",
        async () => {
          const catalog = await selections4.readCatalog(pool, scope),
            p = catalog.services.find((s) => s.id === "3");
          assert.equal(p.assignmentPolicy.mode, "automatic");
          assert.equal(
            p.assignmentPolicy.allocationIdentity,
            "pooled_capacity",
          );
          assert.deepEqual(p.resourceMembers, []);
          const input = [
            {
              serviceSelectionId: "automatic-service",
              serviceId: "3",
              resources: [
                {
                  resourceSelectionId: "pooled-resource",
                  resourceMemberId: null,
                  quantity: 2,
                  durationCount: 3,
                  durationPolicyRevision: p.durationPolicy.revision,
                  extras: [],
                },
              ],
            },
          ];
          const captured = await selections4.capture(
            pool,
            scope,
            input,
            catalog.catalogRevision,
          );
          assert.equal(captured.items[0].resource.totalUnits, 2);
          assert.equal(captured.items[0].durationMinutes, 90);
          const created = await transaction(
            { permission: "tenant.queue.operate" },
            (client) =>
              drafts.command(client, scope, {
                action: "create",
                operationKey: "v4-automatic-draft",
                body: {
                  contractVersion: 4,
                  customer: { name: "Automatic pooled verification" },
                  catalogRevision: catalog.catalogRevision,
                  serviceSelections: input,
                },
              }),
          );
          let plan = (
            await service.publish(context, {
              draftId: created.plan.id,
              operationKey: "v4-automatic-publish",
              body: {
                expectedPlanRevision: "1",
                expectedCatalogRevision: catalog.catalogRevision,
              },
            })
          ).plan;
          plan = (
            await commands.execute(context, {
              draftId: plan.id,
              action: "call",
              operationKey: "v4-automatic-call",
              body: guarded(plan, { counterSlug: "second" }),
              serviceCounter: { _id: "2", targetTicketId: plan.ticketId },
            })
          ).plan;
          plan = (
            await commands.execute(context, {
              draftId: plan.id,
              action: "start",
              operationKey: "v4-automatic-start",
              body: guarded(plan, {
                reservationGroupId: plan.reservationGroups[0].id,
              }),
            })
          ).plan;
          const allocation = plan.allocationGroups[0].members[0];
          assert.equal(allocation.units, 2);
          assert.equal(allocation.resourceMemberId, null);
          assert.equal(
            (new Date(allocation.expectedEndAt) -
              new Date(allocation.startedAt)) /
              60000,
            90,
          );
          const child = plan.childAttempts[0];
          plan = (
            await commands.execute(context, {
              draftId: plan.id,
              action: "complete",
              operationKey: "v4-automatic-complete",
              body: guarded(plan, {
                childAttemptId: child.childAttemptId,
                expectedChildRevision: child.revision,
                allocationGroupId: child.allocationGroupId,
              }),
            })
          ).plan;
          assert.equal(plan.state, "served");
        },
      );
      await t.test(
        "an unconfigured optional extra remains unavailable without blocking an otherwise valid parent selection",
        async () => {
          await pool.query(`INSERT INTO vendor_services(id,tenant_id,name,duration_minutes,is_active) VALUES(5,1,'Unconfigured optional add-on',30,TRUE);
          INSERT INTO location_services VALUES(5,1,10,TRUE);INSERT INTO service_resource_requirements VALUES(5,1,10,2,1,1);`);
          const old = await named.getConfiguration(context, "1"),
            configuration = structuredClone(old.policy.configuration);
          configuration.extras.push({ serviceId: "5", selection: "optional" });
          await named.saveConfiguration(
            context,
            "1",
            { expectedRevision: old.policy.revision, configuration },
            "v4-unconfigured-optional",
          );
          const catalog = await selections4.readCatalog(pool, scope),
            parent = catalog.services.find((s) => s.id === "1"),
            extra = parent.extras.find((e) => e.serviceId === "5");
          assert.equal(parent.resourceReady, true);
          assert.equal(extra.configured, false);
          assert.equal(extra.resourceReady, false);
          assert.equal(extra.name, "Unconfigured optional add-on");
          const chosen = structuredClone(input4);
          chosen[0].resources = chosen[0].resources.slice(0, 1);
          chosen[0].resources[0].durationCount = 6;
          chosen[0].resources[0].durationPolicyRevision =
            parent.durationPolicy.revision;
          assert.equal(
            (
              await selections4.capture(
                pool,
                scope,
                chosen,
                catalog.catalogRevision,
              )
            ).items.length,
            3,
          );
          configuration.extras.find((e) => e.serviceId === "5").selection =
            "required";
          const latest = await named.getConfiguration(context, "1");
          await named.saveConfiguration(
            context,
            "1",
            { expectedRevision: latest.policy.revision, configuration },
            "v4-unconfigured-required",
          );
          const unavailable = await selections4.readCatalog(pool, scope),
            required = unavailable.services.find((s) => s.id === "1");
          assert.equal(required.resourceReady, false);
          chosen[0].resources[0].durationPolicyRevision =
            required.durationPolicy.revision;
          await assert.rejects(
            selections4.capture(
              pool,
              scope,
              chosen,
              unavailable.catalogRevision,
            ),
            { code: "REQUIRED_EXTRA_MISSING" },
          );
          configuration.extras.find((e) => e.serviceId === "5").selection =
            "optional";
          const current = await named.getConfiguration(context, "1");
          await named.saveConfiguration(
            context,
            "1",
            { expectedRevision: current.policy.revision, configuration },
            "v4-restore-optional",
          );
        },
      );
      await t.test(
        "nested extra requirements are rejected at configuration and capture rather than silently omitted",
        async () => {
          const old = await named.getConfiguration(context, "3"),
            nested = structuredClone(old.policy.configuration);
          nested.extras = [{ serviceId: "4", selection: "required" }];
          await assert.rejects(
            named.saveConfiguration(
              context,
              "3",
              { expectedRevision: old.policy.revision, configuration: nested },
              "v4-reject-nested-extra",
            ),
            { code: "UNSUPPORTED_EXTRA_NESTING" },
          );
          assert.equal(
            (await named.getConfiguration(context, "3")).policy.revision,
            old.policy.revision,
          );
          await pool.query(
            "UPDATE queue_service_policies SET configuration=$1::jsonb WHERE tenant_id=1 AND location_id=10 AND service_id=3",
            [JSON.stringify(nested)],
          );
          try {
            const catalog = await selections4.readCatalog(pool, scope),
              parent = catalog.services.find((s) => s.id === "1");
            assert.equal(parent.resourceReady, false);
            const chosen = structuredClone(input4);
            chosen[0].resources = chosen[0].resources.slice(0, 1);
            chosen[0].resources[0].durationCount = 6;
            chosen[0].resources[0].durationPolicyRevision =
              parent.durationPolicy.revision;
            await assert.rejects(
              selections4.capture(pool, scope, chosen, catalog.catalogRevision),
              { code: "UNSUPPORTED_EXTRA_NESTING" },
            );
          } finally {
            await pool.query(
              "UPDATE queue_service_policies SET configuration=$1::jsonb WHERE tenant_id=1 AND location_id=10 AND service_id=3",
              [JSON.stringify(old.policy.configuration)],
            );
          }
        },
      );
      await t.test(
        "legacy minute-based capture cannot bypass an extra configured under the v4 count policy",
        async () => {
          await named.savePolicy(
            context,
            "2",
            {
              expectedRevision: "0",
              selectionMode: "pooled",
              durationOptionsMinutes: [180],
              allowedExtraServiceIds: ["3"],
            },
            "legacy-root-with-v4-extra",
          );
          const catalog = await selections.readCatalog(pool, scope),
            input = [
              {
                serviceSelectionId: "legacy-root",
                serviceId: "2",
                resources: [
                  {
                    resourceSelectionId: "legacy-resource",
                    resourceMemberId: null,
                    quantity: 1,
                    durationMinutes: 180,
                    extras: [
                      {
                        extraSelectionId: "configured-extra",
                        serviceId: "3",
                        quantity: 1,
                        durationMinutes: 120,
                      },
                    ],
                  },
                ],
              },
            ];
          await assert.rejects(
            selections.capture(pool, scope, input, catalog.catalogRevision),
            { code: "USE_SERVICE_SELECTION_V4" },
          );
        },
      );
      await t.test(
        "v4 truly multiple root services publish once and execute named resources plus pooled resources without counting extras as roots",
        async () => {
          const workflow = (await workflowService.get(context)).workflow;
          await workflowService.put(
            context,
            {
              expectedConfigurationRevision: workflow.configurationRevision,
              mode: "linear",
              stations: [],
              stages: [],
            },
            "v4-multiple-roots-linear",
          );
          const catalog = await selections4.readCatalog(pool, scope),
            primary = catalog.services.find((s) => s.id === "1"),
            secondary = catalog.services.find((s) => s.id === "3");
          const input = [
            {
              serviceSelectionId: "primary-service",
              serviceId: "1",
              resources: [
                {
                  resourceSelectionId: "named-resource",
                  resourceMemberId: memberIds[0],
                  quantity: 1,
                  durationCount: 6,
                  durationPolicyRevision: primary.durationPolicy.revision,
                  extras: [
                    {
                      extraSelectionId: "primary-extra",
                      serviceId: "3",
                      quantity: 1,
                      durationCount: 4,
                      durationPolicyRevision: secondary.durationPolicy.revision,
                    },
                  ],
                },
              ],
            },
            {
              serviceSelectionId: "secondary-service",
              serviceId: "3",
              resources: [
                {
                  resourceSelectionId: "pooled-resource",
                  resourceMemberId: null,
                  quantity: 2,
                  durationCount: 3,
                  durationPolicyRevision: secondary.durationPolicy.revision,
                  extras: [],
                },
              ],
            },
          ];
          const duplicate = structuredClone(input);
          duplicate.push({
            ...structuredClone(input[0]),
            serviceSelectionId: "duplicate-primary",
          });
          assert.throws(() => selections4.validateSelections(duplicate), {
            code: "DUPLICATE_ROOT_SERVICE",
          });
          const before = (
            await pool.query(
              "SELECT count(*)::int AS n FROM allowance_operations",
            )
          ).rows[0].n;
          const created = await transaction(
            { permission: "tenant.queue.operate" },
            (client) =>
              drafts.command(client, scope, {
                action: "create",
                operationKey: "v4-multiple-root-draft",
                body: {
                  contractVersion: 4,
                  customer: { name: "Accountless multiple root services" },
                  catalogRevision: catalog.catalogRevision,
                  serviceSelections: input,
                },
              }),
          );
          const publication = {
            draftId: created.plan.id,
            operationKey: "v4-multiple-root-publish",
            body: {
              expectedPlanRevision: "1",
              expectedCatalogRevision: catalog.catalogRevision,
            },
          };
          let plan = (await service.publish(context, publication)).plan;
          assert.equal(plan.serviceSelections.length, 2);
          assert.equal(plan.serviceSelections[0].resources[0].extras.length, 1);
          assert.equal(plan.childAttempts.length, 3);
          assert.equal(
            (
              await pool.query(
                "SELECT count(*)::int AS n FROM allowance_operations",
              )
            ).rows[0].n,
            before + 1,
          );
          assert.equal(
            (await service.publish(context, publication)).plan.ticketId,
            plan.ticketId,
          );
          plan = (
            await commands.execute(context, {
              draftId: plan.id,
              action: "call",
              operationKey: "v4-multiple-root-call",
              body: guarded(plan, { counterSlug: "first" }),
              serviceCounter: { _id: "1", targetTicketId: plan.ticketId },
            })
          ).plan;
          assert.ok(plan.allowedActions.includes('cancelProtection'));
          const heldBeforeArchive=(await pool.query("SELECT id::text,state FROM resource_ledger_reservations WHERE ticket_id=$1 ORDER BY id",[plan.ticketId])).rows;
          await pool.query("UPDATE location_resource_pools SET archived_at=clock_timestamp(),archived_by_user_id=1 WHERE id=2");
          await assert.rejects(commands.execute(context,{
            draftId:plan.id,action:'start',operationKey:'archived-pool-start-reject',
            body:guarded(plan,{reservationGroupId:plan.reservationGroups[0].id})
          }),{code:'RESOURCE_POOL_ARCHIVED'});
          assert.deepEqual((await pool.query("SELECT id::text,state FROM resource_ledger_reservations WHERE ticket_id=$1 ORDER BY id",[plan.ticketId])).rows,heldBeforeArchive);
          assert.equal((await pool.query("SELECT count(*)::int n FROM resource_allocations WHERE ticket_id=$1",[plan.ticketId])).rows[0].n,0);
          const cancel={draftId:plan.id,action:'cancelProtection',operationKey:'archive-recovery-cancel',body:guarded(plan,{reservationGroupId:plan.reservationGroups[0].id,reason:'Pool archived; explicit release of unstarted protection'})};
          plan=(await commands.execute(context,cancel)).plan;
          assert.equal(plan.state,'waiting');
          assert.equal((await pool.query("SELECT count(*)::int n FROM resource_ledger_reservations WHERE ticket_id=$1 AND state='protected'",[plan.ticketId])).rows[0].n,0);
          assert.equal((await commands.execute(context,cancel)).plan.state,'waiting');
          await assert.rejects(commands.execute(context,{...cancel,body:{...cancel.body,reason:'Changed reason'}}),{code:'IDEMPOTENCY_CONFLICT'});
          // Restore only disposable test metadata to exercise completion after the subsequent real archive operation.
          await pool.query("UPDATE location_resource_pools SET archived_at=NULL,archived_by_user_id=NULL WHERE id=2");
          plan=(await commands.execute(context,{draftId:plan.id,action:'call',operationKey:'after-archive-recovery-call',body:guarded(plan,{counterSlug:'first'}),serviceCounter:{_id:'1',targetTicketId:plan.ticketId}})).plan;
          plan = (
            await commands.execute(context, {
              draftId: plan.id,
              action: "start",
              operationKey: "v4-multiple-root-start",
              body: guarded(plan, {
                reservationGroupId: plan.reservationGroups.at(-1).id,
              }),
            })
          ).plan;
          assert.equal(plan.allowedActions.includes('cancelProtection'),false);
          await assert.rejects(commands.execute(context,{draftId:plan.id,action:'cancelProtection',operationKey:'reject-cancel-started',body:guarded(plan,{reservationGroupId:plan.reservationGroups.at(-1).id,reason:'Cannot cancel started work'})}),{code:'INVALID_STATE'});
          const members = plan.allocationGroups[0].members;
          assert.equal(members.length, 3);
          const lifecycle=require('../src/services/resourcePoolLifecycleService');
          const archiveClient=await pool.connect();
          const stateBeforeArchive=(await pool.query("SELECT id::text,released_at FROM resource_allocations WHERE ticket_id=$1 ORDER BY id",[plan.ticketId])).rows;
          try {
            await archiveClient.query('BEGIN');
            await archiveClient.query('SELECT id FROM store_locations WHERE id=10 FOR UPDATE');
            const deps=await lifecycle.dependencies(archiveClient,scope,'2');
            assert.ok(deps.some(d=>d.code==='allocations'));
            await lifecycle.execute(archiveClient,scope,{action:'archivePool',poolId:'2',operationKey:randomUUID(),version:'test'},async()=>({archived:true}),{version:'test'});
            await archiveClient.query('COMMIT');
          } finally {await archiveClient.query('ROLLBACK');archiveClient.release();}
          assert.deepEqual((await pool.query("SELECT id::text,released_at FROM resource_allocations WHERE ticket_id=$1 ORDER BY id",[plan.ticketId])).rows,stateBeforeArchive);
          assert.equal((await selections.readCatalog(pool,scope)).services.find(s=>s.id==='3').resourceReady,false);
          assert.equal((await named.listMembers(context,'2')).pool.archived_at!==null,true);
          await assert.rejects(named.saveMember(context,{body:{poolId:'2',name:'Archived pool new member',isActive:true},operationKey:randomUUID()}),{code:'RESOURCE_POOL_ARCHIVED'});
          assert.equal(
            new Set(members.map((a) => a.startedAt.toISOString())).size,
            1,
          );
          assert.equal(
            members
              .filter((a) => a.poolId === "2")
              .reduce((sum, a) => sum + a.units, 0),
            3,
          );
          for (const kind of ["extra", "resource"])
            for (const prior of plan.childAttempts.filter(
              (c) => c.isCurrent && c.selectionKind === kind,
            )) {
              const child = plan.childAttempts.find(
                (c) => c.childAttemptId === prior.childAttemptId,
              );
              plan = (
                await commands.execute(context, {
                  draftId: plan.id,
                  action: "complete",
                  operationKey:
                    "v4-multiple-root-complete-" + child.childAttemptId,
                  body: guarded(plan, {
                    childAttemptId: child.childAttemptId,
                    expectedChildRevision: child.revision,
                    allocationGroupId: child.allocationGroupId,
                  }),
                })
              ).plan;
            }
          assert.equal(plan.state, "served");
          assert.deepEqual(
            parentSelectionTransitions
              .filter((e) => e.id === plan.ticketId)
              .map((e) => e.action),
            ["start", "complete"],
          );
          assert.equal(
            (
              await pool.query(
                "SELECT count(*)::int AS n FROM allowance_operations",
              )
            ).rows[0].n,
            before + 1,
          );
        },
      );
      await t.test('named display renames preserve stable IDs and frozen history; maintenance retains registry and reduces active capacity',async()=>{
        const before=(await pool.query("SELECT selection_id,snapshot FROM queue_selection_definitions WHERE resource_member_id=$1 ORDER BY ticket_id,plan_revision,selection_id",[memberIds[0]])).rows;
        const old=(await named.listMembers(context,'1')).members.find(m=>m.id===memberIds[0]);
        const capacity=(await pool.query('SELECT capacity FROM location_resource_pools WHERE id=1')).rows[0].capacity;
        const command={memberId:old.id,body:{name:'Court1 - Borak',isActive:true,expectedRevision:old.revision},operationKey:randomUUID()};
        const renamed=(await named.saveMember(context,command)).member;
        assert.equal(renamed.id,old.id);assert.equal(renamed.name,'Court1 - Borak');
        assert.deepEqual((await named.saveMember(context,command)).member,renamed);
        await assert.rejects(named.saveMember(context,{memberId:memberIds[1],body:{name:' court1 - borak ',isActive:true,expectedRevision:(await named.listMembers(context,'1')).members.find(m=>m.id===memberIds[1]).revision},operationKey:randomUUID()}),{code:'RESOURCE_NAME_CONFLICT'});
        const archived=(await named.saveMember(context,{memberId:renamed.id,body:{name:renamed.name,isActive:false,expectedRevision:renamed.revision},operationKey:randomUUID()})).member;
        assert.equal(archived.id,renamed.id);assert.equal(archived.isActive,false);
        assert.equal((await named.listMembers(context,'1')).members.find(m=>m.id===archived.id).availability.state,'inactive');
        assert.equal((await pool.query('SELECT capacity FROM location_resource_pools WHERE id=1')).rows[0].capacity,capacity-1);
        assert.deepEqual((await pool.query("SELECT selection_id,snapshot FROM queue_selection_definitions WHERE resource_member_id=$1 ORDER BY ticket_id,plan_revision,selection_id",[memberIds[0]])).rows,before);
      });
      await t.test('named enable-disable is reversible, replay-safe and permission-scoped while active capacity follows member state',async()=>{
        const oldPolicy=await named.getConfiguration(context,'1');
        await named.saveConfiguration(context,'1',{expectedRevision:oldPolicy.policy.revision,configuration:{...oldPolicy.policy.configuration,extras:[]}},randomUUID());
        const original=(await named.listMembers(context,'1')).members.find(m=>m.id===memberIds[0]);
        const capacity=(await pool.query('SELECT capacity FROM location_resource_pools WHERE id=1')).rows[0].capacity;
        const enable={memberId:original.id,body:{name:original.name,isActive:true,expectedRevision:original.revision},operationKey:randomUUID()};
        const enabled=(await named.saveMember(context,enable)).member;
        const disable={memberId:enabled.id,body:{name:enabled.name,isActive:false,expectedRevision:enabled.revision},operationKey:randomUUID()};
        const disabled=(await named.saveMember(context,disable)).member;
        assert.equal((await pool.query('SELECT capacity FROM location_resource_pools WHERE id=1')).rows[0].capacity,capacity);
        assert.equal(disabled.id,original.id);assert.equal(disabled.name,original.name);assert.equal(disabled.isActive,false);
        assert.deepEqual((await named.saveMember(context,disable)).member,disabled);
        await assert.rejects(named.saveMember(context,{...disable,body:{...disable.body,isActive:true}}),{code:'IDEMPOTENCY_CONFLICT'});
        await assert.rejects(named.saveMember(context,{...disable,operationKey:randomUUID()}),{code:'STALE_REVISION'});
        await assert.rejects(named.saveMember({...context,actorUserId:'2'},{...disable,operationKey:randomUUID()}),{statusCode:403});
        await assert.rejects(named.saveMember({...context,location:{_id:'999'}},{...disable,operationKey:randomUUID()}),{statusCode:404});
        const catalog=await selections4.readCatalog(pool,scope),choice=catalog.services.find(s=>s.id==='1');
        assert.equal(choice.resourceMembers.find(m=>m.id===disabled.id).isActive,false);
        assert.equal(choice.resourceMembers.filter(m=>m.isActive).length,3);
        const input=[{serviceSelectionId:'toggle-root',serviceId:'1',resources:[{resourceSelectionId:'toggle-resource',resourceMemberId:disabled.id,quantity:1,durationCount:1,durationPolicyRevision:choice.durationPolicy.revision,extras:[]}]}];
        await assert.rejects(selections4.capture(pool,scope,input,catalog.catalogRevision),{code:'NAMED_RESOURCE_REQUIRED'});
        const restored=(await named.saveMember(context,{memberId:disabled.id,body:{name:disabled.name,isActive:true,expectedRevision:disabled.revision},operationKey:randomUUID()})).member;
        assert.equal(restored.id,original.id);assert.equal(restored.isActive,true);
        const fresh=await selections4.readCatalog(pool,scope);
        assert.ok(await selections4.capture(pool,scope,input,fresh.catalogRevision));
        assert.equal((await pool.query('SELECT capacity FROM location_resource_pools WHERE id=1')).rows[0].capacity,capacity+1);
        const historical=(await pool.query('SELECT name,is_active FROM resource_pool_member_versions WHERE member_id=$1 AND revision=$2',[original.id,original.revision])).rows[0];
        assert.equal(historical.name,original.name);assert.equal(historical.is_active,original.isActive);
      });
      await t.test('concurrent enable requests serialize the last capacity increment at the maximum of one hundred',async()=>{
        await pool.query("INSERT INTO location_resource_pools(id,tenant_id,location_id,revision,name,capacity,tracking_enabled) VALUES(9999,1,10,1,'Toggle concurrency QA',1,TRUE)");
        const a=(await named.saveMember(context,{body:{poolId:'9999',name:'Toggle A',isActive:false},operationKey:randomUUID()})).member;
        const b=(await named.saveMember(context,{body:{poolId:'9999',name:'Toggle B',isActive:false},operationKey:randomUUID()})).member;
        const baselineCapacity=(await named.listMembers(context,'9999')).pool.capacity;
        await pool.query('UPDATE location_resource_pools SET capacity=99 WHERE id=9999');
        const results=await Promise.allSettled([a,b].map(m=>named.saveMember(context,{memberId:m.id,body:{name:m.name,isActive:true,expectedRevision:m.revision},operationKey:randomUUID()})));
        assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
        assert.equal(results.find(r=>r.status==='rejected').reason.code,'RESOURCE_CAPACITY_EXCEEDED');
        const registry=await named.listMembers(context,'9999');assert.equal(registry.members.filter(m=>m.isActive).length,1);assert.equal(registry.pool.capacity,100);
        const winner=registry.members.find(m=>m.isActive);
        const ticket=(await pool.query("INSERT INTO tickets(tenant_id,location_id,ticket_number,status) VALUES(1,10,'Anonymous toggle QA','called') RETURNING id::text")).rows[0].id;
        const allocation=(await pool.query("INSERT INTO resource_allocations(tenant_id,location_id,ticket_id,pool_id,pool_revision,units,started_at,expected_end_at) VALUES(1,10,$1,9999,1,1,clock_timestamp(),clock_timestamp()+interval '30 minutes') RETURNING id::text",[ticket])).rows[0].id;
        await assert.rejects(named.saveMember(context,{memberId:winner.id,body:{name:winner.name,isActive:false,expectedRevision:winner.revision},operationKey:randomUUID()}),{code:'RESOURCE_IN_USE'});
        assert.equal((await pool.query('SELECT released_at FROM resource_allocations WHERE id=$1',[allocation])).rows[0].released_at,null);
        await pool.query("UPDATE resource_allocations SET released_at=clock_timestamp(),outcome='completed' WHERE id=$1",[allocation]);
        const disabled=(await named.saveMember(context,{memberId:winner.id,body:{name:winner.name,isActive:false,expectedRevision:winner.revision},operationKey:randomUUID()})).member;
        const sameMember=await Promise.allSettled([1,2].map(()=>named.saveMember(context,{memberId:disabled.id,body:{name:disabled.name,isActive:true,expectedRevision:disabled.revision},operationKey:randomUUID()})));
        assert.equal(sameMember.filter(r=>r.status==='fulfilled').length,1);assert.equal(sameMember.find(r=>r.status==='rejected').reason.code,'STALE_REVISION');
        assert.equal((await named.listMembers(context,'9999')).pool.capacity,100);
        await pool.query('UPDATE location_resource_pools SET capacity=$1 WHERE id=9999',[baselineCapacity]);
        assert.equal((await named.listMembers(context,'9999')).pool.capacity,baselineCapacity);

      });
      await t.test('waiting named plan cannot Call after disable or reenable until explicit amendment; protected and occupied toggles never release work',async()=>{
        const catalog=await selections4.readCatalog(pool,scope),choice=catalog.services.find(s=>s.id==='1'),member=choice.resourceMembers.find(m=>m.id===memberIds[0]);
        const input=[{serviceSelectionId:'toggle-root',serviceId:'1',resources:[{resourceSelectionId:'toggle-resource',resourceMemberId:member.id,quantity:1,durationCount:1,durationPolicyRevision:choice.durationPolicy.revision,extras:[]}]}];
        const created=await transaction({permission:'tenant.queue.operate'},client=>drafts.command(client,scope,{action:'create',operationKey:randomUUID(),body:{contractVersion:4,customer:{name:'Toggle lifecycle QA'},catalogRevision:catalog.catalogRevision,serviceSelections:input}}));
        let plan=(await service.publish(context,{draftId:created.plan.id,operationKey:randomUUID(),body:{expectedPlanRevision:'1',expectedCatalogRevision:catalog.catalogRevision}})).plan;
        const disabled=(await named.saveMember(context,{memberId:member.id,body:{name:member.name,isActive:false,expectedRevision:member.revision},operationKey:randomUUID()})).member;
        const call=()=>commands.execute(context,{draftId:plan.id,action:'call',operationKey:randomUUID(),body:guarded(plan,{counterSlug:'first'}),serviceCounter:{_id:'1',targetTicketId:plan.ticketId}});
        await assert.rejects(call(),{code:'STALE_REVISION'});
        const enabled=(await named.saveMember(context,{memberId:member.id,body:{name:member.name,isActive:true,expectedRevision:disabled.revision},operationKey:randomUUID()})).member;
        await assert.rejects(call(),{code:'STALE_REVISION'});
        const fresh=await selections4.readCatalog(pool,scope);
        plan=(await commands.execute(context,{draftId:plan.id,action:'amend',operationKey:randomUUID(),body:guarded(plan,{contractVersion:4,serviceSelections:input,expectedCatalogRevision:fresh.catalogRevision,reason:'Explicit acceptance of reenabled named resource',customerAgreement:{confirmed:true}})})).plan;
        plan=(await call()).plan;
        const command={memberId:member.id,body:{name:member.name,isActive:false,expectedRevision:enabled.revision},operationKey:randomUUID()};
        await assert.rejects(named.saveMember(context,command),{code:'RESOURCE_IN_USE'});
        await assert.rejects(named.archiveMember(context,{memberId:member.id,body:{expectedRevision:enabled.revision},operationKey:randomUUID()}),{code:'RESOURCE_IN_USE'});
        assert.equal((await pool.query("SELECT count(*)::int n FROM resource_ledger_reservations WHERE ticket_id=$1 AND state='protected'",[plan.ticketId])).rows[0].n,1);
        plan=(await commands.execute(context,{draftId:plan.id,action:'start',operationKey:randomUUID(),body:guarded(plan,{reservationGroupId:plan.reservationGroups.find(g=>g.state==='protected').id})})).plan;
        await assert.rejects(named.saveMember(context,{...command,operationKey:randomUUID()}),{code:'RESOURCE_IN_USE'});
        await assert.rejects(named.archiveMember(context,{memberId:member.id,body:{expectedRevision:enabled.revision},operationKey:randomUUID()}),{code:'RESOURCE_IN_USE'});
        assert.equal((await pool.query("SELECT count(*)::int n FROM resource_allocations WHERE ticket_id=$1 AND released_at IS NULL",[plan.ticketId])).rows[0].n,1);
        const child=plan.childAttempts.find(c=>c.isCurrent&&c.state==='in_service');
        plan=(await commands.execute(context,{draftId:plan.id,action:'complete',operationKey:randomUUID(),body:guarded(plan,{childAttemptId:child.childAttemptId,expectedChildRevision:child.revision,allocationGroupId:child.allocationGroupId})})).plan;
        assert.equal(plan.state,'served');
        assert.equal((await named.listMembers(context,'1')).members.find(m=>m.id===member.id).isActive,true);
      });
      await t.test('concurrent Call and disable serialize: protection or disabled state wins, never both',async()=>{
        let catalog=await selections4.readCatalog(pool,scope);const choice=catalog.services.find(s=>s.id==='1'),member=choice.resourceMembers.find(m=>m.id===memberIds[0]);
        const input=[{serviceSelectionId:'toggle-race-root',serviceId:'1',resources:[{resourceSelectionId:'toggle-race-resource',resourceMemberId:member.id,quantity:1,durationCount:1,durationPolicyRevision:choice.durationPolicy.revision,extras:[]}]}];
        const created=await transaction({permission:'tenant.queue.operate'},client=>drafts.command(client,scope,{action:'create',operationKey:randomUUID(),body:{contractVersion:4,customer:{name:'Toggle Call race QA'},catalogRevision:catalog.catalogRevision,serviceSelections:input}}));
        let plan=(await service.publish(context,{draftId:created.plan.id,operationKey:randomUUID(),body:{expectedPlanRevision:'1',expectedCatalogRevision:catalog.catalogRevision}})).plan;
        const call=()=>commands.execute(context,{draftId:plan.id,action:'call',operationKey:randomUUID(),body:guarded(plan,{counterSlug:'first'}),serviceCounter:{_id:'1',targetTicketId:plan.ticketId}});
        const results=await Promise.allSettled([call(),named.saveMember(context,{memberId:member.id,body:{name:member.name,isActive:false,expectedRevision:member.revision},operationKey:randomUUID()})]);
        assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
        if(results[0].status==='fulfilled'){
          plan=results[0].value.plan;assert.equal(results[1].reason.code,'RESOURCE_IN_USE');
          assert.equal((await named.listMembers(context,'1')).members.find(m=>m.id===member.id).isActive,true);
        }else{
          assert.equal(results[0].reason.code,'STALE_REVISION');
          assert.equal((await pool.query("SELECT count(*)::int n FROM resource_ledger_reservations WHERE ticket_id=$1 AND state='protected'",[plan.ticketId])).rows[0].n,0);
          const disabled=results[1].value.member;
          await named.saveMember(context,{memberId:disabled.id,body:{name:disabled.name,isActive:true,expectedRevision:disabled.revision},operationKey:randomUUID()});
          catalog=await selections4.readCatalog(pool,scope);
          plan=(await commands.execute(context,{draftId:plan.id,action:'amend',operationKey:randomUUID(),body:guarded(plan,{contractVersion:4,serviceSelections:input,expectedCatalogRevision:catalog.catalogRevision,reason:'Explicit acceptance after disable won the race',customerAgreement:{confirmed:true}})})).plan;
          plan=(await call()).plan;
        }
        plan=(await commands.execute(context,{draftId:plan.id,action:'start',operationKey:randomUUID(),body:guarded(plan,{reservationGroupId:plan.reservationGroups.find(g=>g.state==='protected').id})})).plan;
        const child=plan.childAttempts.find(c=>c.isCurrent&&c.state==='in_service');
        plan=(await commands.execute(context,{draftId:plan.id,action:'complete',operationKey:randomUUID(),body:guarded(plan,{childAttemptId:child.childAttemptId,expectedChildRevision:child.revision,allocationGroupId:child.allocationGroupId})})).plan;
        assert.equal(plan.state,'served');
      });
      await t.test('member archive is separate from maintenance, idempotent and preserves configured pool capacity; archived edits cannot restore it',async()=>{
        const registry=await named.listMembers(context,'9999'),member=registry.members.find(m=>m.isActive&&!m.archivedAt);
        const command={memberId:member.id,body:{expectedRevision:member.revision},operationKey:randomUUID()};
        const result=await named.archiveMember(context,command),archived=result.member;
        assert.equal(archived.id,member.id);assert.equal(archived.name,member.name);assert.equal(archived.isActive,true);assert.ok(archived.archivedAt);
        assert.equal((await pool.query('SELECT m.archived_at=v.archived_at same FROM resource_pool_members m JOIN resource_pool_member_versions v ON(v.member_id,v.revision)=(m.id,m.revision) WHERE m.id=$1',[member.id])).rows[0].same,true);
        assert.deepEqual(JSON.parse(JSON.stringify(await named.archiveMember(context,command))),JSON.parse(JSON.stringify(result)));
        await assert.rejects(named.archiveMember(context,{...command,body:{expectedRevision:'999'}}),{code:'IDEMPOTENCY_CONFLICT'});
        await assert.rejects(named.archiveMember(context,{...command,operationKey:randomUUID()}),{code:'STALE_REVISION'});
        await assert.rejects(named.saveMember(context,{memberId:member.id,body:{name:member.name,isActive:true,expectedRevision:archived.revision},operationKey:randomUUID()}),{code:'RESOURCE_MEMBER_ARCHIVED'});
        await assert.rejects(named.archiveMember({...context,actorUserId:'2'},{...command,operationKey:randomUUID()}),{statusCode:403});
        await assert.rejects(named.archiveMember({...context,location:{_id:'999'}},{...command,operationKey:randomUUID()}),{statusCode:404});
        const old=(await pool.query('SELECT name,is_active,archived_at FROM resource_pool_member_versions WHERE member_id=$1 AND revision=$2',[member.id,member.revision])).rows[0];
        assert.equal(old.name,member.name);assert.equal(old.is_active,true);assert.equal(old.archived_at,null);
        const again=await named.archiveMember(context,{memberId:member.id,body:{expectedRevision:archived.revision},operationKey:randomUUID()});assert.equal(again.member.revision,archived.revision);
        const listed=await named.listMembers(context,'9999');assert.equal(listed.members.find(m=>m.id===member.id).availability.state,'archived');
        const fresh=(await named.saveMember(context,{body:{poolId:'9999',name:'Archive replacement QA',isActive:true},operationKey:randomUUID()})).member;
        assert.equal(fresh.isActive,true);assert.equal(fresh.archivedAt,null);assert.equal(listed.pool.capacity,registry.pool.capacity);
        assert.equal((await named.listMembers(context,'9999')).pool.capacity,registry.pool.capacity+1);
      });
      await t.test('member archive and maintenance race has one revision winner without conflating the states',async()=>{
        const member=(await named.listMembers(context,'9999')).members.find(m=>m.isActive&&!m.archivedAt);
        const results=await Promise.allSettled([
          named.archiveMember(context,{memberId:member.id,body:{expectedRevision:member.revision},operationKey:randomUUID()}),
          named.saveMember(context,{memberId:member.id,body:{name:member.name,isActive:false,expectedRevision:member.revision},operationKey:randomUUID()})
        ]);
        assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'STALE_REVISION');
        const current=(await named.listMembers(context,'9999')).members.find(m=>m.id===member.id);
        if(current.archivedAt)assert.equal(current.isActive,true);else{assert.equal(current.isActive,false);const archived=(await named.archiveMember(context,{memberId:current.id,body:{expectedRevision:current.revision},operationKey:randomUUID()})).member;assert.equal(archived.isActive,false);assert.ok(archived.archivedAt);}
      });
      await t.test('archived member keeps its enabled preference but cannot be captured or called; frozen history survives explicit replacement',async()=>{
        let catalog=await selections4.readCatalog(pool,scope);const choice=catalog.services.find(s=>s.id==='1'),member=choice.resourceMembers.find(m=>m.id===memberIds[0]);
        const input=[{serviceSelectionId:'archive-guard-root',serviceId:'1',resources:[{resourceSelectionId:'archive-guard-resource',resourceMemberId:member.id,quantity:1,durationCount:1,durationPolicyRevision:choice.durationPolicy.revision,extras:[]}]}];
        const created=await transaction({permission:'tenant.queue.operate'},client=>drafts.command(client,scope,{action:'create',operationKey:randomUUID(),body:{contractVersion:4,customer:{name:'Explicit member archive QA'},catalogRevision:catalog.catalogRevision,serviceSelections:input}}));
        let plan=(await service.publish(context,{draftId:created.plan.id,operationKey:randomUUID(),body:{expectedPlanRevision:'1',expectedCatalogRevision:catalog.catalogRevision}})).plan;
        const frozen=(await pool.query('SELECT items FROM ticket_service_plans WHERE ticket_id=$1',[plan.ticketId])).rows[0].items;
        const archived=(await named.archiveMember(context,{memberId:member.id,body:{expectedRevision:member.revision},operationKey:randomUUID()})).member;
        assert.equal(archived.isActive,true);assert.ok(archived.archivedAt);
        catalog=await selections4.readCatalog(pool,scope);
        assert.ok(catalog.services.find(s=>s.id==='1').resourceMembers.find(m=>m.id===member.id).archivedAt);
        await assert.rejects(selections4.capture(pool,scope,input,catalog.catalogRevision),{code:'NAMED_RESOURCE_REQUIRED'});
        await assert.rejects(commands.execute(context,{draftId:plan.id,action:'call',operationKey:randomUUID(),body:guarded(plan,{counterSlug:'first'}),serviceCounter:{_id:'1',targetTicketId:plan.ticketId}}),{code:'RESOURCE_MEMBER_ARCHIVED'});
        assert.equal((await pool.query("SELECT count(*)::int n FROM resource_ledger_reservations WHERE ticket_id=$1 AND state='protected'",[plan.ticketId])).rows[0].n,0);
        assert.deepEqual((await pool.query('SELECT items FROM ticket_service_plans WHERE ticket_id=$1',[plan.ticketId])).rows[0].items,frozen);
        const replacement=structuredClone(input);replacement[0].resources[0].resourceSelectionId='archive-replacement-resource';replacement[0].resources[0].resourceMemberId=memberIds[1];
        plan=(await commands.execute(context,{draftId:plan.id,action:'amend',operationKey:randomUUID(),body:guarded(plan,{contractVersion:4,serviceSelections:replacement,expectedCatalogRevision:catalog.catalogRevision,reason:'Explicit pre-start replacement of archived named member',customerAgreement:{confirmed:true}})})).plan;
        plan=(await commands.execute(context,{draftId:plan.id,action:'call',operationKey:randomUUID(),body:guarded(plan,{counterSlug:'first'}),serviceCounter:{_id:'1',targetTicketId:plan.ticketId}})).plan;
        plan=(await commands.execute(context,{draftId:plan.id,action:'start',operationKey:randomUUID(),body:guarded(plan,{reservationGroupId:plan.reservationGroups.find(g=>g.state==='protected').id})})).plan;
        const child=plan.childAttempts.find(c=>c.isCurrent&&c.state==='in_service');
        plan=(await commands.execute(context,{draftId:plan.id,action:'complete',operationKey:randomUUID(),body:guarded(plan,{childAttemptId:child.childAttemptId,expectedChildRevision:child.revision,allocationGroupId:child.allocationGroupId})})).plan;
        assert.equal(plan.state,'served');
      });
      const namedExtraMembers=[];let namedExtraInput,namedExtraCatalog,namedExtraPlan;
      const availability=require('../src/services/queueNamedAvailabilityService');
      const availabilityRequest=(catalog=namedExtraCatalog)=>({requestKey:randomUUID(),catalogRevision:catalog.catalogRevision,serviceSelections:namedExtraInput,requests:[
        {selectionId:'ne-root-resource',serviceId:'10000',quantity:1,durationCount:1,durationPolicyRevision:catalog.services.find(s=>s.id==='10000').durationPolicy.revision,resourceMemberIds:[]},
        {selectionId:'ne-extra-group',serviceId:'10001',parentServiceId:'10000',quantity:2,durationCount:2,durationPolicyRevision:catalog.services.find(s=>s.id==='10001').durationPolicy.revision,resourceMemberIds:namedExtraMembers.slice(0,2).map(m=>m.id)}]});
      await t.test('named extra v1 preserves one flat group while deriving one recorded child per scoped member',async()=>{
        const workflow=(await workflowService.get(context)).workflow;
        await workflowService.put(context,{expectedConfigurationRevision:workflow.configurationRevision,mode:'linear',stations:[],stages:[]},randomUUID());
        await pool.query(`INSERT INTO location_resource_pools(id,tenant_id,location_id,revision,name,capacity,tracking_enabled) VALUES(10000,1,10,1,'Named extra root QA',2,TRUE),(10001,1,10,1,'Named extra members QA',3,TRUE);
          INSERT INTO vendor_services(id,tenant_id,name,duration_minutes,price_display,is_active) VALUES(10000,1,'Named extra root service',60,'0',TRUE),(10001,1,'Named extra trainer service',30,'0',TRUE);
          INSERT INTO location_services VALUES(10000,1,10,TRUE),(10001,1,10,TRUE);
          INSERT INTO service_resource_requirements VALUES(10000,1,10,10000,1,1),(10001,1,10,10001,1,1);`);
        for(const name of ['QA Trainer A','QA Trainer B','QA Trainer C'])namedExtraMembers.push((await named.saveMember(context,{body:{poolId:'10001',name,isActive:true},operationKey:randomUUID()})).member);
        const configuration=(mode,base,max,extras=[])=>({labels:{service:'Service',resources:'Resources',duration:'Duration',extras:'Extras'},assignment:{mode,allocationIdentity:mode==='named'?'named_member':'pooled_capacity'},duration:{mode:'adjustable',visible:true,baseMinutes:base,minCount:1,maxCount:max,stepCount:1,defaultCount:1},execution:{resourceStart:'together',extraStart:'with_parent',extraContainment:'within_parent',selectedExtraResolution:'explicit_required'},extras});
        await named.saveConfiguration(context,'10001',{expectedRevision:'0',configuration:configuration('named',30,2)},randomUUID());
        await named.saveConfiguration(context,'10000',{expectedRevision:'0',configuration:configuration('automatic',60,1,[{serviceId:'10001',selection:'optional'}])},randomUUID());
        namedExtraCatalog=await selections4.readCatalog(pool,scope);const root=namedExtraCatalog.services.find(s=>s.id==='10000'),extra=root.extras[0];
        assert.equal(extra.configured,true);assert.equal(extra.assignmentPolicy.mode,'named');assert.equal(extra.resourceMembers.length,3);
        namedExtraInput=[{serviceSelectionId:'ne-root',serviceId:'10000',resources:[{resourceSelectionId:'ne-root-resource',resourceMemberId:null,quantity:1,durationCount:1,durationPolicyRevision:root.durationPolicy.revision,extras:[{extraSelectionId:'ne-extra-group',serviceId:'10001',quantity:2,durationCount:2,durationPolicyRevision:extra.durationPolicy.revision,resourceMemberIds:namedExtraMembers.slice(0,2).map(m=>m.id)}]}]}];
        const result=await selections4.capture(pool,scope,namedExtraInput,namedExtraCatalog.catalogRevision),group=result.serviceSelections[0].resources[0].extras[0];
        assert.equal(result.items.length,3);assert.equal(group.extraSelectionId,'ne-extra-group');assert.equal(group.quantity,2);assert.equal(group.namedExtraVersion,1);assert.equal(group.resourceMembers.length,2);assert.equal(group.durationMinutes,60);
        assert.ok(result.items.filter(i=>i.selectionKind==='extra').every(i=>i.quantity===1&&i.resource.totalUnits===1&&i.extraGroupId==='ne-extra-group'&&i.durationMinutes===60));
        const reordered=structuredClone(namedExtraInput);reordered[0].resources[0].extras[0].resourceMemberIds.reverse();
        assert.deepEqual((await selections4.capture(pool,scope,reordered,namedExtraCatalog.catalogRevision)).items.map(i=>i.selectionId).sort(),result.items.map(i=>i.selectionId).sort());
        for(const count of [0,1,3]){const bad=structuredClone(namedExtraInput);bad[0].resources[0].extras[0].resourceMemberIds=namedExtraMembers.slice(0,count).map(m=>m.id);await assert.rejects(selections4.capture(pool,scope,bad,namedExtraCatalog.catalogRevision),{code:'NAMED_EXTRA_COUNT_MISMATCH'});}
        const duplicate=structuredClone(namedExtraInput);duplicate[0].resources[0].extras[0].resourceMemberIds=[namedExtraMembers[0].id,namedExtraMembers[0].id];assert.throws(()=>selections4.validateSelections(duplicate),{code:'NAMED_EXTRA_MEMBERS_INVALID'});
        const incomplete=structuredClone(namedExtraInput);incomplete[0].resources[0].extras[0].quantity=1;
        const draft=await transaction({permission:'tenant.queue.operate'},client=>drafts.command(client,scope,{action:'create',operationKey:randomUUID(),body:{contractVersion:4,customer:{name:'Keep excess named choices draft'},catalogRevision:namedExtraCatalog.catalogRevision,serviceSelections:incomplete}}));
        assert.equal(draft.plan.serviceSelections[0].resources[0].extras[0].resourceMemberIds.length,2);assert.equal(draft.plan.serviceSelections[0].resources[0].extras[0].quantity,1);
      });
      await t.test('interval availability is read-only, full-duration and fail-closed while valid named extras can publish Waiting',async()=>{
        const before=(await pool.query('SELECT revision::text FROM resource_ledger_scopes WHERE tenant_id=1 AND location_id=10')).rows[0].revision;
        let preview=await transaction({permission:'tenant.queue.operate'},client=>availability.evaluate(client,scope,availabilityRequest()));
        assert.equal(preview.requestKey.length>0,true);assert.ok(preview.selections[1].resourceMembers.slice(0,2).every(m=>m.availability.state==='available'));assert.equal((await pool.query('SELECT revision::text FROM resource_ledger_scopes WHERE tenant_id=1 AND location_id=10')).rows[0].revision,before);
        const ticket=(await pool.query("INSERT INTO tickets(tenant_id,location_id,ticket_number,status) VALUES(1,10,'Named extra blocker','called') RETURNING id::text")).rows[0].id;
        const allocation=(await pool.query("INSERT INTO resource_allocations(tenant_id,location_id,ticket_id,pool_id,pool_revision,units,resource_member_id,started_at,expected_end_at) VALUES(1,10,$1,10001,1,1,$2,clock_timestamp()-interval '2 hours',clock_timestamp()-interval '1 hour') RETURNING id::text",[ticket,namedExtraMembers[1].id])).rows[0].id;
        preview=await transaction({permission:'tenant.queue.operate'},client=>availability.evaluate(client,scope,availabilityRequest()));assert.equal(preview.selections[1].resourceMembers.find(m=>m.id===namedExtraMembers[1].id).availability.reasonCode,'RESOURCE_OCCUPIED');assert.equal(preview.selections[1].configurationValid,true);
        const created=await transaction({permission:'tenant.queue.operate'},client=>drafts.command(client,scope,{action:'create',operationKey:randomUUID(),body:{contractVersion:4,customer:{name:'Named extras waiting'},catalogRevision:namedExtraCatalog.catalogRevision,serviceSelections:namedExtraInput}}));
        namedExtraPlan=(await service.publish(context,{draftId:created.plan.id,operationKey:randomUUID(),body:{expectedPlanRevision:'1',expectedCatalogRevision:namedExtraCatalog.catalogRevision}})).plan;
        assert.equal(namedExtraPlan.state,'waiting');assert.equal(namedExtraPlan.childAttempts.length,3);assert.equal(namedExtraPlan.serviceSelections[0].resources[0].extras[0].memberExecutions.length,2);
        await assert.rejects(commands.execute(context,{draftId:namedExtraPlan.id,action:'call',operationKey:randomUUID(),body:guarded(namedExtraPlan,{counterSlug:'first'}),serviceCounter:{_id:'1',targetTicketId:namedExtraPlan.ticketId}}),{code:'RESOURCE_CAPACITY_UNAVAILABLE'});
        assert.equal((await pool.query("SELECT count(*)::int n FROM resource_ledger_reservations WHERE ticket_id=$1 AND state='protected'",[namedExtraPlan.ticketId])).rows[0].n,0);
        await pool.query("UPDATE resource_allocations SET released_at=clock_timestamp(),outcome='completed' WHERE id=$1",[allocation]);
        namedExtraPlan=await require('../src/repositories/queuePlanProjection').read(pool,scope,await drafts.find(pool,scope,namedExtraPlan.id));
        namedExtraPlan=(await commands.execute(context,{draftId:namedExtraPlan.id,action:'call',operationKey:randomUUID(),body:guarded(namedExtraPlan,{counterSlug:'first'}),serviceCounter:{_id:'1',targetTicketId:namedExtraPlan.ticketId}})).plan;
        const ownRequest={...availabilityRequest(),draftId:namedExtraPlan.id};
        const ownPreview=await transaction({permission:'tenant.queue.operate'},client=>availability.evaluate(client,scope,ownRequest));assert.equal(ownPreview.excludedOwnProtection,true);assert.ok(ownPreview.selections[1].resourceMembers.filter(m=>namedExtraMembers.slice(0,2).some(x=>x.id===m.id)).every(m=>m.availability.state==='available'));
        const blocked=await transaction({permission:'tenant.queue.operate'},client=>availability.evaluate(client,scope,availabilityRequest()));assert.ok(blocked.selections[1].resourceMembers.filter(m=>namedExtraMembers.slice(0,2).some(x=>x.id===m.id)).every(m=>m.availability.state!=='available'));
      });
      await t.test('named extras Start together and completing one recorded member releases only that member',async()=>{
        namedExtraPlan=(await commands.execute(context,{draftId:namedExtraPlan.id,action:'start',operationKey:randomUUID(),body:guarded(namedExtraPlan,{reservationGroupId:namedExtraPlan.reservationGroups.find(g=>g.state==='protected').id})})).plan;
        assert.equal(new Set(namedExtraPlan.allocationGroups[0].members.map(m=>m.startedAt.toISOString())).size,1);
        const complete=async(child)=>{namedExtraPlan=(await commands.execute(context,{draftId:namedExtraPlan.id,action:'complete',operationKey:randomUUID(),body:guarded(namedExtraPlan,{childAttemptId:child.childAttemptId,expectedChildRevision:child.revision,allocationGroupId:child.allocationGroupId})})).plan;};
        const members=namedExtraPlan.serviceSelections[0].resources[0].extras[0].memberExecutions;await complete(members[0].execution);
        assert.equal((await pool.query('SELECT count(*)::int n FROM resource_allocations WHERE ticket_id=$1 AND released_at IS NULL',[namedExtraPlan.ticketId])).rows[0].n,2);
        const root=namedExtraPlan.childAttempts.find(c=>c.isCurrent&&c.selectionKind==='resource');await assert.rejects(complete(root),{code:'REQUIRED_EXTRAS_UNFINISHED'});
        await complete(namedExtraPlan.serviceSelections[0].resources[0].extras[0].memberExecutions[1].execution);await complete(namedExtraPlan.childAttempts.find(c=>c.isCurrent&&c.selectionKind==='resource'));
        assert.equal(namedExtraPlan.state,'served');assert.equal((await pool.query('SELECT count(*)::int n FROM resource_allocations WHERE ticket_id=$1 AND released_at IS NULL',[namedExtraPlan.ticketId])).rows[0].n,0);
      });
      await t.test('availability rejects omitted demand, stale policy, unsafe fields and unscoped identity without claiming capacity',async()=>{
        const request=availabilityRequest();request.requests.pop();
        let view=await transaction({permission:'tenant.queue.operate'},client=>availability.evaluate(client,scope,request));
        assert.ok(view.selections.every(s=>s.availability.reasonCode==='INCOMPLETE_AVAILABILITY_CONTEXT'));
        const missingTree=availabilityRequest();delete missingTree.serviceSelections;
        view=await transaction({permission:'tenant.queue.operate'},client=>availability.evaluate(client,scope,missingTree));
        assert.ok(view.selections.every(s=>s.availability.state==='unknown'));
        const stale=availabilityRequest();stale.catalogRevision='0'.repeat(64);
        view=await transaction({permission:'tenant.queue.operate'},client=>availability.evaluate(client,scope,stale));
        assert.ok(view.selections.every(s=>s.availability.reasonCode==='CATALOG_ACCEPTANCE_REQUIRED'));
        const unknownId=randomUUID(),unknown=availabilityRequest();unknown.requests[1].resourceMemberIds=[namedExtraMembers[0].id,unknownId];unknown.serviceSelections=structuredClone(namedExtraInput);unknown.serviceSelections[0].resources[0].extras[0].resourceMemberIds=[namedExtraMembers[0].id,unknownId];
        view=await transaction({permission:'tenant.queue.operate'},client=>availability.evaluate(client,scope,unknown));
        const missing=view.selections[1].resourceMembers.find(m=>m.id===unknownId);assert.equal(missing.name,'Unavailable resource');assert.equal(missing.availability.reasonCode,'MEMBER_NOT_IN_POOL');
        const unsafe=availabilityRequest();unsafe.requests[0].startsAt=new Date().toISOString();assert.throws(()=>availability.validate(unsafe),{code:'INVALID_AVAILABILITY_REQUEST'});
        const duplicate=availabilityRequest();duplicate.requests[1].selectionId=duplicate.requests[0].selectionId;assert.throws(()=>availability.validate(duplicate),{code:'INVALID_AVAILABILITY_REQUEST'});
      });
      await t.test('future anonymous protection is checked against the entire configured interval',async()=>{
        const held=(await pool.query(`INSERT INTO resource_ledger_reservations(tenant_id,location_id,ticket_id,pool_id,pool_revision,requirement_revision,units,starts_at,ends_at)
          VALUES(1,10,1,10001,1,1,1,clock_timestamp()+interval '45 minutes',clock_timestamp()+interval '90 minutes') RETURNING id::text`)).rows[0].id;
        const long=availabilityRequest();
        let view=await transaction({permission:'tenant.queue.operate'},client=>availability.evaluate(client,scope,long));
        assert.equal(view.selections[1].resourceMembers[0].availability.reasonCode,'ANONYMOUS_RESOURCE_USAGE');
        const short=availabilityRequest();short.serviceSelections=structuredClone(namedExtraInput);short.requests[1].durationCount=1;short.serviceSelections[0].resources[0].extras[0].durationCount=1;
        view=await transaction({permission:'tenant.queue.operate'},client=>availability.evaluate(client,scope,short));
        assert.ok(view.selections[1].resourceMembers.every(m=>m.availability.state==='available'));
        await pool.query("UPDATE resource_ledger_reservations SET state='cancelled' WHERE id=$1",[held]);
      });
      await t.test('concurrent named-extra Calls protect one whole request; expired protection stays unknown until authorized reconciliation',async()=>{
        const create=async name=>{const created=await transaction({permission:'tenant.queue.operate'},client=>drafts.command(client,scope,{action:'create',operationKey:randomUUID(),body:{contractVersion:4,customer:{name},catalogRevision:namedExtraCatalog.catalogRevision,serviceSelections:namedExtraInput}}));return (await service.publish(context,{draftId:created.plan.id,operationKey:randomUUID(),body:{expectedPlanRevision:'1',expectedCatalogRevision:namedExtraCatalog.catalogRevision}})).plan;};
        const plans=await Promise.all([create('Named extras concurrent A'),create('Named extras concurrent B')]);
        const calls=await Promise.allSettled(plans.map(plan=>commands.execute(context,{draftId:plan.id,action:'call',operationKey:randomUUID(),body:guarded(plan,{counterSlug:'first'}),serviceCounter:{_id:'1',targetTicketId:plan.ticketId}})));
        assert.equal(calls.filter(r=>r.status==='fulfilled').length,1);assert.equal(calls.filter(r=>r.status==='rejected'&&r.reason.code==='RESOURCE_CAPACITY_UNAVAILABLE').length,1);
        const winner=calls.find(r=>r.status==='fulfilled').value.plan;let loser=calls.find(r=>r.status==='rejected').reason.plan;
        assert.equal((await pool.query("SELECT count(*)::int n FROM resource_ledger_reservations WHERE ticket_id=$1 AND state='protected'",[winner.ticketId])).rows[0].n,3);
        assert.equal((await pool.query("SELECT count(*)::int n FROM resource_ledger_reservations WHERE ticket_id=$1 AND state='protected'",[loser.ticketId])).rows[0].n,0);
        const group=winner.reservationGroups.find(g=>g.state==='protected');await pool.query("UPDATE queue_reservation_groups SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[group.id]);
        let view=await transaction({permission:'tenant.queue.operate'},client=>availability.evaluate(client,scope,availabilityRequest()));assert.equal(view.selections[1].availability.reasonCode,'RESERVATION_EXPIRY_PENDING');
        await assert.rejects(commands.execute(context,{draftId:loser.id,action:'call',operationKey:randomUUID(),body:guarded(loser,{counterSlug:'first'}),serviceCounter:{_id:'1',targetTicketId:loser.ticketId}}),error=>{assert.equal(error.code,'RESOURCE_CAPACITY_UNAVAILABLE');loser=error.plan;return true;});
        await assert.rejects(commands.execute(context,{draftId:winner.id,action:'start',operationKey:randomUUID(),body:guarded(winner,{reservationGroupId:group.id})}),{code:'RESERVATION_EXPIRED'});
        view=await transaction({permission:'tenant.queue.operate'},client=>availability.evaluate(client,scope,availabilityRequest()));assert.ok(view.selections[1].resourceMembers.every(m=>m.availability.state==='available'));
        loser=(await commands.execute(context,{draftId:loser.id,action:'call',operationKey:randomUUID(),body:guarded(loser,{counterSlug:'first'}),serviceCounter:{_id:'1',targetTicketId:loser.ticketId}})).plan;
        assert.equal(loser.state,'called');
        const reduced=structuredClone(namedExtraInput);reduced[0].resources[0].extras[0].quantity=1;reduced[0].resources[0].extras[0].resourceMemberIds=[namedExtraMembers[0].id];
        await assert.rejects(commands.execute(context,{draftId:loser.id,action:'amend',operationKey:randomUUID(),body:guarded(loser,{contractVersion:4,serviceSelections:reduced,expectedCatalogRevision:namedExtraCatalog.catalogRevision,reason:'Remove one named trainer'})}),{code:'CUSTOMER_AGREEMENT_REQUIRED'});
        assert.equal((await pool.query("SELECT count(*)::int n FROM resource_ledger_reservations WHERE ticket_id=$1 AND state='protected'",[loser.ticketId])).rows[0].n,3);
        loser=(await commands.execute(context,{draftId:loser.id,action:'amend',operationKey:randomUUID(),body:guarded(loser,{contractVersion:4,serviceSelections:reduced,expectedCatalogRevision:namedExtraCatalog.catalogRevision,reason:'Customer agreed to remove one named trainer',customerAgreement:{confirmed:true}})})).plan;
        assert.equal(loser.serviceSelections[0].resources[0].extras[0].resourceMembers.length,1);
        await commands.execute(context,{draftId:loser.id,action:'cancelProtection',operationKey:randomUUID(),body:guarded(loser,{reservationGroupId:loser.reservationGroups.find(g=>g.state==='protected').id,reason:'Finish isolated concurrency QA'})});
      });
      await t.test('named fanout permits twenty-one members but retains editor-group and total-child bounds',async()=>{
        await pool.query(`INSERT INTO location_resource_pools(id,tenant_id,location_id,revision,name,capacity,tracking_enabled) VALUES(10002,1,10,1,'Large named extra QA',1,TRUE);
          INSERT INTO vendor_services(id,tenant_id,name,duration_minutes,price_display,is_active) VALUES(10002,1,'Large named extra QA',30,'0',TRUE);
          INSERT INTO location_services VALUES(10002,1,10,TRUE);INSERT INTO service_resource_requirements VALUES(10002,1,10,10002,1,1);`);
        const members=[];for(let i=0;i<100;i++)members.push((await named.saveMember(context,{body:{poolId:'10002',name:'Large QA '+i,isActive:i<99},operationKey:randomUUID()})).member);
        assert.equal((await named.listMembers(context,'10002')).pool.capacity,100);assert.equal(members.filter(m=>m.isActive).length,99);
        const cfg=structuredClone((await named.getConfiguration(context,'10001')).policy.configuration);await named.saveConfiguration(context,'10002',{expectedRevision:'0',configuration:cfg},randomUUID());
        const rootCfg=structuredClone((await named.getConfiguration(context,'10000')).policy.configuration);rootCfg.extras.push({serviceId:'10002',selection:'optional'});await named.saveConfiguration(context,'10000',{expectedRevision:(await named.getConfiguration(context,'10000')).policy.revision,configuration:rootCfg},randomUUID());
        const catalog=await selections4.readCatalog(pool,scope),input=structuredClone(namedExtraInput),extra=input[0].resources[0].extras[0];extra.serviceId='10002';extra.quantity=21;extra.resourceMemberIds=members.slice(0,21).map(m=>m.id);extra.durationPolicyRevision=catalog.services.find(s=>s.id==='10002').durationPolicy.revision;input[0].resources[0].durationPolicyRevision=catalog.services.find(s=>s.id==='10000').durationPolicy.revision;
        const captured=await selections4.capture(pool,scope,input,catalog.catalogRevision);assert.equal(captured.items.length,22);assert.equal(captured.serviceSelections[0].resources[0].extras[0].resourceMembers.length,21);
        extra.quantity=100;extra.resourceMemberIds=members.map(m=>m.id);await assert.rejects(selections4.capture(pool,scope,input,catalog.catalogRevision),{code:'INVALID_SELECTION_PLAN'});
      });
      await t.test('mixed anonymous and named simultaneous demand in one pool fails closed in either leaf order',async()=>{
        await pool.query(`INSERT INTO vendor_services(id,tenant_id,name,duration_minutes,price_display,is_active) VALUES(10003,1,'Anonymous same pool QA',30,'0',TRUE);INSERT INTO location_services VALUES(10003,1,10,TRUE);INSERT INTO service_resource_requirements VALUES(10003,1,10,10001,1,1);`);
        const cfg=structuredClone((await named.getConfiguration(context,'10001')).policy.configuration);cfg.assignment={mode:'automatic',allocationIdentity:'pooled_capacity'};await named.saveConfiguration(context,'10003',{expectedRevision:'0',configuration:cfg},randomUUID());
        const catalog=await selections4.readCatalog(pool,scope),input=['10001','10003'].map((id,i)=>({serviceSelectionId:'mix-s'+i,serviceId:id,resources:[{resourceSelectionId:'mix-r'+i,resourceMemberId:i===0?namedExtraMembers[0].id:null,quantity:1,durationCount:1,durationPolicyRevision:catalog.services.find(s=>s.id===id).durationPolicy.revision,extras:[]}]}));
        for(const tree of [input,[...input].reverse()])await assert.rejects(selections4.capture(pool,scope,tree,catalog.catalogRevision),{code:'EXTRA_RESOURCE_CONFLICT'});
        const request={requestKey:randomUUID(),catalogRevision:catalog.catalogRevision,serviceSelections:input,requests:input.map(s=>({selectionId:s.resources[0].resourceSelectionId,serviceId:s.serviceId,quantity:1,durationCount:1,durationPolicyRevision:s.resources[0].durationPolicyRevision,resourceMemberIds:s.resources[0].resourceMemberId?[s.resources[0].resourceMemberId]:[]}))};
        const view=await transaction({permission:'tenant.queue.operate'},client=>availability.evaluate(client,scope,request));assert.ok(view.selections.every(s=>!s.configurationValid&&s.availability.reasonCode==='EXTRA_RESOURCE_CONFLICT'));
      });
      let recoveryPlan,recoverySkipCommand,recoveryOriginalStage,recoveryOriginalChildren;
      const makeRecoveryPlan=async name=>{
        const catalog=await selections4.readCatalog(pool,scope),input=structuredClone(namedExtraInput);
        input[0].resources[0].durationPolicyRevision=catalog.services.find(s=>s.id==='10000').durationPolicy.revision;
        input[0].resources[0].extras[0].durationPolicyRevision=catalog.services.find(s=>s.id==='10001').durationPolicy.revision;
        const created=await transaction({permission:'tenant.queue.operate'},client=>drafts.command(client,scope,{action:'create',operationKey:randomUUID(),body:{contractVersion:4,customer:{name},catalogRevision:catalog.catalogRevision,serviceSelections:input}}));
        return (await service.publish(context,{draftId:created.plan.id,operationKey:randomUUID(),body:{expectedPlanRevision:'1',expectedCatalogRevision:catalog.catalogRevision}})).plan;
      };
      await t.test('Skip atomically releases the exact unstarted promise and records immutable recoverable skipped attempts',async()=>{
        recoveryPlan=await makeRecoveryPlan('Skip Recall v1 QA');
        await pool.query("UPDATE tickets SET service_priority_band='recovery',sequence=44,created_at=clock_timestamp()-interval '2 hours',customer_confirmed_at=clock_timestamp(),notified_called_at=clock_timestamp() WHERE id=$1",[recoveryPlan.ticketId]);
        recoveryPlan=(await commands.execute(context,{draftId:recoveryPlan.id,action:'call',operationKey:randomUUID(),body:guarded(recoveryPlan,{counterSlug:'first'}),serviceCounter:{_id:'1',targetTicketId:recoveryPlan.ticketId}})).plan;
        const called=recoveryPlan;recoveryOriginalStage=called.currentStage.attemptId;recoveryOriginalChildren=called.childAttempts.filter(c=>c.isCurrent).map(c=>c.childAttemptId);
        recoverySkipCommand={draftId:called.id,action:'skip',operationKey:randomUUID(),body:guarded(called,{reservationGroupId:called.reservationGroups.find(g=>g.state==='protected').id,reason:'Customer missed this call; explicit Skip'})};
        const skipped=await commands.execute(context,recoverySkipCommand);recoveryPlan=skipped.plan;
        assert.equal(recoveryPlan.state,'skipped');assert.equal(recoveryPlan.currentStage.state,'skipped');assert.ok(recoveryPlan.allowedActions.includes('recall'));
        assert.ok(recoveryPlan.childAttempts.filter(c=>c.isCurrent).every(c=>c.state==='skipped'&&!c.startedAt&&c.endedAt));
        assert.equal(recoveryPlan.reservationGroups.at(-1).state,'skipped');assert.equal((await pool.query("SELECT count(*)::int n FROM resource_ledger_reservations WHERE ticket_id=$1 AND state='protected'",[called.ticketId])).rows[0].n,0);
        assert.equal((await pool.query('SELECT count(*)::int n FROM resource_allocations WHERE ticket_id=$1',[called.ticketId])).rows[0].n,0);
        assert.deepEqual(JSON.parse(JSON.stringify(await commands.execute(context,recoverySkipCommand))),JSON.parse(JSON.stringify(skipped)));
        await assert.rejects(commands.execute(context,{draftId:called.id,action:'start',operationKey:randomUUID(),body:guarded(called,{reservationGroupId:called.reservationGroups.at(-1).id})}),{code:'STALE_REVISION'});
        await assert.rejects(pool.query("UPDATE queue_child_attempts SET state='waiting' WHERE id=$1",[recoveryOriginalChildren[0]]),{code:'23514'});
        await assert.rejects(pool.query("UPDATE queue_stage_attempts SET state='waiting' WHERE id=$1",[recoveryOriginalStage]),{code:'23514'});
        const skippedList=await drafts.list(pool,scope,null,'skipped');assert.ok(skippedList.plans.some(p=>p.id===called.id));assert.ok(!(await drafts.list(pool,scope,null,'active')).plans.some(p=>p.id===called.id));
      });
      await t.test('Recall checks intake, appends a same-stage attempt and preserves queue age/priority without another allowance',async()=>{
        const before=(await pool.query('SELECT service_priority_band,sequence,created_at,service_started_at,service_ended_at FROM tickets WHERE id=$1',[recoveryPlan.ticketId])).rows[0],allowances=(await pool.query('SELECT count(*)::int n FROM allowance_operations WHERE subject_id=$1',[recoveryPlan.ticketId])).rows[0].n;
        const recall={draftId:recoveryPlan.id,action:'recall',operationKey:randomUUID(),body:guarded(recoveryPlan,{reason:'Customer returned; explicit Recall'})};
        recallIntakeBlocked=true;await assert.rejects(commands.execute(context,recall),{code:'QUEUE_DAY_CLOSED'});recallIntakeBlocked=false;
        assert.equal((await pool.query('SELECT state FROM queue_stage_attempts WHERE id=$1',[recoveryOriginalStage])).rows[0].state,'skipped');
        const result=await commands.execute(context,recall);recoveryPlan=result.plan;assert.equal(recoveryPlan.state,'waiting');assert.notEqual(recoveryPlan.currentStage.attemptId,recoveryOriginalStage);assert.equal(recoveryPlan.currentStage.attempt,'2');
        const old=recoveryPlan.childAttempts.filter(c=>recoveryOriginalChildren.includes(c.childAttemptId));assert.ok(old.every(c=>c.state==='skipped'&&!c.isCurrent));assert.equal(recoveryPlan.childAttempts.filter(c=>c.isCurrent&&c.state==='waiting').length,3);
        const after=(await pool.query('SELECT service_priority_band,sequence,created_at,service_started_at,service_ended_at,customer_confirmed_at,notified_called_at,service_counter_id FROM tickets WHERE id=$1',[recoveryPlan.ticketId])).rows[0];
        for(const key of Object.keys(before))assert.deepEqual(after[key],before[key]);assert.equal(after.customer_confirmed_at,null);assert.equal(after.notified_called_at,null);assert.equal(after.service_counter_id,null);
        assert.equal((await pool.query('SELECT count(*)::int n FROM allowance_operations WHERE subject_id=$1',[recoveryPlan.ticketId])).rows[0].n,allowances);
        assert.equal((await pool.query('SELECT count(*)::int n FROM resource_allocations WHERE ticket_id=$1',[recoveryPlan.ticketId])).rows[0].n,0);
        assert.deepEqual(JSON.parse(JSON.stringify(await commands.execute(context,recall))),JSON.parse(JSON.stringify(result)));
        recoveryPlan=(await commands.execute(context,{draftId:recoveryPlan.id,action:'call',operationKey:randomUUID(),body:guarded(recoveryPlan,{counterSlug:'first'}),serviceCounter:{_id:'1',targetTicketId:recoveryPlan.ticketId}})).plan;
        assert.equal(recoveryPlan.reservationGroups.filter(g=>g.state==='protected').length,1);assert.equal(recoveryPlan.reservationGroups.filter(g=>g.state==='skipped').length,1);
        recoveryPlan=(await commands.execute(context,{draftId:recoveryPlan.id,action:'start',operationKey:randomUUID(),body:guarded(recoveryPlan,{reservationGroupId:recoveryPlan.reservationGroups.find(g=>g.state==='protected').id})})).plan;
        await assert.rejects(commands.execute(context,{draftId:recoveryPlan.id,action:'skip',operationKey:randomUUID(),body:guarded(recoveryPlan,{reservationGroupId:recoveryPlan.reservationGroups.find(g=>g.state==='converted').id,reason:'Cannot skip started work'})}),{code:'SKIP_NOT_AVAILABLE'});
        for(const kind of ['extra','resource'])for(const child of recoveryPlan.childAttempts.filter(c=>c.isCurrent&&c.selectionKind===kind))recoveryPlan=(await commands.execute(context,{draftId:recoveryPlan.id,action:'complete',operationKey:randomUUID(),body:guarded(recoveryPlan,{childAttemptId:child.childAttemptId,expectedChildRevision:child.revision,allocationGroupId:child.allocationGroupId})})).plan;
        assert.equal(recoveryPlan.state,'served');
      });
      const callRecovery=async(plan,counter='1')=>(await commands.execute(context,{draftId:plan.id,action:'call',operationKey:randomUUID(),body:guarded(plan,{counterSlug:counter==='1'?'counter-a':'counter-b'}),serviceCounter:{_id:counter,targetTicketId:plan.ticketId}})).plan;
      const startRecovery=async(plan)=>(await commands.execute(context,{draftId:plan.id,action:'start',operationKey:randomUUID(),body:guarded(plan,{reservationGroupId:plan.reservationGroups.find(g=>g.state==='protected').id})})).plan;
      const finishRecovery=async(plan)=>{for(const kind of ['extra','resource'])for(const child of plan.childAttempts.filter(c=>c.isCurrent&&c.state==='in_service'&&c.selectionKind===kind))plan=(await commands.execute(context,{draftId:plan.id,action:'complete',operationKey:randomUUID(),body:guarded(plan,{childAttemptId:child.childAttemptId,expectedChildRevision:child.revision,allocationGroupId:child.allocationGroupId})})).plan;return plan;};
      await t.test('concurrent Start and Skip have exactly one revision winner with no partial release/allocation',async()=>{
        let plan=await callRecovery(await makeRecoveryPlan('Start Skip race'));
        const group=plan.reservationGroups.find(g=>g.state==='protected'),results=await Promise.allSettled([
          commands.execute(context,{draftId:plan.id,action:'skip',operationKey:randomUUID(),body:guarded(plan,{reservationGroupId:group.id,reason:'Race Skip'})}),
          commands.execute(context,{draftId:plan.id,action:'start',operationKey:randomUUID(),body:guarded(plan,{reservationGroupId:group.id})})]);
        assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.code==='STALE_REVISION').length,1);plan=results.find(r=>r.status==='fulfilled').value.plan;
        const active=(await pool.query('SELECT count(*)::int n FROM resource_allocations WHERE ticket_id=$1 AND released_at IS NULL',[plan.ticketId])).rows[0].n;
        if(plan.state==='skipped'){assert.equal(active,0);plan=(await commands.execute(context,{draftId:plan.id,action:'recall',operationKey:randomUUID(),body:guarded(plan,{reason:'Finish race QA'})})).plan;plan=await startRecovery(await callRecovery(plan));}else assert.equal(active,3);
        plan=await finishRecovery(plan);assert.equal(plan.state,'served');
      });
      await t.test('concurrent Recall creates one fresh same-stage attempt and bound actions reject another counter',async()=>{
        let plan=await callRecovery(await makeRecoveryPlan('Recall race'));
        await assert.rejects(commands.execute(context,{draftId:plan.id,action:'skip',operationKey:randomUUID(),body:guarded(plan,{reservationGroupId:plan.reservationGroups.find(g=>g.state==='protected').id,reason:'Wrong selected counter',counterSlug:'counter-b',expectedCounterId:'2'})}),{code:'CURRENT_TICKET_CHANGED'});
        plan=(await commands.execute(context,{draftId:plan.id,action:'skip',operationKey:randomUUID(),body:guarded(plan,{reservationGroupId:plan.reservationGroups.find(g=>g.state==='protected').id,reason:'Correct selected counter',counterSlug:'counter-a',expectedCounterId:'1'})})).plan;
        const skippedStage=plan.currentStage.attemptId,results=await Promise.allSettled([1,2].map(n=>commands.execute(context,{draftId:plan.id,action:'recall',operationKey:randomUUID(),body:guarded(plan,{reason:'Explicit concurrent Recall '+n,counterSlug:'counter-a',expectedCounterId:'1'})})));
        assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.code==='STALE_REVISION').length,1);plan=results.find(r=>r.status==='fulfilled').value.plan;
        assert.notEqual(plan.currentStage.attemptId,skippedStage);assert.equal((await pool.query('SELECT count(*)::int n FROM queue_stage_attempts WHERE ticket_id=$1',[plan.ticketId])).rows[0].n,2);
        assert.equal(plan.childAttempts.filter(c=>c.isCurrent&&c.state==='waiting').length,3);assert.equal((await pool.query('SELECT count(*)::int n FROM resource_allocations WHERE ticket_id=$1',[plan.ticketId])).rows[0].n,0);
        plan=await callRecovery(plan);await assert.rejects(commands.execute(context,{draftId:plan.id,action:'start',operationKey:randomUUID(),body:guarded(plan,{reservationGroupId:plan.reservationGroups.find(g=>g.state==='protected').id,counterSlug:'counter-b',expectedCounterId:'2'})}),{code:'CURRENT_TICKET_CHANGED'});
        plan=await finishRecovery(await startRecovery(plan));assert.equal(plan.state,'served');
      });
      await t.test('later-stage Skip and Recall preserve earlier completion, parent first-start and pending future stages',async()=>{
        const current=(await workflowService.get(context)).workflow,station1=randomUUID(),station2=randomUUID(),stage1=randomUUID(),stage2=randomUUID(),stage3=randomUUID();
        await workflowService.put(context,{expectedConfigurationRevision:current.configurationRevision,mode:'multi_station',stations:[{stationId:station1,name:'Recovery first',serviceCounterIds:['1']},{stationId:station2,name:'Recovery second',serviceCounterIds:['2']}],stages:[{stageId:stage1,stationId:station1,label:'Earlier completed',serviceIds:['10003']},{stageId:stage2,stationId:station2,label:'Skipped required',serviceIds:['10000']},{stageId:stage3,stationId:station1,label:'Future required',serviceIds:['10002']}]},randomUUID());
        const catalog=await selections4.readCatalog(pool,scope),input=structuredClone(namedExtraInput);
        input[0].resources[0].durationPolicyRevision=catalog.services.find(s=>s.id==='10000').durationPolicy.revision;input[0].resources[0].extras[0].durationPolicyRevision=catalog.services.find(s=>s.id==='10001').durationPolicy.revision;
        const root=(id,member=null)=>({serviceSelectionId:'recovery-root-'+id,serviceId:id,resources:[{resourceSelectionId:'recovery-resource-'+id,resourceMemberId:member,quantity:1,durationCount:1,durationPolicyRevision:catalog.services.find(s=>s.id===id).durationPolicy.revision,extras:[]}]});input.unshift(root('10003'));input.push(root('10002',catalog.services.find(s=>s.id==='10002').resourceMembers[0].id));
        const draft=await transaction({permission:'tenant.queue.operate'},client=>drafts.command(client,scope,{action:'create',operationKey:randomUUID(),body:{contractVersion:4,customer:{name:'Later-stage recovery'},catalogRevision:catalog.catalogRevision,serviceSelections:input}}));
        let plan=(await service.publish(context,{draftId:draft.plan.id,operationKey:randomUUID(),body:{expectedPlanRevision:'1',expectedCatalogRevision:catalog.catalogRevision}})).plan;
        plan=await finishRecovery(await startRecovery(await callRecovery(plan)));assert.equal(plan.currentStage.state,'completed');
        const earlierId=plan.currentStage.attemptId,earlier=(await pool.query('SELECT md5(to_jsonb(s)::text) hash FROM queue_stage_attempts s WHERE id=$1',[earlierId])).rows[0].hash,firstStart=(await pool.query('SELECT service_started_at FROM tickets WHERE id=$1',[plan.ticketId])).rows[0].service_started_at;
        plan=(await commands.execute(context,{draftId:plan.id,action:'handoff',operationKey:randomUUID(),body:guarded(plan,{})})).plan;plan=await callRecovery(plan,'2');
        const futureId=plan.stages.find(s=>s.id===stage3).attemptId,futureBefore=(await pool.query('SELECT md5(to_jsonb(s)::text) hash FROM queue_stage_attempts s WHERE id=$1',[futureId])).rows[0].hash;
        plan=(await commands.execute(context,{draftId:plan.id,action:'skip',operationKey:randomUUID(),body:guarded(plan,{reservationGroupId:plan.reservationGroups.find(g=>g.state==='protected').id,reason:'Missed later required stage'})})).plan;
        assert.equal(plan.state,'skipped');assert.equal(require('../src/services/customerQueueLifecycle').customerQueueLifecycle({status:'skipped',serviceStartedAt:firstStart}).state,'recovery');
        plan=(await commands.execute(context,{draftId:plan.id,action:'recall',operationKey:randomUUID(),body:guarded(plan,{reason:'Return to same required stage'})})).plan;
        assert.equal(plan.currentStage.id,stage2);assert.equal(plan.currentStage.state,'waiting');assert.equal((await pool.query('SELECT md5(to_jsonb(s)::text) hash FROM queue_stage_attempts s WHERE id=$1',[earlierId])).rows[0].hash,earlier);assert.equal((await pool.query('SELECT md5(to_jsonb(s)::text) hash FROM queue_stage_attempts s WHERE id=$1',[futureId])).rows[0].hash,futureBefore);assert.deepEqual((await pool.query('SELECT service_started_at FROM tickets WHERE id=$1',[plan.ticketId])).rows[0].service_started_at,firstStart);
        assert.equal((await pool.query('SELECT count(*)::int n FROM resource_allocations WHERE ticket_id=$1 AND released_at IS NULL',[plan.ticketId])).rows[0].n,0);
        plan=await finishRecovery(await startRecovery(await callRecovery(plan,'2')));assert.equal(plan.currentStage.state,'completed');plan=(await commands.execute(context,{draftId:plan.id,action:'handoff',operationKey:randomUUID(),body:guarded(plan,{})})).plan;plan=await finishRecovery(await startRecovery(await callRecovery(plan)));assert.equal(plan.state,'served');
      });
      await t.test('non-enforced Recall uses the current database-clock date rather than the skipped ticket date',async()=>{
        const workflow=(await workflowService.get(context)).workflow;await workflowService.put(context,{expectedConfigurationRevision:workflow.configurationRevision,mode:'linear',stations:[],stages:[]},randomUUID());
        let plan=await callRecovery(await makeRecoveryPlan('Legacy-day Recall guard'));plan=(await commands.execute(context,{draftId:plan.id,action:'skip',operationKey:randomUUID(),body:guarded(plan,{reservationGroupId:plan.reservationGroups.find(g=>g.state==='protected').id,reason:'Skip before day-bound recovery test'})})).plan;
        await pool.query("UPDATE store_locations SET queue_lifecycle_mode='legacy' WHERE id=10");await pool.query("UPDATE tickets SET date_key='20000101' WHERE id=$1",[plan.ticketId]);recallNoDay=true;
        await assert.rejects(commands.execute(context,{draftId:plan.id,action:'recall',operationKey:randomUUID(),body:guarded(plan,{reason:'Must not recall an old Queue Day'})}),{code:'RECALL_QUEUE_DAY_CHANGED'});assert.equal((await pool.query('SELECT status FROM tickets WHERE id=$1',[plan.ticketId])).rows[0].status,'skipped');
        recallNoDay=false;await pool.query("UPDATE store_locations SET queue_lifecycle_mode='enforced' WHERE id=10");await pool.query("UPDATE tickets SET date_key='20261017' WHERE id=$1",[plan.ticketId]);plan=(await commands.execute(context,{draftId:plan.id,action:'recall',operationKey:randomUUID(),body:guarded(plan,{reason:'Back to the same test Queue Day'})})).plan;plan=await finishRecovery(await startRecovery(await callRecovery(plan)));assert.equal(plan.state,'served');
      });
      await t.test('historical draft create/update replay after Publish never advertises draft actions',async()=>{
        const catalog=await selections4.readCatalog(pool,scope),input=structuredClone(namedExtraInput);
        input[0].resources[0].durationPolicyRevision=catalog.services.find(s=>s.id==='10000').durationPolicy.revision;input[0].resources[0].extras[0].durationPolicyRevision=catalog.services.find(s=>s.id==='10001').durationPolicy.revision;
        const create={action:'create',operationKey:randomUUID(),body:{contractVersion:4,customer:{name:'Published replay QA'},catalogRevision:catalog.catalogRevision,serviceSelections:input}};
        const saved=await transaction({permission:'tenant.queue.operate'},c=>drafts.command(c,scope,create));
        const update={action:'update',draftId:saved.plan.id,operationKey:randomUUID(),body:{expectedPlanRevision:'1',notes:'Preserve original receipt'}};
        await transaction({permission:'tenant.queue.operate'},c=>drafts.command(c,scope,update));
        const receipts=(await pool.query('SELECT operation_key,result FROM queue_plan_command_receipts WHERE operation_key=ANY($1::text[]) ORDER BY operation_key',[[create.operationKey,update.operationKey]])).rows;
        await service.publish(context,{draftId:saved.plan.id,operationKey:randomUUID(),body:{expectedPlanRevision:'2',expectedCatalogRevision:catalog.catalogRevision}});
        for(const command of [create,update])await assert.rejects(transaction({permission:'tenant.queue.operate'},c=>drafts.command(c,scope,command)),{code:'PLAN_LOCKED'});
        assert.deepEqual((await pool.query('SELECT operation_key,result FROM queue_plan_command_receipts WHERE operation_key=ANY($1::text[]) ORDER BY operation_key',[[create.operationKey,update.operationKey]])).rows,receipts);
      });
      await t.test('Delete versus Publish serializes to exactly one outcome with no duplicate charge',async()=>{
        const catalog=await selections4.readCatalog(pool,scope),input=structuredClone(namedExtraInput);
        input[0].resources[0].durationPolicyRevision=catalog.services.find(s=>s.id==='10000').durationPolicy.revision;
        input[0].resources[0].extras[0].durationPolicyRevision=catalog.services.find(s=>s.id==='10001').durationPolicy.revision;
        for(const deleteFirst of [true,false]){
          const saved=await transaction({permission:'tenant.queue.operate'},c=>drafts.command(c,scope,{action:'create',operationKey:randomUUID(),body:{contractVersion:4,customer:{name:'Delete Publish race'},catalogRevision:catalog.catalogRevision,serviceSelections:input}}));
          const deletion={draftId:saved.plan.id,operationKey:randomUUID(),body:{expectedPlanRevision:'1'}};
          const publication={draftId:saved.plan.id,operationKey:randomUUID(),body:{expectedPlanRevision:'1',expectedCatalogRevision:catalog.catalogRevision}};
          const before=(await pool.query('SELECT count(*)::int n FROM allowance_operations')).rows[0].n;
          const remove=()=>transaction({permission:'tenant.queue.operate'},c=>drafts.remove(c,scope,deletion));
          const publish=()=>service.publish(context,publication);
          const outcomes=await Promise.allSettled(deleteFirst?[remove(),publish()]:[publish(),remove()]);
          assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1);
          const row=(await pool.query('SELECT state,published_ticket_id FROM queue_plan_drafts WHERE id=$1',[saved.plan.id])).rows[0];
          if(row.state==='discarded'){
            assert.equal(row.published_ticket_id,null);assert.equal((await pool.query('SELECT count(*)::int n FROM allowance_operations')).rows[0].n,before);
            assert.equal((await remove()).replayed,true);await assert.rejects(publish(),{code:'DRAFT_DELETED'});
          }else{
            assert.equal(row.state,'published');assert.equal((await pool.query('SELECT count(*)::int n FROM allowance_operations')).rows[0].n,before+1);
            assert.equal((await publish()).plan.ticketId,String(row.published_ticket_id));await assert.rejects(remove(),{code:'PLAN_LOCKED'});
          }
          assert.equal((await pool.query('SELECT count(*)::int n FROM queue_plan_versions WHERE draft_id=$1',[saved.plan.id])).rows[0].n,row.state==='published'?1:0);
        }
      });
    } finally {
      await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await pool.end();
    }
  },
);
