async function read(client, scope, draft, options = {}) {
  if(Array.isArray(draft.service_selections))return require('./queueSelectionProjection').read(client,scope,draft,options);
  const result = await client.query(
    `SELECT t.id::text,t.ticket_number,t.status,t.service_started_at,t.service_ended_at,
      p.revision::text,p.ticket_revision::text,p.items,p.workflow_mode,p.workflow_configuration_revision::text,p.stage_id,a.revision::text AS stage_revision,p.resource_wait,
      a.id AS stage_attempt_id,a.attempt::text,a.ordinal,a.state AS stage_state,p.created_at,clock_timestamp() AS observed_at
    FROM tickets t JOIN ticket_service_plans p ON (p.ticket_id,p.tenant_id,p.location_id)=(t.id,t.tenant_id,t.location_id)
    JOIN queue_stage_attempts a ON (a.id,a.tenant_id,a.location_id)=(p.stage_attempt_id,p.tenant_id,p.location_id)
    WHERE t.tenant_id=$1 AND t.location_id=$2 AND t.id=$3 AND p.contract_version=2`,
    [scope.tenantId, scope.locationId, draft.published_ticket_id],
  );
  const row = result.rows[0];
  if (!row)
    throw Object.assign(new Error("Published plan needs reconciliation."), {
      statusCode: 409,
      code: "INVALID_STATE",
    });
  const stages = (
    await client.query(
      `SELECT id,stage_id,revision::text,attempt::text,ordinal,station_id,station_snapshot,label,assigned_user_id::text,state,started_at,ended_at
    FROM queue_stage_attempts WHERE tenant_id=$1 AND location_id=$2 AND ticket_id=$3 ORDER BY ordinal,attempt,id`,
      [scope.tenantId, scope.locationId, row.id],
    )
  ).rows.map((attempt) => ({
    id: attempt.stage_id,
    revision: attempt.revision,
    attemptId: attempt.id,
    attempt: attempt.attempt,
    ordinal: attempt.ordinal,
    stationId: attempt.station_id,
    stationName: attempt.station_snapshot?.name || null,
    label: attempt.label || "Service",
    assignedUserId: attempt.assigned_user_id || null,
    serviceCounterIds: attempt.station_snapshot?.serviceCounterIds || [],
    state: attempt.state,
    startedAt: attempt.started_at,
    endedAt: attempt.ended_at,
    skippedAt: attempt.skipped_at || null,
    skipReason: attempt.skipped_reason || null,
    skippedByUserId: attempt.skipped_by_user_id == null ? null : String(attempt.skipped_by_user_id),
  }));
  const stage = stages.find(
    (attempt) => attempt.attemptId === row.stage_attempt_id,
  );
  if (!stage)
    throw Object.assign(new Error("Current stage history is missing."), {
      statusCode: 409,
      code: "INVALID_STATE",
    });
  const reservationGroups = [];
  for (const group of (
    await client.query(
      `SELECT id,plan_revision::text,attempt::text,stage_attempt_id,state,expires_at,expected_members
    FROM queue_reservation_groups WHERE tenant_id=$1 AND location_id=$2 AND ticket_id=$3 ORDER BY created_at,id`,
      [scope.tenantId, scope.locationId, row.id],
    )
  ).rows) {
    const members = (
      await client.query(
        `SELECT id::text,line_id,pool_id::text,units,starts_at,ends_at,state
      FROM resource_ledger_reservations WHERE tenant_id=$1 AND location_id=$2 AND group_id=$3 ORDER BY id`,
        [scope.tenantId, scope.locationId, group.id],
      )
    ).rows;
    reservationGroups.push({
      id: group.id,
      planRevision: group.plan_revision,
      attempt: group.attempt,
      stageAttemptId: group.stage_attempt_id,
      state: group.state,
      expiresAt: group.expires_at,
      expectedMemberIds: group.expected_members.map((m) => m.reservationId),
      members: members.map((m) => ({
        id: m.id,
        lineId: m.line_id,
        stageAttemptId: group.stage_attempt_id,
        poolId: m.pool_id,
        units: m.units,
        startsAt: m.starts_at,
        endsAt: m.ends_at,
        state: m.state,
      })),
    });
  }
  const allocationGroups = [];
  for (const group of (
    await client.query(
      `SELECT id,reservation_group_id,stage_attempt_id,expected_members,started_at,released_at,outcome
    FROM queue_allocation_groups WHERE tenant_id=$1 AND location_id=$2 AND ticket_id=$3 ORDER BY started_at,id`,
      [scope.tenantId, scope.locationId, row.id],
    )
  ).rows) {
    const members = (
      await client.query(
        `SELECT id::text,line_id,pool_id::text,units,reservation_id::text,started_at,expected_end_at,released_at,outcome
      FROM resource_allocations WHERE tenant_id=$1 AND location_id=$2 AND group_id=$3 ORDER BY id`,
        [scope.tenantId, scope.locationId, group.id],
      )
    ).rows;
    allocationGroups.push({
      id: group.id,
      reservationGroupId: group.reservation_group_id,
      stageAttemptId: group.stage_attempt_id,
      expectedMemberIds: group.expected_members.map((m) => m.allocationId),
      startedAt: group.started_at,
      releasedAt: group.released_at,
      outcome: group.outcome,
      members: members.map((m) => ({
        id: m.id,
        lineId: m.line_id,
        stageAttemptId: group.stage_attempt_id,
        poolId: m.pool_id,
        units: m.units,
        reservationId: m.reservation_id,
        startedAt: m.started_at,
        expectedEndAt: m.expected_end_at,
        releasedAt: m.released_at,
        outcome: m.outcome,
      })),
    });
  }
  const protectedGroup = reservationGroups.find(
    (group) =>
      group.state === "protected" &&
      group.planRevision === row.revision &&
      group.stageAttemptId === row.stage_attempt_id &&
      new Date(group.expiresAt) > row.observed_at &&
      group.members.length === group.expectedMemberIds.length &&
      group.members.every(
        (member) =>
          member.state === "protected" &&
          group.expectedMemberIds.includes(member.id),
      ),
  );
  const activeGroup = allocationGroups.find(
    (group) =>
      group.stageAttemptId === row.stage_attempt_id &&
      !group.releasedAt &&
      group.members.length === group.expectedMemberIds.length &&
      group.members.every(
        (member) =>
          !member.releasedAt && group.expectedMemberIds.includes(member.id),
      ),
  );
  const state = row.status === "skipped" ? "skipped" :
    row.workflow_mode === "multi_station"
      ? row.status === "waiting"
        ? "waiting"
        : row.status === "called"
          ? ["in_service", "paused", "completed", "interrupted"].includes(
              stage.state,
            )
            ? "in_service"
            : "called"
          : activeGroup && row.service_started_at && !row.service_ended_at
            ? "in_service"
            : row.status
      : row.service_started_at && !row.service_ended_at
        ? "in_service"
        : row.status;
  let allowedActions =
    state === "waiting"
      ? ["amend", "call"]
      : state === "called"
        ? ["amend", ...(protectedGroup ? ["start", "skip"] : [])]
        : state === "in_service" && activeGroup
          ? ["complete", "interrupt"]
          : [];
  if (row.workflow_mode === "multi_station") {
    const canAmend =
      !row.service_started_at &&
      !row.service_ended_at &&
      !allocationGroups.length;
    const canReassign =
      ["owner", "admin"].includes(scope.actorRole) &&
      ["waiting", "called", "in_service", "paused"].includes(stage.state) &&
      !row.service_ended_at &&
      (["waiting", "called"].includes(row.status) || activeGroup);
    allowedActions =
      stage.state === "waiting" && row.status === "waiting"
        ? [...(canAmend ? ["amend"] : []), "call"]
        : stage.state === "called" && row.status === "called"
          ? [
              ...(canAmend ? ["amend"] : []),
              ...(protectedGroup ? ["start", "skip"] : []),
            ]
          : stage.state === "in_service" && activeGroup
            ? ["complete", "interrupt", "pause"]
            : stage.state === "paused" && activeGroup
              ? ["resume", "complete", "interrupt"]
              : stage.state === "completed" &&
                  row.status === "called" &&
                  !row.service_ended_at
                ? ["handoff"]
                : stage.state === "interrupted" &&
                    row.status === "called" &&
                    !row.service_ended_at
                  ? ["retry"]
                  : [];
    if (canReassign) allowedActions.push("reassign");
  }
  if (row.status === "skipped" && stage.state === "skipped") allowedActions = ["recall"];
  let permittedReassignmentUsers = [];
  if (allowedActions.includes("reassign"))
    permittedReassignmentUsers = (
      await client.query(
        `SELECT u.id::text,COALESCE(NULLIF(u.display_name,''),u.name,'Operator') AS name,m.role
    FROM users u JOIN tenant_memberships m ON m.user_id=u.id AND m.tenant_id=$1 AND m.is_active=TRUE
    WHERE u.deletion_requested_at IS NULL AND u.platform_access_suspended_at IS NULL AND(m.role IN('owner','admin') OR(m.role='staff'
      AND EXISTS(SELECT 1 FROM service_counter_assignments a JOIN service_counters c ON c.id=a.counter_id WHERE a.user_id=u.id
        AND c.tenant_id=$1 AND c.location_id=$2 AND c.is_active=TRUE AND c.id=ANY($3::bigint[])))) ORDER BY u.id`,
        [scope.tenantId, scope.locationId, stage.serviceCounterIds],
      )
    ).rows;
  return {
    serviceHoursEligibility: await require("../services/queueServiceHoursEligibilityService").read(client,scope,{...row,ticket_id:row.id},options),
    contractVersion: 2,
    id: draft.id,
    draftId: draft.id,
    ticketId: row.id,
    ticketNumber: row.ticket_number,
    ticketRevision: row.ticket_revision,
    planRevision: row.revision,
    state,
    customer: draft.customer,
    notes: draft.notes,
    workflow: {
      mode: row.workflow_mode,
      configurationRevision: row.workflow_configuration_revision,
    },
    lines: row.items.map((item) => ({
      ...item,
      requirements: [
        {
          poolId: item.resource.poolId,
          unitsPerQuantity: item.resource.unitsRequired,
          totalUnits: item.resource.totalUnits,
          poolRevision: item.resource.poolRevision,
          requirementRevision: item.resource.requirementRevision,
        },
      ],
    })),
    currentStage: stage,
    stages,
    reservationGroups,
    allocationGroups,
    resourceWait: row.resource_wait || null,
    permittedReassignmentUsers,
    publishedAt: row.created_at,
    allowedActions,
    observedAt: row.observed_at,
  };
}
module.exports = { read };
