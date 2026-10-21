const { randomUUID } = require("node:crypto");
function fail(code, message) {
  throw Object.assign(new Error(message), { statusCode: 409, code });
}
async function plan(client, scope, ticketId) {
  const row = (
    await client.query(
      `SELECT t.status,t.join_channel,t.customer_confirmed_at,t.service_started_at,t.service_counter_id::text,
    p.items,p.revision::text,p.stage_attempt_id,p.workflow_mode,a.started_at AS stage_started_at,clock_timestamp() AS observed_at
   FROM tickets t JOIN ticket_service_plans p ON(p.ticket_id,p.tenant_id,p.location_id)=(t.id,t.tenant_id,t.location_id)
   JOIN queue_stage_attempts a ON(a.id,a.ticket_id,a.tenant_id,a.location_id)=(p.stage_attempt_id,t.id,t.tenant_id,t.location_id)
   WHERE t.tenant_id=$1 AND t.location_id=$2 AND t.id=$3 AND p.contract_version=2 FOR UPDATE OF t,p`,
      [...scope, ticketId],
    )
  ).rows[0];
  if (
    !row ||
    row.status !== "called" ||
    row.stage_started_at ||
    (row.workflow_mode === "linear" && row.service_started_at)
  )
    fail("INVALID_STATE", "An unstarted called stage is required.");
  return row;
}
async function demands(client, scope, row) {
  const stage = (
    await client.query(
      "SELECT stage_id,station_id,station_snapshot FROM queue_stage_attempts WHERE id=$1 AND tenant_id=$2 AND location_id=$3 FOR UPDATE",
      [row.stage_attempt_id, ...scope],
    )
  ).rows[0];
  if (!stage) fail("INVALID_STATE", "Current stage is missing.");
  if (
    stage.station_id &&
    !stage.station_snapshot?.serviceCounterIds?.includes(row.service_counter_id)
  )
    fail(
      "INVALID_STATE",
      "The called counter is not a permitted lane for this station.",
    );
  const items = row.items.filter((item) => item.stageId === stage.stage_id);
  if (!items.length)
    fail("INVALID_PLAN", "Current stage has no service lines.");
  const result = [];
  for (const item of items) {
    const mapping = (
      await client.query(
        `SELECT p.id::text,p.capacity,p.revision AS pool_revision,p.tracking_enabled,to_jsonb(p)->>'archived_at' AS archived_at,
    r.units_required,r.revision AS requirement_revision FROM service_resource_requirements r
    JOIN location_resource_pools p ON(p.id,p.tenant_id,p.location_id)=(r.pool_id,r.tenant_id,r.location_id)
    WHERE r.tenant_id=$1 AND r.location_id=$2 AND r.service_id=$3 FOR SHARE OF p,r`,
        [...scope, item.serviceId],
      )
    ).rows[0];
    if (mapping?.archived_at) fail("RESOURCE_POOL_ARCHIVED", "This resource pool is archived. Cancel unstarted protection and amend to active resources before calling or starting. Already-started work can still complete or be interrupted.");
    if (
      !mapping ||
      !mapping.tracking_enabled ||
      mapping.id !== item.resource?.poolId ||
      mapping.pool_revision !== item.resource.poolRevision ||
      mapping.requirement_revision !== item.resource.requirementRevision ||
      mapping.units_required !== item.resource.unitsRequired
    )
      fail(
        "STALE_REVISION",
        "Service resource configuration changed. Amend the plan before calling.",
      );
    const units = item.quantity * mapping.units_required;
    if (
      !Number.isInteger(units) ||
      units < 1 ||
      units > 100 ||
      units !== item.resource.totalUnits ||
      !Number.isInteger(item.durationMinutes) ||
      item.durationMinutes < 5 ||
      item.durationMinutes > 480
    )
      fail("INVALID_PLAN", "Frozen service demand is invalid.");
    result.push({ item, pool: mapping, units });
  }
  if (new Set(result.map((d) => d.pool.id)).size !== 1)
    fail(
      "UNSUPPORTED_EXECUTION_MODE",
      "This beta requires the same resource pool.",
    );
  return result;
}
async function capacity(
  client,
  scope,
  demand,
  start,
  end,
  excludedGroup = null,
) {
  const active = (
    await client.query(
      `SELECT COALESCE(sum(units),0)::int AS units FROM resource_allocations
  WHERE tenant_id=$1 AND location_id=$2 AND pool_id=$3 AND released_at IS NULL`,
      [...scope, demand.pool.id],
    )
  ).rows[0].units;
  const held = (
    await client.query(
      `SELECT units,starts_at,ends_at FROM resource_ledger_reservations
  WHERE tenant_id=$1 AND location_id=$2 AND pool_id=$3 AND state='protected' AND starts_at<$5 AND ends_at>$4
   AND ($6::uuid IS NULL OR group_id IS DISTINCT FROM $6)`,
      [...scope, demand.pool.id, start, end, excludedGroup],
    )
  ).rows;
  const events = [[start.getTime(), demand.units]];
  for (const r of held)
    events.push(
      [Math.max(start.getTime(), r.starts_at.getTime()), r.units],
      [Math.min(end.getTime(), r.ends_at.getTime()), -r.units],
    );
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let used = active;
  for (const [, delta] of events) {
    used += delta;
    if (used > demand.pool.capacity)
      fail(
        "RESOURCE_CAPACITY_UNAVAILABLE",
        "Required concurrent resource units are unavailable.",
      );
  }
}
async function reserve(client, scope, ticketId) {
  const row = await plan(client, scope, ticketId),
    lines = await demands(client, scope, row);
  const existing = (
    await client.query(
      `SELECT id,state,expires_at,expected_members,plan_revision::text FROM queue_reservation_groups
  WHERE tenant_id=$1 AND location_id=$2 AND ticket_id=$3 AND stage_attempt_id=$4 AND state IN('protected','converted') FOR UPDATE`,
      [...scope, ticketId, row.stage_attempt_id],
    )
  ).rows[0];
  if (existing) {
    if (
      existing.state !== "protected" ||
      existing.plan_revision !== row.revision ||
      existing.expires_at <= row.observed_at
    )
      fail("RESERVATION_EXPIRED", "Refresh the reservation before starting.");
    return {
      reservationGroupId: existing.id,
      reservationId: existing.expected_members[0].reservationId,
    };
  }
  const groupId = randomUUID(),
    expiresAt = new Date(row.observed_at.getTime() + 5 * 60000);
  const attempt = (
    await client.query(
      "SELECT count(*)::int+1 AS attempt FROM queue_reservation_groups WHERE tenant_id=$1 AND location_id=$2 AND ticket_id=$3 AND stage_attempt_id=$4",
      [...scope, ticketId, row.stage_attempt_id],
    )
  ).rows[0].attempt;
  await client.query(
    `INSERT INTO queue_reservation_groups(id,tenant_id,location_id,ticket_id,plan_revision,stage_attempt_id,state,expected_members,expires_at,attempt)
  VALUES($1,$2,$3,$4,$5,$6,'protected','[]',$7,$8)`,
    [
      groupId,
      ...scope,
      ticketId,
      row.revision,
      row.stage_attempt_id,
      expiresAt,
      attempt,
    ],
  );
  const members = [];
  for (const demand of lines) {
    const end = new Date(
      row.observed_at.getTime() + demand.item.durationMinutes * 60000,
    );
    await capacity(client, scope, demand, row.observed_at, end);
    const inserted = (
      await client.query(
        `INSERT INTO resource_ledger_reservations(tenant_id,location_id,ticket_id,pool_id,pool_revision,
   requirement_revision,units,starts_at,ends_at,group_id,line_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id::text`,
        [
          ...scope,
          ticketId,
          demand.pool.id,
          demand.pool.pool_revision,
          demand.pool.requirement_revision,
          demand.units,
          row.observed_at,
          end,
          groupId,
          demand.item.lineId,
        ],
      )
    ).rows[0];
    members.push({ lineId: demand.item.lineId, reservationId: inserted.id });
  }
  await client.query(
    "UPDATE queue_reservation_groups SET expected_members=$2::jsonb WHERE id=$1",
    [groupId, JSON.stringify(members)],
  );
  await client.query(
    "UPDATE queue_stage_attempts SET state='called',revision=revision+1 WHERE id=$1",
    [row.stage_attempt_id],
  );
  return {
    reservationGroupId: groupId,
    reservationId: members[0].reservationId,
  };
}
async function allocate(client, scope, ticketId) {
  const row = await plan(client, scope, ticketId);
  if (row.join_channel !== "vendor" && !row.customer_confirmed_at)
    fail("INVALID_STATE", "Confirm the ticket before starting.");
  const lines = await demands(client, scope, row);
  const group = (
    await client.query(
      `SELECT * FROM queue_reservation_groups WHERE tenant_id=$1 AND location_id=$2 AND ticket_id=$3
  AND stage_attempt_id=$4 AND state='protected' FOR UPDATE`,
      [...scope, ticketId, row.stage_attempt_id],
    )
  ).rows[0];
  if (
    !group ||
    String(group.plan_revision) !== row.revision ||
    group.expires_at <= row.observed_at
  )
    fail(
      "RESERVATION_EXPIRED",
      "The protected call has expired or changed. Call again before starting.",
    );
  const bindings = (
    await client.query(
      `SELECT * FROM resource_ledger_reservations WHERE tenant_id=$1 AND location_id=$2 AND group_id=$3 ORDER BY id FOR UPDATE`,
      [...scope, group.id],
    )
  ).rows;
  if (
    bindings.length !== lines.length ||
    group.expected_members.length !== lines.length
  )
    fail("INVALID_STATE", "Reservation group is incomplete.");
  for (const demand of lines) {
    const binding = bindings.find((r) => r.line_id === demand.item.lineId);
    if (
      !binding ||
      binding.state !== "protected" ||
      String(binding.pool_id) !== demand.pool.id ||
      binding.units !== demand.units ||
      binding.pool_revision !== demand.pool.pool_revision ||
      binding.requirement_revision !== demand.pool.requirement_revision ||
      !group.expected_members.some(
        (member) =>
          member.lineId === demand.item.lineId &&
          member.reservationId === String(binding.id),
      )
    )
      fail(
        "STALE_REVISION",
        "Reservation member does not match the current plan.",
      );
  }
  const allocationGroupId = randomUUID(),
    members = [];
  await client.query(
    `INSERT INTO queue_allocation_groups(id,tenant_id,location_id,ticket_id,reservation_group_id,stage_attempt_id,expected_members,started_at)
  VALUES($1,$2,$3,$4,$5,$6,'[]',$7)`,
    [
      allocationGroupId,
      ...scope,
      ticketId,
      group.id,
      row.stage_attempt_id,
      row.observed_at,
    ],
  );
  for (const demand of lines) {
    const binding = bindings.find((r) => r.line_id === demand.item.lineId),
      end = new Date(
        row.observed_at.getTime() + demand.item.durationMinutes * 60000,
      );
    await capacity(client, scope, demand, row.observed_at, end, group.id);
    const inserted = (
      await client.query(
        `INSERT INTO resource_allocations(tenant_id,location_id,ticket_id,pool_id,pool_revision,units,reservation_id,started_at,expected_end_at,group_id,line_id)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id::text`,
        [
          ...scope,
          ticketId,
          demand.pool.id,
          demand.pool.pool_revision,
          demand.units,
          String(binding.id),
          row.observed_at,
          end,
          allocationGroupId,
          demand.item.lineId,
        ],
      )
    ).rows[0];
    await client.query(
      "UPDATE resource_ledger_reservations SET state='converted',starts_at=$2,ends_at=$3 WHERE id=$1",
      [String(binding.id), row.observed_at, end],
    );
    members.push({
      lineId: demand.item.lineId,
      reservationId: String(binding.id),
      allocationId: inserted.id,
    });
  }
  await client.query(
    "UPDATE queue_allocation_groups SET expected_members=$2::jsonb WHERE id=$1",
    [allocationGroupId, JSON.stringify(members)],
  );
  await client.query(
    "UPDATE queue_reservation_groups SET state='converted' WHERE id=$1",
    [group.id],
  );
  await client.query(
    "UPDATE queue_stage_attempts SET state='in_service',started_at=$2,revision=revision+1 WHERE id=$1",
    [row.stage_attempt_id, row.observed_at],
  );
  return {
    allocationId: members[0].allocationId,
    reservationId: members[0].reservationId,
    allocationGroupId,
  };
}
async function release(client, scope, payload, groupId) {
  const group = (
    await client.query(
      `SELECT * FROM queue_allocation_groups WHERE tenant_id=$1 AND location_id=$2 AND id=$3 FOR UPDATE`,
      [...scope, groupId],
    )
  ).rows[0];
  if (!group) fail("INVALID_STATE", "Allocation group not found.");
  const rows = (
    await client.query(
      "SELECT id::text,released_at,outcome FROM resource_allocations WHERE tenant_id=$1 AND location_id=$2 AND group_id=$3 ORDER BY id FOR UPDATE",
      [...scope, groupId],
    )
  ).rows;
  if (
    rows.length !== group.expected_members.length ||
    !rows.every((r) =>
      group.expected_members.some((m) => m.allocationId === r.id),
    )
  )
    fail("INVALID_STATE", "Allocation group is incomplete.");
  if (group.released_at) {
    if (
      group.outcome !== payload.outcome ||
      rows.some((r) => !r.released_at || r.outcome !== payload.outcome)
    )
      fail("INVALID_STATE", "Allocation group has a different outcome.");
    return { allocationId: payload.allocationId, outcome: payload.outcome };
  }
  if (rows.some((r) => r.released_at))
    fail("INVALID_STATE", "Allocation group is partially released.");
  const ended = (await client.query("SELECT clock_timestamp() AS observed_at"))
    .rows[0].observed_at;
  await client.query(
    `UPDATE resource_allocations SET released_at=$4,outcome=$5,reason=$6 WHERE tenant_id=$1 AND location_id=$2 AND group_id=$3`,
    [...scope, groupId, ended, payload.outcome, payload.reason],
  );
  await client.query(
    "UPDATE queue_allocation_groups SET released_at=$2,outcome=$3 WHERE id=$1",
    [groupId, ended, payload.outcome],
  );
  await client.query(
    "UPDATE queue_stage_attempts SET state=$2,ended_at=$3,revision=revision+1 WHERE id=$1",
    [
      group.stage_attempt_id,
      payload.outcome === "completed" ? "completed" : "interrupted",
      ended,
    ],
  );
  return {
    allocationId: payload.allocationId,
    outcome: payload.outcome,
    allocationGroupId: groupId,
  };
}
async function expireUnstarted(client, scope, draft) {
  const ticketId = draft.published_ticket_id;
  const ticket = (
    await client.query(
      `SELECT t.status,a.started_at AS stage_started_at FROM tickets t
  JOIN ticket_service_plans p ON(p.ticket_id,p.tenant_id,p.location_id)=(t.id,t.tenant_id,t.location_id)
  JOIN queue_stage_attempts a ON(a.id,a.ticket_id,a.tenant_id,a.location_id)=(p.stage_attempt_id,t.id,t.tenant_id,t.location_id)
  WHERE t.tenant_id=$1 AND t.location_id=$2 AND t.id=$3 FOR UPDATE OF t`,
      [scope.tenantId, scope.locationId, ticketId],
    )
  ).rows[0];
  if (ticket?.status !== "called" || ticket.stage_started_at) return false;
  const group = (
    await client.query(
      `SELECT id,plan_revision::text,stage_attempt_id,to_jsonb(queue_reservation_groups)->>'execution_model' AS execution_model FROM queue_reservation_groups
  WHERE tenant_id=$1 AND location_id=$2 AND ticket_id=$3 AND state='protected' AND expires_at<=clock_timestamp() FOR UPDATE`,
      [scope.tenantId, scope.locationId, ticketId],
    )
  ).rows[0];
  if (!group) return false;
  if (
    (
      await client.query(
        "SELECT 1 FROM queue_allocation_groups WHERE reservation_group_id=$1",
        [group.id],
      )
    ).rows.length
  )
    fail(
      "INVALID_STATE",
      "Expired protection already has an allocation group.",
    );
  await client.query(
    "UPDATE resource_ledger_reservations SET state='cancelled' WHERE tenant_id=$1 AND location_id=$2 AND group_id=$3 AND state='protected'",
    [scope.tenantId, scope.locationId, group.id],
  );
  await client.query(
    "UPDATE queue_reservation_groups SET state='expired' WHERE id=$1",
    [group.id],
  );
  if (group.execution_model === "nested") {
    await client.query(
      `UPDATE queue_child_attempts c SET state='waiting',revision=revision+1
      WHERE c.tenant_id=$1 AND c.location_id=$2 AND c.ticket_id=$3 AND c.state='protected'
      AND c.id IN(SELECT child_attempt_id FROM resource_ledger_reservations WHERE group_id=$4)`,
      [scope.tenantId, scope.locationId, ticketId, group.id],
    );
  }
  await client.query(
    "UPDATE tickets SET status='waiting',called_at=NULL,service_counter_id=NULL,updated_at=clock_timestamp() WHERE tenant_id=$1 AND location_id=$2 AND id=$3",
    [scope.tenantId, scope.locationId, ticketId],
  );
  await client.query(
    "UPDATE queue_stage_attempts SET state='waiting',revision=revision+1 WHERE id=$1",
    [group.stage_attempt_id],
  );
  await client.query(
    `UPDATE ticket_service_plans SET ticket_revision=ticket_revision+1,
  resource_wait=jsonb_build_object('code','RESERVATION_EXPIRED','message','The call expired. Waiting for a new call.','planRevision',revision::text,'stageId',stage_id,'observedAt',clock_timestamp())
  WHERE tenant_id=$1 AND location_id=$2 AND ticket_id=$3`,
    [scope.tenantId, scope.locationId, ticketId],
  );
  await client.query(
    `INSERT INTO queue_plan_events(tenant_id,location_id,actor_user_id,draft_id,event_type,old_revision,new_revision,snapshot,actor_role)
  VALUES($1,$2,$3,$4,'reservation_expired',$5,$5,$6::jsonb,$7)`,
    [
      scope.tenantId,
      scope.locationId,
      scope.actorUserId,
      draft.id,
      group.plan_revision,
      JSON.stringify({
        reservationGroupId: group.id,
        stageAttemptId: group.stage_attempt_id,
        ticketId,
        state: "waiting",
      }),
      scope.actorRole,
    ],
  );
  await client.query(
    "UPDATE resource_ledger_scopes SET revision=revision+1 WHERE tenant_id=$1 AND location_id=$2",
    [scope.tenantId, scope.locationId],
  );
  return true;
}
module.exports = { reserve, allocate, release, expireUnstarted };
