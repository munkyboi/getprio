const { randomUUID } = require("node:crypto");
const {
  readAuthorizedVendorQueueActor,
} = require("./vendorQueueTransactionService");
function fail(message, code = "INVALID_STATE", statusCode = 409) {
  throw Object.assign(new Error(message), { statusCode, code });
}
async function assertActor(client, scope, stage, actor, serviceCounter) {
  if (!stage.station_id) return;
  const lanes = stage.station_snapshot?.serviceCounterIds;
  if (!Array.isArray(lanes) || !lanes.length)
    fail("The frozen station has no permitted dispatch lane.");
  if (
    serviceCounter !== undefined &&
    !lanes.includes(String(serviceCounter?._id))
  )
    fail("Select a permitted counter for the current station.");
  if (actor.tenantMemberships[0].role !== "staff") return;
  if (
    stage.assigned_user_id &&
    String(stage.assigned_user_id) !== scope.actorUserId
  )
    fail("This stage is assigned to another operator.", "FORBIDDEN_SCOPE", 403);
  const grants = await client.query(
    "SELECT counter_id FROM service_counter_assignments WHERE user_id=$1 AND counter_id=ANY($2::bigint[]) FOR SHARE",
    [scope.actorUserId, lanes],
  );
  if (!grants.rows.length)
    fail(
      "You are not assigned to a permitted lane for this station.",
      "FORBIDDEN_SCOPE",
      403,
    );
}
async function activeGroup(client, scope, ticket, stage, groupId) {
  const group = (
    await client.query(
      `SELECT id,expected_members FROM queue_allocation_groups WHERE id=$1 AND tenant_id=$2 AND location_id=$3
  AND ticket_id=$4 AND stage_attempt_id=$5 AND released_at IS NULL FOR UPDATE`,
      [groupId, scope.tenantId, scope.locationId, ticket._id, stage.id],
    )
  ).rows[0];
  if (!group)
    fail("The selected allocation group is not active for the current stage.");
  if (!group.expected_members.length)
    fail("The allocation group is incomplete.");
  return group;
}
async function latestStages(client, scope, ticketId) {
  const items =
    (
      await client.query(
        "SELECT items FROM ticket_service_plans WHERE tenant_id=$1 AND location_id=$2 AND ticket_id=$3",
        [scope.tenantId, scope.locationId, ticketId],
      )
    ).rows[0]?.items || [];
  const required = new Set(items.map((item) => item.stageId));
  return (
    await client.query(
      `SELECT DISTINCT ON(stage_id) * FROM queue_stage_attempts WHERE tenant_id=$1 AND location_id=$2 AND ticket_id=$3
  ORDER BY stage_id,attempt DESC`,
      [scope.tenantId, scope.locationId, ticketId],
    )
  ).rows
    .filter(
      (stage) => required.has(stage.stage_id) && stage.state !== "superseded",
    )
    .sort((a, b) => a.ordinal - b.ordinal);
}
async function routeWaiting(client, scope, ticket, stage) {
  await client.query(
    `UPDATE ticket_service_plans SET stage_id=$4,stage_attempt_id=$5,current_station_id=$6,current_station_counter_ids=$7::jsonb,resource_wait=NULL
  WHERE tenant_id=$1 AND location_id=$2 AND ticket_id=$3`,
    [
      scope.tenantId,
      scope.locationId,
      ticket._id,
      stage.stage_id,
      stage.id,
      stage.station_id,
      JSON.stringify(stage.station_snapshot.serviceCounterIds),
    ],
  );
  await client.query(
    `UPDATE tickets SET status='waiting',service_counter_id=NULL,called_at=NULL,updated_at=clock_timestamp()
  WHERE tenant_id=$1 AND location_id=$2 AND id=$3`,
    [scope.tenantId, scope.locationId, ticket._id],
  );
}
async function execute(
  client,
  ledger,
  { scope, tenant, location, ticket, p: _p, stage, action, body, actor, timing },
) {
  await assertActor(client, scope, stage, actor);
  if (action === "start") {
    const activity = (
      await client.query(
        `SELECT l.is_active,t.is_active AS tenant_active,l.service_timing_enabled FROM store_locations l JOIN tenants t ON t.id=l.tenant_id
   WHERE l.tenant_id=$1 AND l.id=$2`,
        [scope.tenantId, scope.locationId],
      )
    ).rows[0];
    if (
      !activity?.is_active ||
      !activity.tenant_active ||
      !activity.service_timing_enabled
    )
      fail("This branch is not accepting service starts.");
    if (stage.state !== "called" || stage.started_at)
      fail("Call this stage before starting it.");
    if (!ticket.serviceStartedAt) {
      await timing.applyTicketService(
        client,
        ledger,
        tenant,
        ticket._id,
        "start",
        { location, actorUserId: scope.actorUserId },
      );
      return;
    }
    await ledger.executeCommand({
      operationKey: `ticket:${ticket._id}:stage:${stage.id}:start`,
      command: "allocate",
      payload: { ticketId: String(ticket._id) },
    });
    await client.query(
      "UPDATE tickets SET updated_at=clock_timestamp() WHERE id=$1",
      [ticket._id],
    );
    return;
  }
  if (["complete", "interrupt", "pause", "resume"].includes(action)) {
    const group = await activeGroup(
      client,
      scope,
      ticket,
      stage,
      body.allocationGroupId,
    );
    if (action === "pause" || action === "resume") {
      const required = action === "pause" ? "in_service" : "paused";
      if (stage.state !== required)
        fail(`The current stage must be ${required} before this action.`);
      await client.query(
        "UPDATE queue_stage_attempts SET state=$2,revision=revision+1 WHERE id=$1",
        [stage.id, action === "pause" ? "paused" : "in_service"],
      );
      return;
    }
    if (!["in_service", "paused"].includes(stage.state))
      fail("Start the current stage before recording its outcome.");
    const stages = await latestStages(client, scope, ticket._id);
    const final =
      action === "complete" &&
      stages.every(
        (candidate) =>
          candidate.stage_id === stage.stage_id ||
          candidate.state === "completed",
      );
    if (final) {
      await timing.applyTicketService(
        client,
        ledger,
        tenant,
        ticket._id,
        "complete",
        { location, actorUserId: scope.actorUserId },
      );
      return;
    }
    await ledger.executeCommand({
      operationKey: `ticket:${ticket._id}:stage:${stage.id}:${action}`,
      command: "release",
      payload: {
        allocationId: group.expected_members[0].allocationId,
        outcome: action === "complete" ? "completed" : "terminated",
        ...(action === "interrupt" ? { reason: body.reason.trim() } : {}),
      },
    });
    // Intermediate outcomes do not finish the parent or advance it implicitly.
    await client.query(
      "UPDATE tickets SET updated_at=clock_timestamp() WHERE id=$1",
      [ticket._id],
    );
    return;
  }
  if (action === "handoff") {
    if (ticket.status !== "called")
      fail("The parent ticket must remain open before a handoff.");
    if (stage.state !== "completed" || !stage.ended_at)
      fail("Complete the current stage before handing it off.");
    const stages = await latestStages(client, scope, ticket._id);
    if (
      stages.some(
        (candidate) =>
          candidate.ordinal < stage.ordinal && candidate.state !== "completed",
      )
    )
      fail("A preceding required stage is incomplete.");
    const next = stages.find(
      (candidate) =>
        candidate.ordinal > stage.ordinal && candidate.state === "pending",
    );
    if (!next) fail("There is no pending next stage.");
    await client.query(
      "UPDATE queue_stage_attempts SET state='waiting',revision=revision+1 WHERE id=$1",
      [next.id],
    );
    await routeWaiting(client, scope, ticket, next);
    return;
  }
  if (action === "retry") {
    if (ticket.status !== "called")
      fail("The parent ticket must remain open before a retry.");
    if (stage.state !== "interrupted" || !stage.ended_at)
      fail("Only an explicitly interrupted stage may be retried.");
    if (
      (
        await client.query(
          "SELECT 1 FROM queue_allocation_groups WHERE stage_attempt_id=$1 AND released_at IS NULL",
          [stage.id],
        )
      ).rows.length
    )
      fail("Release the interrupted attempt before retrying.");
    const next = {
      ...stage,
      id: randomUUID(),
      attempt: String(BigInt(stage.attempt) + 1n),
    };
    await client.query(
      `INSERT INTO queue_stage_attempts(id,tenant_id,location_id,ticket_id,stage_id,attempt,ordinal,state,station_id,station_snapshot,label)
   VALUES($1,$2,$3,$4,$5,$6,$7,'waiting',$8,$9::jsonb,$10)`,
      [
        next.id,
        scope.tenantId,
        scope.locationId,
        ticket._id,
        stage.stage_id,
        next.attempt,
        stage.ordinal,
        stage.station_id,
        JSON.stringify(stage.station_snapshot),
        stage.label,
      ],
    );
    await routeWaiting(client, scope, ticket, next);
    return;
  }
  if (action === "reassign") {
    if (!["waiting", "called", "in_service", "paused"].includes(stage.state))
      fail("Only an open stage can change its responsible operator.");
    const user = await readAuthorizedVendorQueueActor(
      client,
      { ...scope, actorUserId: body.assignedUserId },
      "tenant.ticket.update_state",
      { forShare: true },
    );
    if (!user)
      fail(
        "The selected operator lacks current branch access.",
        "FORBIDDEN_SCOPE",
        403,
      );
    if (user.tenantMemberships[0].role === "staff") {
      const grants = await client.query(
        "SELECT counter_id FROM service_counter_assignments WHERE user_id=$1 AND counter_id=ANY($2::bigint[]) FOR SHARE",
        [body.assignedUserId, stage.station_snapshot.serviceCounterIds],
      );
      if (!grants.rows.length)
        fail(
          "The operator is not assigned to this station’s permitted lanes.",
          "FORBIDDEN_SCOPE",
          403,
        );
    }
    await client.query(
      "UPDATE queue_stage_attempts SET assigned_user_id=$2,revision=revision+1 WHERE id=$1",
      [stage.id, body.assignedUserId],
    );
    return;
  }
  fail("Unsupported station-stage operation.", "UNSUPPORTED_EXECUTION_MODE");
}
module.exports = { execute, assertActor, latestStages };
