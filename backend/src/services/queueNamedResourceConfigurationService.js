const { randomUUID } = require("node:crypto");
const db = require("../config/db");
const receipts = require("../repositories/queueCommandReceipt");
const {
  withVendorQueueTransaction,
} = require("./vendorQueueTransactionService");
const { assertPublicTextFieldsAllowed } = require("./contentModeration");

function fail(code, message, statusCode = 409) {
  throw Object.assign(new Error(message), { code, statusCode });
}
function id(value) {
  if (
    typeof value !== "string" ||
    !/^[1-9]\d{0,18}$/u.test(value) ||
    BigInt(value) > 9223372036854775807n
  )
    fail(
      "INVALID_RESOURCE_CONFIGURATION",
      "A valid scoped identifier is required.",
      400,
    );
  return value;
}
function uuid(value) {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
      value,
    )
  )
    fail(
      "INVALID_RESOURCE_CONFIGURATION",
      "A valid named member identifier is required.",
      400,
    );
  return value;
}
async function run(context, permission, operation) {
  const { tenant, location, actorUserId } = context;
  return withVendorQueueTransaction(
    { pool: db.pool, tenant, location, actorUserId, permission },
    (client, _ledger, actor) =>
      operation(client, {
        tenantId: String(tenant._id),
        locationId: String(location._id),
        actorUserId: String(actorUserId),
        actorRole: actor.tenantMemberships[0].role,
      }),
  );
}
async function mutateConfiguration(context, permission, operation) {
  const result = await run(context, permission, operation);
  // The transaction has committed; a scoped hint prompts readers to refetch.
  require("./queueEvents").publish(context.tenant.slug,
    {type:"queue-plans-updated",locationId:String(context.location._id)},
    {locationId:context.location._id});
  return result;
}
async function poolFor(client, scope, poolId, { includeArchived = false } = {}) {
  const pool = (
    await client.query(
      "SELECT id::text,name,capacity,to_jsonb(location_resource_pools)->>'archived_at' AS archived_at FROM location_resource_pools WHERE tenant_id=$1 AND location_id=$2 AND id=$3 FOR SHARE",
      [scope.tenantId, scope.locationId, id(poolId)],
    )
  ).rows[0];
  if (!pool)
    fail("RESOURCE_NOT_FOUND", "Resource pool not found at this branch.", 404);
  if (pool.archived_at && !includeArchived) fail("RESOURCE_POOL_ARCHIVED", "This resource pool is archived. Named resources cannot be changed.");
  return pool;
}
async function listMembers(context, poolId) {
  return run(context, "tenant.location.manage", async (client, scope) => {
    const pool = await poolFor(client, scope, poolId, { includeArchived: true });
    const members = (
      await client.query(
        `SELECT m.id,m.name,m.revision::text,m.display_order,m.is_active,to_jsonb(m)->>'archived_at' AS archived_at,
      CASE WHEN EXISTS(SELECT 1 FROM resource_allocations a WHERE a.pool_id=m.pool_id AND a.tenant_id=m.tenant_id AND a.location_id=m.location_id AND a.resource_member_id IS NULL AND a.released_at IS NULL)
        OR EXISTS(SELECT 1 FROM resource_ledger_reservations r WHERE r.pool_id=m.pool_id AND r.tenant_id=m.tenant_id AND r.location_id=m.location_id AND r.resource_member_id IS NULL AND r.state='protected') THEN 'unknown'
      WHEN EXISTS(SELECT 1 FROM resource_allocations a WHERE a.resource_member_id=m.id AND a.released_at IS NULL) THEN 'occupied'
      WHEN EXISTS(SELECT 1 FROM resource_ledger_reservations r WHERE r.resource_member_id=m.id AND r.state='protected') THEN 'protected'
      ELSE 'provisional_free' END AS availability,clock_timestamp() AS observed_at
      FROM resource_pool_members m WHERE m.tenant_id=$1 AND m.location_id=$2 AND m.pool_id=$3 ORDER BY m.display_order,m.id`,
        [scope.tenantId, scope.locationId, pool.id],
      )
    ).rows;
    return {
      pool,
      members: members.map((member) => ({
        id: member.id,
        name: member.name,
        revision: member.revision,
        displayOrder: Number(member.display_order),
        isActive: member.is_active,
        archivedAt: member.archived_at || null,
        availability: {
          state: member.archived_at ? "archived" : member.is_active ? member.availability : "inactive",
          provisional: true,
          observedAt: member.observed_at,
        },
      })),
      holdsCreated: false,
    };
  });
}
async function reorderMembers(context, { poolId, memberIds, operationKey }) {
  if (!Array.isArray(memberIds) || memberIds.length > 100 || new Set(memberIds).size !== memberIds.length) fail("INVALID_RESOURCE_CONFIGURATION", "Provide each resource once in the new order.", 400);
  memberIds.forEach(uuid);
  return mutateConfiguration(context, "tenant.location.manage", async (client, scope) => {
    const pool = await poolFor(client, scope, poolId);
    return receipts.execute(client, scope, { operationKey, action: "named_member_reorder", target: pool.id, payload: { memberIds } }, async () => {
      const rows = (await client.query("SELECT id,revision::text FROM resource_pool_members WHERE tenant_id=$1 AND location_id=$2 AND pool_id=$3 AND archived_at IS NULL FOR UPDATE", [scope.tenantId, scope.locationId, pool.id])).rows;
      if (rows.length !== memberIds.length || rows.some((row) => !memberIds.includes(row.id))) fail("RESOURCE_CONFIGURATION_CHANGED", "The resource list changed. Reload before reordering.");
      for (const [displayOrder, memberId] of memberIds.entries()) {
        const row = rows.find((item) => item.id === memberId);
        const revision = String(BigInt(row.revision) + 1n);
        await client.query("UPDATE resource_pool_members SET display_order=$4,revision=$5 WHERE tenant_id=$1 AND location_id=$2 AND pool_id=$3 AND id=$6", [scope.tenantId, scope.locationId, pool.id, displayOrder, revision, memberId]);
        await client.query("INSERT INTO resource_pool_member_versions(member_id,pool_id,tenant_id,location_id,revision,name,is_active,actor_user_id,actor_role) SELECT id,pool_id,tenant_id,location_id,$2,name,is_active,$3,$4 FROM resource_pool_members WHERE id=$1", [memberId, revision, scope.actorUserId, scope.actorRole]);
      }
      return { reordered: true };
    });
  });
}
function memberBody(body, updating) {
  const allowed = updating
    ? ["name", "isActive", "expectedRevision", "displayOrder"]
    : ["poolId", "name", "isActive", "displayOrder"];
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => !allowed.includes(key)) ||
    typeof body.name !== "string" ||
    !body.name.trim() ||
    body.name.trim().length > 120 ||
    typeof body.isActive !== "boolean" ||
    (updating && typeof body.expectedRevision !== "string")
  )
    fail(
      "INVALID_RESOURCE_CONFIGURATION",
      "Provide a name, active state and current revision where required.",
      400,
    );
  assertPublicTextFieldsAllowed({ "Resource name": body.name });
  if (body.displayOrder !== undefined && (!Number.isInteger(body.displayOrder) || body.displayOrder < 0 || body.displayOrder > 10000)) fail("INVALID_RESOURCE_CONFIGURATION", "List order must be a whole number from 0 to 10000.", 400);
}
async function assertMemberAvailableForEdit(client,scope,member) {
  if((await client.query(`SELECT 1 FROM resource_allocations WHERE tenant_id=$2 AND location_id=$3 AND pool_id=$4
      AND (resource_member_id=$1 OR resource_member_id IS NULL) AND released_at IS NULL
    UNION ALL SELECT 1 FROM resource_ledger_reservations WHERE tenant_id=$2 AND location_id=$3 AND pool_id=$4
      AND (resource_member_id=$1 OR resource_member_id IS NULL) AND state='protected' LIMIT 1`,[member.id,scope.tenantId,scope.locationId,String(member.pool_id)])).rows.length)
    fail("RESOURCE_IN_USE","Resolve this resource’s protection or occupancy, including unassigned pool usage, before changing it. No resource is released by this action.");
}
async function assertMemberWorkflowEditable(client,scope,member) {
  const block=await require("./resourcePoolLifecycleService").archiveBlock(client,scope,String(member.pool_id),member.id);
  if(block) fail("RESOURCE_MEMBER_WORKFLOW_IN_PROGRESS","This resource is still required by unfinished stages or retries of an already-started request. Finish that work before disabling, renaming or archiving it.");
}
async function saveMember(context, { memberId = null, body, operationKey }) {
  memberBody(body, Boolean(memberId));
  if (memberId) uuid(memberId);
  else id(body.poolId);
  return mutateConfiguration(context, "tenant.location.manage", (client, scope) =>
    receipts.execute(
      client,
      scope,
      {
        operationKey,
        action: memberId ? "named_member_update" : "named_member_create",
        target: memberId || body.poolId,
        payload: body,
      },
      async () => {
        const old = memberId
          ? (
              await client.query(
                "SELECT * FROM resource_pool_members WHERE tenant_id=$1 AND location_id=$2 AND id=$3 FOR UPDATE",
                [scope.tenantId, scope.locationId, memberId],
              )
            ).rows[0]
          : null;
        if (memberId && !old)
          fail(
            "RESOURCE_NOT_FOUND",
            "Named member not found at this branch.",
            404,
          );
        if (old && String(old.revision) !== body.expectedRevision)
          fail(
            "STALE_REVISION",
            "The named member changed. Reload before saving.",
          );
        const pool = await poolFor(
          client,
          scope,
          old ? String(old.pool_id) : body.poolId,
        );
        if (old?.archived_at) fail("RESOURCE_MEMBER_ARCHIVED","This resource is archived. Archived resources cannot be enabled, disabled or edited.");
        if (old) {
          await assertMemberAvailableForEdit(client,scope,old);
          if(!body.isActive || body.name.trim()!==old.name) await assertMemberWorkflowEditable(client,scope,old);
        }
        const active = (
          await client.query(
            "SELECT count(*)::int AS count FROM resource_pool_members WHERE tenant_id=$1 AND location_id=$2 AND pool_id=$3 AND is_active=TRUE AND (to_jsonb(resource_pool_members)->>'archived_at') IS NULL AND ($4::uuid IS NULL OR id<>$4)",
            [scope.tenantId, scope.locationId, pool.id, memberId],
          )
        ).rows[0].count;
        const wasActive = old ? old.is_active : false;
        const capacityDelta = body.isActive === wasActive ? 0 : body.isActive ? 1 : -1;
        const nextCapacity = pool.capacity + capacityDelta;
        if (nextCapacity < 1 || nextCapacity > 100)
          fail(
            "RESOURCE_CAPACITY_EXCEEDED",
            "The pool must retain capacity between 1 and 100.",
          );
        if (body.isActive && active >= nextCapacity)
          fail(
            "RESOURCE_CAPACITY_EXCEEDED",
            "Active named members cannot exceed the configured pool capacity.",
          );
        if (capacityDelta < 0) {
          const requirement = (
            await client.query(
              "SELECT COALESCE(max(units_required), 0)::int AS units FROM service_resource_requirements WHERE tenant_id=$1 AND location_id=$2 AND pool_id=$3",
              [scope.tenantId, scope.locationId, pool.id],
            )
          ).rows[0].units;
          if (requirement > nextCapacity)
            fail(
              "RESOURCE_CAPACITY_CONFLICT",
              "This resource pool still has a service requirement above its new capacity.",
            );
        }
        const nextId = memberId || randomUUID(),
          revision = old ? String(BigInt(old.revision) + 1n) : "1";
        if (capacityDelta > 0)
          await client.query(
            "UPDATE location_resource_pools SET capacity=$4,revision=revision+1 WHERE tenant_id=$1 AND location_id=$2 AND id=$3 AND archived_at IS NULL",
            [scope.tenantId, scope.locationId, pool.id, nextCapacity],
          );
        await client.query(
          `INSERT INTO resource_pool_members(id,tenant_id,location_id,pool_id,name,revision,is_active,display_order) VALUES($1,$2,$3,$4,$5,$6,$7,COALESCE($8,(SELECT COALESCE(max(display_order)+1,0) FROM resource_pool_members WHERE tenant_id=$2 AND location_id=$3 AND pool_id=$4)))
      ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,revision=EXCLUDED.revision,is_active=EXCLUDED.is_active,display_order=COALESCE(EXCLUDED.display_order,resource_pool_members.display_order)`,
          [
            nextId,
            scope.tenantId,
            scope.locationId,
            pool.id,
            body.name.trim(),
            revision,
            body.isActive,
            body.displayOrder === undefined ? null : body.displayOrder,
          ],
        );
        if (capacityDelta < 0)
          await client.query(
            "UPDATE location_resource_pools SET capacity=$4,revision=revision+1 WHERE tenant_id=$1 AND location_id=$2 AND id=$3 AND archived_at IS NULL",
            [scope.tenantId, scope.locationId, pool.id, nextCapacity],
          );
        await client.query(
          `INSERT INTO resource_pool_member_versions(member_id,pool_id,tenant_id,location_id,revision,name,is_active,actor_user_id,actor_role)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            nextId,
            pool.id,
            scope.tenantId,
            scope.locationId,
            revision,
            body.name.trim(),
            body.isActive,
            scope.actorUserId,
            scope.actorRole,
          ],
        );
        await client.query(
          "UPDATE resource_ledger_scopes SET revision=revision+1 WHERE tenant_id=$1 AND location_id=$2",
          [scope.tenantId, scope.locationId],
        );
        return {
          member: {
            id: nextId,
            poolId: pool.id,
            name: body.name.trim(),
            revision,
            isActive: body.isActive,
            displayOrder: Number(old?.display_order ?? body.displayOrder ?? 0),
            archivedAt: null,
          },
          holdsCreated: false,
        };
      },
    ),
  ).catch((error) => {
    if (error.code === "23505")
      fail(
        "RESOURCE_NAME_CONFLICT",
        "A member with this name already exists in the pool.",
      );
    throw error;
  });
}
async function archiveMember(context,{memberId,body,operationKey}) {
  uuid(memberId);
  if(!body || typeof body!=="object" || Array.isArray(body) || Object.keys(body).length!==1 || typeof body.expectedRevision!=="string") fail("INVALID_RESOURCE_CONFIGURATION","Provide the current resource revision.",400);
  return mutateConfiguration(context,"tenant.location.manage",(client,scope)=>receipts.execute(client,scope,{operationKey,action:"named_member_archive",target:memberId,payload:body},async()=>{
    const old=(await client.query("SELECT * FROM resource_pool_members WHERE tenant_id=$1 AND location_id=$2 AND id=$3 FOR UPDATE",[scope.tenantId,scope.locationId,memberId])).rows[0];
    if(!old) fail("RESOURCE_NOT_FOUND","Named resource not found at this branch.",404);
    if(String(old.revision)!==body.expectedRevision) fail("STALE_REVISION","The named resource changed. Reload before archiving.");
    await poolFor(client,scope,String(old.pool_id));
    let current=old;
    if(!old.archived_at){
      await assertMemberAvailableForEdit(client,scope,old);
      await assertMemberWorkflowEditable(client,scope,old);
      current=(await client.query(`UPDATE resource_pool_members SET revision=revision+1,archived_at=clock_timestamp(),archived_by_user_id=$4
        WHERE tenant_id=$1 AND location_id=$2 AND id=$3 RETURNING *`,[scope.tenantId,scope.locationId,memberId,scope.actorUserId])).rows[0];
      // Copy the database timestamp directly; a JS Date would truncate its microseconds.
      await client.query(`INSERT INTO resource_pool_member_versions(member_id,pool_id,tenant_id,location_id,revision,name,is_active,actor_user_id,actor_role,archived_at,archived_by_user_id)
        SELECT id,pool_id,tenant_id,location_id,revision,name,is_active,$4,$5,archived_at,archived_by_user_id
        FROM resource_pool_members WHERE tenant_id=$1 AND location_id=$2 AND id=$3`,[scope.tenantId,scope.locationId,memberId,scope.actorUserId,scope.actorRole]);
      await client.query("UPDATE resource_ledger_scopes SET revision=revision+1 WHERE tenant_id=$1 AND location_id=$2",[scope.tenantId,scope.locationId]);
    }
    return {member:{id:memberId,poolId:String(old.pool_id),name:old.name,revision:String(current.revision),isActive:old.is_active,archivedAt:current.archived_at},holdsCreated:false};
  }));
}
function policyBody(body) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some(
      (key) =>
        ![
          "expectedRevision",
          "selectionMode",
          "durationOptionsMinutes",
          "allowedExtraServiceIds",
        ].includes(key),
    ) ||
    typeof body.expectedRevision !== "string" ||
    !["named", "pooled"].includes(body.selectionMode) ||
    !Array.isArray(body.durationOptionsMinutes) ||
    !body.durationOptionsMinutes.length ||
    body.durationOptionsMinutes.length > 96 ||
    body.durationOptionsMinutes.some(
      (value) => !Number.isInteger(value) || value < 5 || value > 480,
    ) ||
    new Set(body.durationOptionsMinutes).size !==
      body.durationOptionsMinutes.length ||
    !Array.isArray(body.allowedExtraServiceIds) ||
    body.allowedExtraServiceIds.length > 20 ||
    new Set(body.allowedExtraServiceIds).size !==
      body.allowedExtraServiceIds.length
  )
    fail(
      "INVALID_RESOURCE_CONFIGURATION",
      "Provide a current revision, selection mode, unique permitted durations and allowed extras.",
      400,
    );
  body.allowedExtraServiceIds.forEach(id);
}
async function offered(client, scope, serviceIds) {
  return (
    await client.query(
      `SELECT s.id::text,r.pool_id::text,r.units_required FROM vendor_services s JOIN location_services l ON(l.service_id,l.tenant_id)=(s.id,s.tenant_id)
    JOIN service_resource_requirements r ON(r.service_id,r.tenant_id,r.location_id)=(s.id,s.tenant_id,l.location_id)
    WHERE s.tenant_id=$1 AND l.location_id=$2 AND s.id=ANY($3::bigint[]) AND s.is_active=TRUE AND l.is_active=TRUE FOR SHARE OF s,l,r`,
      [scope.tenantId, scope.locationId, serviceIds],
    )
  ).rows;
}
async function getPolicies(context) {
  return run(context, "tenant.service.manage", async (client, scope) => ({
    policies: (
      await client.query(
        `SELECT service_id::text,revision::text,selection_mode,duration_options,extra_service_ids
    FROM queue_service_policies WHERE tenant_id=$1 AND location_id=$2 ORDER BY service_id`,
        [scope.tenantId, scope.locationId],
      )
    ).rows.map((row) => ({
      serviceId: row.service_id,
      revision: row.revision,
      selectionMode: row.selection_mode,
      durationOptionsMinutes: row.duration_options,
      allowedExtraServiceIds: row.extra_service_ids,
      quote: {
        status: "unavailable",
        reasonCode: "SERVICE_PRICING_NOT_CONFIGURED",
      },
      extraScheduling: "same_start_within_parent",
    })),
    executionEnabled: false,
  }));
}
async function savePolicy(context, serviceId, body, operationKey) {
  id(serviceId);
  policyBody(body);
  if (body.allowedExtraServiceIds.includes(serviceId))
    fail(
      "INVALID_RESOURCE_CONFIGURATION",
      "A service cannot be its own extra.",
      400,
    );
  return mutateConfiguration(context, "tenant.service.manage", (client, scope) =>
    receipts.execute(
      client,
      scope,
      {
        operationKey,
        action: "queue_service_policy",
        target: serviceId,
        payload: body,
      },
      async () => {
        const services = await offered(client, scope, [
          serviceId,
          ...body.allowedExtraServiceIds,
        ]);
        if (services.length !== body.allowedExtraServiceIds.length + 1)
          fail(
            "INVALID_RESOURCE_CONFIGURATION",
            "Each service and extra must be active, branch-offered and resource-configured.",
            400,
          );
        const service = services.find((row) => row.id === serviceId);
        if (body.selectionMode === "named" && service.units_required !== 1)
          fail(
            "INVALID_RESOURCE_CONFIGURATION",
            "A named member consumes exactly one pool unit.",
            400,
          );
        if (
          body.selectionMode === "named" &&
          services.some(
            (row) => row.id !== serviceId && row.pool_id === service.pool_id,
          )
        )
          fail(
            "INVALID_RESOURCE_CONFIGURATION",
            "An extra must not duplicate its parent named resource demand.",
            400,
          );
        const old = (
          await client.query(
            "SELECT revision::text,to_jsonb(queue_service_policies)->'configuration' AS configuration FROM queue_service_policies WHERE tenant_id=$1 AND location_id=$2 AND service_id=$3 FOR UPDATE",
            [scope.tenantId, scope.locationId, serviceId],
          )
        ).rows[0];
        if ((old?.revision || "0") !== body.expectedRevision)
          fail(
            "STALE_REVISION",
            "The queue service policy changed. Reload before saving.",
          );
        if (old?.configuration)
          fail(
            "USE_SERVICE_CONFIGURATION",
            "Use the versioned service configuration editor for this service.",
          );
        const revision = String(BigInt(old?.revision || "0") + 1n);
        const options = [...body.durationOptionsMinutes].sort((a, b) => a - b);
        await client.query(
          `INSERT INTO queue_service_policies(tenant_id,location_id,service_id,revision,selection_mode,duration_options,extra_service_ids)
      VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb) ON CONFLICT(tenant_id,location_id,service_id) DO UPDATE SET revision=EXCLUDED.revision,
      selection_mode=EXCLUDED.selection_mode,duration_options=EXCLUDED.duration_options,extra_service_ids=EXCLUDED.extra_service_ids`,
          [
            scope.tenantId,
            scope.locationId,
            serviceId,
            revision,
            body.selectionMode,
            JSON.stringify(options),
            JSON.stringify(body.allowedExtraServiceIds),
          ],
        );
        const policy = {
          serviceId,
          revision,
          selectionMode: body.selectionMode,
          durationOptionsMinutes: options,
          allowedExtraServiceIds: body.allowedExtraServiceIds,
          quote: {
            status: "unavailable",
            reasonCode: "SERVICE_PRICING_NOT_CONFIGURED",
          },
          extraScheduling: "same_start_within_parent",
        };
        await client.query(
          "INSERT INTO queue_service_policy_versions(tenant_id,location_id,service_id,revision,snapshot,actor_user_id,actor_role) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7)",
          [
            scope.tenantId,
            scope.locationId,
            serviceId,
            revision,
            JSON.stringify(policy),
            scope.actorUserId,
            scope.actorRole,
          ],
        );
        await client.query(
          "UPDATE resource_ledger_scopes SET revision=revision+1 WHERE tenant_id=$1 AND location_id=$2",
          [scope.tenantId, scope.locationId],
        );
        return { policy, executionEnabled: false };
      },
    ),
  );
}
async function getConfiguration(context, serviceId) {
  id(serviceId);
  return run(context, "tenant.service.manage", async (client, scope) => {
    const row = (
      await client.query(
        `SELECT revision::text,configuration FROM queue_service_policies
      WHERE tenant_id=$1 AND location_id=$2 AND service_id=$3`,
        [scope.tenantId, scope.locationId, serviceId],
      )
    ).rows[0];
    return {
      contractVersion: 4,
      configurationRevision: row?.revision || "0",
      policy: row?.configuration
        ? {
            contractVersion: 4,
            serviceId,
            revision: row.revision,
            configuration: row.configuration,
          }
        : null,
    };
  });
}
async function saveConfiguration(context, serviceId, body, operationKey) {
  id(serviceId);
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some(
      (key) => !["expectedRevision", "configuration"].includes(key),
    ) ||
    typeof body.expectedRevision !== "string" ||
    !/^\d{1,19}$/u.test(body.expectedRevision)
  )
    fail(
      "INVALID_SERVICE_POLICY",
      "A complete configuration and current revision are required.",
      400,
    );
  const configuration = require("./queueServicePolicyV4").configuration(
    body.configuration,
  );
  const extraIds = configuration.extras.map((extra) => extra.serviceId);
  if (extraIds.includes(serviceId))
    fail("INVALID_SERVICE_POLICY", "A service cannot be its own extra.", 400);
  return mutateConfiguration(context, "tenant.service.manage", (client, scope) =>
    receipts.execute(
      client,
      scope,
      {
        operationKey,
        action: "queue_service_configuration_v4",
        target: serviceId,
        payload: body,
      },
      async () => {
        const services = await offered(client, scope, [serviceId, ...extraIds]);
        if (services.length !== extraIds.length + 1)
          fail(
            "INVALID_SERVICE_POLICY",
            "Every service and extra must be active, branch-offered and resource-configured.",
            400,
          );
        const service = services.find((row) => row.id === serviceId);
        if (
          configuration.assignment.mode === "named" &&
          (service.units_required !== 1 ||
            services.some(
              (row) => row.id !== serviceId && row.pool_id === service.pool_id,
            ))
        )
          fail(
            "INVALID_SERVICE_POLICY",
            "Named selections require one resource unit and distinct extra capacity.",
            400,
          );
        const old = (
          await client.query(
            "SELECT revision::text FROM queue_service_policies WHERE tenant_id=$1 AND location_id=$2 AND service_id=$3 FOR UPDATE",
            [scope.tenantId, scope.locationId, serviceId],
          )
        ).rows[0];
        if ((old?.revision || "0") !== body.expectedRevision)
          fail(
            "STALE_REVISION",
            "The service configuration changed. Reload before saving.",
          );
        const extraPolicies = (
          await client.query(
            `SELECT configuration FROM queue_service_policies WHERE tenant_id=$1 AND location_id=$2
          AND service_id=ANY($3::bigint[]) AND configuration IS NOT NULL FOR SHARE`,
            [scope.tenantId, scope.locationId, extraIds],
          )
        ).rows;
        if (
          extraPolicies.some(
            (row) =>
              row.configuration.extras.length,
          )
        )
          fail(
            "UNSUPPORTED_EXTRA_NESTING",
            "Eligible extras must retain a single execution level without nested extras.",
            400,
          );
        const references = (
          await client.query(
            `SELECT service_id FROM queue_service_policies WHERE tenant_id=$1 AND location_id=$2 AND service_id<>$3
          AND configuration->'extras' @> $4::jsonb FOR SHARE`,
            [
              scope.tenantId,
              scope.locationId,
              serviceId,
              JSON.stringify([{ serviceId }]),
            ],
          )
        ).rows;
        if (
          references.length &&
          configuration.extras.length
        )
          fail(
            "UNSUPPORTED_EXTRA_NESTING",
            "This service is already used as an extra and cannot introduce another level of extras.",
            400,
          );
        const revision = String(BigInt(old?.revision || "0") + 1n),
          durations = [];
        for (
          let count = configuration.duration.minCount;
          count <= configuration.duration.maxCount;
          count += configuration.duration.stepCount
        )
          durations.push(count * configuration.duration.baseMinutes);
        await client.query(
          `INSERT INTO queue_service_policies(tenant_id,location_id,service_id,revision,selection_mode,duration_options,extra_service_ids,configuration)
      VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb) ON CONFLICT(tenant_id,location_id,service_id) DO UPDATE SET revision=EXCLUDED.revision,
      selection_mode=EXCLUDED.selection_mode,duration_options=EXCLUDED.duration_options,extra_service_ids=EXCLUDED.extra_service_ids,configuration=EXCLUDED.configuration`,
          [
            scope.tenantId,
            scope.locationId,
            serviceId,
            revision,
            configuration.assignment.mode === "named" ? "named" : "pooled",
            JSON.stringify(durations),
            JSON.stringify(extraIds),
            JSON.stringify(configuration),
          ],
        );
        const policy = {
          contractVersion: 4,
          serviceId,
          revision,
          configuration,
        };
        await client.query(
          `INSERT INTO queue_service_policy_versions(tenant_id,location_id,service_id,revision,snapshot,actor_user_id,actor_role)
      VALUES($1,$2,$3,$4,$5::jsonb,$6,$7)`,
          [
            scope.tenantId,
            scope.locationId,
            serviceId,
            revision,
            JSON.stringify(policy),
            scope.actorUserId,
            scope.actorRole,
          ],
        );
        await client.query(
          "UPDATE resource_ledger_scopes SET revision=revision+1 WHERE tenant_id=$1 AND location_id=$2",
          [scope.tenantId, scope.locationId],
        );
        return { contractVersion: 4, configurationRevision: revision, policy };
      },
    ),
  );
}
module.exports = {
  getConfiguration,
  saveConfiguration,
  listMembers,
  reorderMembers,
  saveMember,
  archiveMember,
  getPolicies,
  savePolicy,
  policyBody,
  memberBody,
};
