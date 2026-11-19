const { createHash } = require("node:crypto");

const messages = {
  service_requirements: "service requirements",
  named_members: "named resources or their history",
  reservations: "reservations or reservation history",
  allocations: "allocations or allocation history",
  queue_drafts: "queue drafts or draft history",
  published_plans: "published plans or execution history",
  policies: "queue policies or policy history",
  command_history: "recorded commands",
  other_references: "other resource references"
};
function category(table) {
  if (table === "service_resource_requirements") return "service_requirements";
  if (table.startsWith("resource_pool_member")) return "named_members";
  if (table === "resource_ledger_reservations") return "reservations";
  if (table === "resource_allocations") return "allocations";
  if (["queue_plan_drafts", "queue_plan_events"].includes(table)) return "queue_drafts";
  if (table.includes("polic")) return "policies";
  if (table.includes("command")) return "command_history";
  if (/^(queue_|ticket_service_)/u.test(table)) return "published_plans";
  return "other_references";
}
function identifier(value) { return `"${value.replaceAll('"', '""')}"`; }

// Discover scoped direct references and structured pool IDs in current/frozen JSON.
// Do not treat unrelated numeric values or human-readable pool names as references.
// All callers hold the branch lock; destructive callers additionally lock the pool.
async function dependencies(client, scope, poolId) {
  const tables = (await client.query(`SELECT table_name,
      bool_or(column_name='pool_id') AS direct,
      bool_or(data_type='jsonb') AS json
    FROM information_schema.columns WHERE table_schema=current_schema()
    GROUP BY table_name HAVING bool_or(column_name='tenant_id') AND bool_or(column_name='location_id')
      AND (bool_or(column_name='pool_id') OR (bool_or(data_type='jsonb')
        AND table_name ~ '^(queue_|ticket_service_|resource_|booking_)'))
    ORDER BY table_name`)).rows;
  const queries = [];
  for (const table of tables) {
    // Lifecycle tombstones do not make other pools referenced through response lists.
    if (table.table_name === "resource_pool_lifecycle_commands") continue;
    const predicates = [];
    if (table.direct) predicates.push("t.pool_id=p.id");
    if (table.json) for (const key of ["poolId", "pool_id"]) predicates.push(`jsonb_path_exists(to_jsonb(t),
      '$.**.${key} ? (@ == $id || @ == $number)',jsonb_build_object('id',p.id::text,'number',p.id))`);
    queries.push(`SELECT p.id::text AS pool_id,count(*)::int AS count,'${category(table.table_name)}' AS code
      FROM ${identifier(table.table_name)} t JOIN location_resource_pools p
      ON p.tenant_id=t.tenant_id AND p.location_id=t.location_id AND (${predicates.join(" OR ")})
      WHERE t.tenant_id=$1 AND t.location_id=$2 AND ($3::bigint IS NULL OR p.id=$3::bigint) GROUP BY p.id`);
  }
  const rows = queries.length ? (await client.query(queries.join(" UNION ALL "),[scope.tenantId,scope.locationId,poolId || null])).rows : [];
  const byPool = new Map();
  for (const row of rows) {
    if (!byPool.has(row.pool_id)) byPool.set(row.pool_id,new Map());
    const counts=byPool.get(row.pool_id);
    counts.set(row.code,(counts.get(row.code)||0)+row.count);
  }
  const lists=new Map([...byPool].map(([key,counts])=>[key,[...counts].sort(([a],[b])=>a.localeCompare(b)).map(([code,count])=>({code,count,label:messages[code]}))]));
  return poolId ? lists.get(poolId)||[] : lists;
}

function deletion(deps, block = null) {
  return {
    allowed: deps.length === 0,
    reasonCode: deps.length ? "RESOURCE_POOL_REFERENCED" : null,
    message: deps.length ? `This pool is referenced by ${deps.map(d => d.label).join(", ")}. ${block ? block.message : "Archive it to preserve existing work and history."}` : "This unused pool can be deleted.",
    dependencies: deps,
    archiveAllowed: !block,
    ...(block ? { archiveBlock: block } : {})
  };
}
async function archiveBlock(client, scope, poolId, memberId = null) {
  const tables=(await client.query("SELECT to_regclass('queue_stage_attempts') AS stages,to_regclass('ticket_service_plans') AS plans,to_regclass('queue_child_attempts') AS children")).rows[0];
  if(!tables.stages || !tables.plans) return null;
  const interrupted=tables.children ? `EXISTS(SELECT 1 FROM queue_child_attempts c WHERE c.tenant_id=p.tenant_id AND c.location_id=p.location_id
    AND c.ticket_id=p.ticket_id AND c.plan_revision=p.revision AND c.is_current AND c.pool_id=$3::bigint AND c.state='interrupted' AND ($4::uuid IS NULL OR c.resource_member_id=$4::uuid))` : "FALSE";
  const blocked=(await client.query(`SELECT count(DISTINCT p.ticket_id)::int AS count
    FROM ticket_service_plans p JOIN tickets t ON(t.id,t.tenant_id,t.location_id)=(p.ticket_id,p.tenant_id,p.location_id)
    CROSS JOIN LATERAL jsonb_array_elements(p.items) item
    JOIN LATERAL (SELECT a.state FROM queue_stage_attempts a WHERE a.tenant_id=p.tenant_id AND a.location_id=p.location_id
      AND a.ticket_id=p.ticket_id AND a.stage_id::text=item->>'stageId' ORDER BY a.attempt DESC LIMIT 1) stage ON TRUE
    WHERE p.tenant_id=$1 AND p.location_id=$2 AND item->'resource'->>'poolId'=$3::text
      AND ($4::uuid IS NULL OR item->>'resourceMemberId'=$4::text)
      AND t.service_started_at IS NOT NULL AND t.service_ended_at IS NULL
      AND t.status NOT IN('served','cancelled','unserved','expired','skipped')
      AND (stage.state IN('pending','waiting','called','interrupted') OR ${interrupted})`,[scope.tenantId,scope.locationId,poolId,memberId])).rows[0];
  if(!blocked.count) return null;
  return {code:"RESOURCE_POOL_WORKFLOW_IN_PROGRESS",message:"This pool is still required by unfinished stages or retries of an already-started request. Finish that work before archiving the pool.",affectedRequests:blocked.count};
}
async function describe(client, scope, pools) {
  const lists = await dependencies(client, scope, null);
  const result=[];
  for(const pool of pools){
    const block=pool.archived_at ? null : await archiveBlock(client,scope,pool.id);
    result.push({...pool,deletion:deletion(lists.get(pool.id)||[],block)});
  }
  return result;
}
async function execute(client, scope, body, read, current) {
  if (typeof body.operationKey !== "string" || !/^[\x21-\x7e]{1,120}$/u.test(body.operationKey)) {
    throw Object.assign(new Error("An operation key is required."), { statusCode: 400, code: "INVALID_COMMAND" });
  }
  const hash = createHash("sha256").update(JSON.stringify({ action: body.action, poolId: body.poolId, version: body.version })).digest("hex");
  const key = [scope.tenantId, scope.locationId, scope.actorUserId, body.operationKey];
  const prior = (await client.query(`SELECT payload_hash,result FROM resource_pool_lifecycle_commands
    WHERE tenant_id=$1 AND location_id=$2 AND actor_user_id=$3 AND operation_key=$4`, key)).rows[0];
  if (prior) {
    if (prior.payload_hash !== hash) throw Object.assign(new Error("This operation key was used for a different request."), { statusCode: 409, code: "IDEMPOTENCY_CONFLICT" });
    return prior.result;
  }
  if (current.version !== body.version) throw Object.assign(new Error("Resource configuration changed. Reload and review it before saving."), { statusCode: 409, code: "STALE_REVISION" });
  const pool = (await client.query(`SELECT *,id::text FROM location_resource_pools
    WHERE tenant_id=$1 AND location_id=$2 AND id=$3 FOR UPDATE`, [scope.tenantId, scope.locationId, body.poolId])).rows[0];
  if (!pool) throw Object.assign(new Error("Resource pool not found at this location."), { statusCode: 404 });
  const block = pool.archived_at ? null : await archiveBlock(client,scope,body.poolId);
  const disposition = deletion(await dependencies(client, scope, body.poolId),block);
  if (body.action === "deletePool" && !disposition.allowed) {
    throw Object.assign(new Error(disposition.message), { statusCode: 409, code: "RESOURCE_POOL_REFERENCED", poolDeletion: disposition });
  }
  if(body.action === "archivePool" && block) throw Object.assign(new Error(block.message),{statusCode:409,code:block.code});
  let changed = false;
  if (body.action === "deletePool") {
    await client.query("DELETE FROM location_resource_pools WHERE tenant_id=$1 AND location_id=$2 AND id=$3", [scope.tenantId, scope.locationId, body.poolId]);
    changed = true;
  } else if (!pool.archived_at) {
    await client.query(`UPDATE location_resource_pools SET archived_at=clock_timestamp(),archived_by_user_id=$4,revision=revision+1
      WHERE tenant_id=$1 AND location_id=$2 AND id=$3`, [scope.tenantId, scope.locationId, body.poolId, scope.actorUserId]);
    changed = true;
  }
  if (changed) await client.query("UPDATE resource_ledger_scopes SET revision=revision+1 WHERE tenant_id=$1 AND location_id=$2", [scope.tenantId, scope.locationId]);
  const result = await read(scope, client);
  await client.query(`INSERT INTO resource_pool_lifecycle_commands
    (tenant_id,location_id,actor_user_id,operation_key,pool_id,action,payload_hash,before_snapshot,result)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb)`, [...key, body.poolId, body.action, hash, JSON.stringify(pool), JSON.stringify(result)]);
  return result;
}
module.exports = { describe, execute, dependencies, archiveBlock };
