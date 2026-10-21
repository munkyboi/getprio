async function read(client, scope, draft, options = {}) {
  const row = (
    await client.query(
      `SELECT t.id::text,t.ticket_number,t.status,t.service_started_at,t.service_ended_at,t.service_outcome,
    p.items,p.stage_id,p.contract_version,p.revision::text,p.ticket_revision::text,p.service_selections,p.workflow_mode,p.workflow_configuration_revision::text,p.stage_attempt_id,p.resource_wait,p.created_at,clock_timestamp() AS observed_at
    FROM tickets t JOIN ticket_service_plans p ON(p.ticket_id,p.tenant_id,p.location_id)=(t.id,t.tenant_id,t.location_id)
    WHERE t.tenant_id=$1 AND t.location_id=$2 AND t.id=$3 AND p.contract_version IN(3,4)`,
      [scope.tenantId, scope.locationId, draft.published_ticket_id],
    )
  ).rows[0];
  if (!row || !Array.isArray(row.service_selections))
    throw Object.assign(
      new Error("The named selection plan needs reconciliation."),
      { statusCode: 409, code: "INVALID_STATE" },
    );
  const children = (
    await client.query(
      `SELECT id,ticket_id::text,plan_revision::text,selection_id,selection_kind,stage_id,stage_attempt_id,parent_child_attempt_id,
    parent_executed_selection_id,attempt::text,revision::text,is_current,state,started_at,ended_at,satisfied_dependencies
    FROM queue_child_attempts WHERE tenant_id=$1 AND location_id=$2 AND ticket_id=$3 ORDER BY selection_id,attempt,id`,
      [scope.tenantId, scope.locationId, row.id],
    )
  ).rows;
  const reservations = (
    await client.query(
      `SELECT id::text,group_id,child_attempt_id,line_id,pool_id::text,units,resource_member_id,starts_at,ends_at,state
    FROM resource_ledger_reservations WHERE tenant_id=$1 AND location_id=$2 AND ticket_id=$3 AND child_attempt_id IS NOT NULL ORDER BY id`,
      [scope.tenantId, scope.locationId, row.id],
    )
  ).rows;
  const allocations = (
    await client.query(
      `SELECT id::text,group_id,child_attempt_id,reservation_id::text,line_id,pool_id::text,units,resource_member_id,started_at,expected_end_at,released_at,outcome,reason
    FROM resource_allocations WHERE tenant_id=$1 AND location_id=$2 AND ticket_id=$3 AND child_attempt_id IS NOT NULL ORDER BY id`,
      [scope.tenantId, scope.locationId, row.id],
    )
  ).rows;
  function execution(child) {
    if (!child) return null;
    const allocation = allocations.find(
        (member) => member.child_attempt_id === child.id,
      ),
      reservation = [...reservations]
        .reverse()
        .find((member) => member.child_attempt_id === child.id);
    return {
      childAttemptId: child.id,
      revision: child.revision,
      attempt: child.attempt,
      planRevision: child.plan_revision,
      stageId: child.stage_id,
      stageAttemptId: child.stage_attempt_id,
      selectionId: child.selection_id,
      selectionKind: child.selection_kind,
      parentChildAttemptId: child.parent_child_attempt_id,
      parentResourceSelectionId: child.parent_executed_selection_id,
      state: child.state,
      isCurrent: child.is_current,
      startedAt: child.started_at,
      endedAt: child.ended_at,
      satisfiedDependencyAttemptIds: child.satisfied_dependencies,
      reservationGroupId: reservation?.group_id || null,
      reservationMemberIds: reservation ? [reservation.id] : [],
      allocationGroupId: allocation?.group_id || null,
      allocationMemberIds: allocation ? [allocation.id] : [],
      allowedActions:
        child.is_current &&
        child.plan_revision === row.revision &&
        child.stage_attempt_id === row.stage_attempt_id &&
        currentStage.state === "in_service"
          ? child.state === "in_service"
            ? [
                ...(child.selection_kind === "extra" ||
                children
                  .filter(
                    (c) =>
                      c.is_current &&
                      c.plan_revision === row.revision &&
                      c.parent_executed_selection_id === child.selection_id,
                  )
                  .every((c) => c.state === "completed")
                  ? ["complete"]
                  : []),
                "interrupt",
              ]
            : child.selection_kind === "resource" &&
                child.state === "interrupted"
              ? ["retry"]
              : []
          : [],
    };
  }
  const current = (id) =>
    children.find(
      (child) =>
        child.selection_id === id &&
        child.plan_revision === row.revision &&
        child.is_current,
    );
  const stages = (
    await client.query(
      `SELECT id,stage_id,revision::text,attempt::text,ordinal,station_id,station_snapshot,label,assigned_user_id::text,state,started_at,ended_at
    FROM queue_stage_attempts WHERE tenant_id=$1 AND location_id=$2 AND ticket_id=$3 ORDER BY ordinal,attempt,id`,
      [scope.tenantId, scope.locationId, row.id],
    )
  ).rows.map((stage) => ({
    id: stage.stage_id,
    revision: stage.revision,
    attemptId: stage.id,
    attempt: stage.attempt,
    ordinal: stage.ordinal,
    stationId: stage.station_id,
    stationName: stage.station_snapshot?.name || null,
    serviceCounterIds: stage.station_snapshot?.serviceCounterIds || [],
    label: stage.label || "Service",
    assignedUserId: stage.assigned_user_id || null,
    state: stage.state,
    startedAt: stage.started_at,
    endedAt: stage.ended_at,
    skippedAt: stage.skipped_at || null,
    skipReason: stage.skipped_reason || null,
    skippedByUserId: stage.skipped_by_user_id == null ? null : String(stage.skipped_by_user_id),
  }));
  const currentStage = stages.find(
    (stage) => stage.attemptId === row.stage_attempt_id,
  );
  if (!currentStage)
    throw Object.assign(new Error("The current stage is missing."), {
      statusCode: 409,
      code: "INVALID_STATE",
    });
  const serviceSelections = row.service_selections.map((service) => ({
    ...service,
    resources: service.resources.map((resource) => ({
      ...resource,
      execution: execution(current(resource.resourceSelectionId)),
      extras: resource.extras.map((extra) => ({
        ...extra,
        execution: extra.namedExtraVersion===1 ? null : execution(current(extra.extraSelectionId)),
        ...(extra.namedExtraVersion===1 ? {memberExecutions:extra.resourceMembers.map(member=>({resourceMemberId:member.id,resourceMemberName:member.name,execution:execution(current(member.selectionId))}))} : {}),
      })),
    })),
  }));
  const reservationGroups = (
    await client.query(
      `SELECT id,plan_revision::text,stage_attempt_id,attempt::text,state,expires_at,expected_members
    FROM queue_reservation_groups WHERE tenant_id=$1 AND location_id=$2 AND ticket_id=$3 AND execution_model='nested' ORDER BY created_at,id`,
      [scope.tenantId, scope.locationId, row.id],
    )
  ).rows.map((group) => ({
    id: group.id,
    planRevision: group.plan_revision,
    stageAttemptId: group.stage_attempt_id,
    attempt: group.attempt,
    state: group.state,
    expiresAt: group.expires_at,
    expectedMembers: group.expected_members,
    members: reservations
      .filter((member) => member.group_id === group.id)
      .map((member) => ({
        id: member.id,
        childAttemptId: member.child_attempt_id,
        selectionId: member.line_id,
        poolId: member.pool_id,
        units: member.units,
        resourceMemberId: member.resource_member_id,
        startsAt: member.starts_at,
        endsAt: member.ends_at,
        state: member.state,
      })),
  }));
  const allocationGroups = (
    await client.query(
      `SELECT a.id,a.stage_attempt_id,a.reservation_group_id,a.expected_members,a.started_at,a.released_at,a.outcome,a.resolution_state,a.resolution_summary
    FROM queue_allocation_groups a JOIN queue_reservation_groups r ON r.id=a.reservation_group_id WHERE a.tenant_id=$1 AND a.location_id=$2 AND a.ticket_id=$3 AND r.execution_model='nested'
    ORDER BY a.started_at,a.id`,
      [scope.tenantId, scope.locationId, row.id],
    )
  ).rows.map((group) => ({
    id: group.id,
    stageAttemptId: group.stage_attempt_id,
    reservationGroupId: group.reservation_group_id,
    expectedMembers: group.expected_members,
    startedAt: group.started_at,
    releasedAt: group.released_at,
    outcome: group.outcome,
    resolutionState: group.resolution_state,
    resolutionSummary: group.resolution_summary,
    members: allocations
      .filter((member) => member.group_id === group.id)
      .map((member) => ({
        id: member.id,
        childAttemptId: member.child_attempt_id,
        selectionId: member.line_id,
        poolId: member.pool_id,
        units: member.units,
        resourceMemberId: member.resource_member_id,
        reservationId: member.reservation_id,
        startedAt: member.started_at,
        expectedEndAt: member.expected_end_at,
        releasedAt: member.released_at,
        outcome: member.outcome,
      })),
  }));
  const projectedResourceWait = row.status === "waiting" && [3, 4].includes(Number(row.contract_version))
    ? await require("../services/queueResourceConflictProjection").readWaitingConflict(client, scope, draft, row.service_selections, { contractVersion: row.contract_version, resourceWait: row.resource_wait || null })
    : null;
  const serviceHoursEligibility = await require("../services/queueServiceHoursEligibilityService").read(client,scope,{...row,ticket_id:row.id},options);
  return {
    serviceHoursEligibility,
    contractVersion: row.contract_version,
    id: draft.id,
    draftId: draft.id,
    ticketId: row.id,
    ticketNumber: row.ticket_number,
    ticketRevision: row.ticket_revision,
    planRevision: row.revision,
    state:
      row.status === "called"
        ? currentStage.state === "completed"
          ? "awaiting_handoff"
          : currentStage.state
        : row.status,
    customer: draft.customer,
    notes: draft.notes,
    workflow: {
      mode: row.workflow_mode,
      configurationRevision: row.workflow_configuration_revision,
    },
    serviceSelections,
    currentStage,
    stages,
    childAttempts: children.map(execution),
    reservationGroups,
    allocationGroups,
    // Waiting availability is authoritative now; historical expiry/cancellation
    // markers must not keep a released request out of candidacy.
    resourceWait: row.status === 'waiting' ? projectedResourceWait : row.resource_wait || null,
    quote: {
      status: "unavailable",
      reasonCode: "SERVICE_PRICING_NOT_CONFIGURED",
    },
    ...(row.contract_version === 4
      ? { policyModel: "explicit_service_configuration" }
      : { extraScheduling: "same_start_within_parent" }),
    capabilities: { execution: true, childOutcomes: true },
    allowedActions: [
      ...(row.status === "skipped" && currentStage.state === "skipped" ? ["recall"] : []),
      ...(!row.service_started_at && ["waiting", "called"].includes(row.status)
        ? ["amend"]
        : []),
      ...(row.status === "waiting" && currentStage.state === "waiting"
        ? ["call"]
        : []),
      ...(row.status === "called" &&
      currentStage.state === "called" &&
      reservationGroups.some(
        (g) =>
          g.state === "protected" &&
          g.stageAttemptId === currentStage.attemptId &&
          new Date(g.expiresAt) > row.observed_at,
      )
        ? ["start", "skip", ...(!currentStage.startedAt && !allocationGroups.some(g=>g.stageAttemptId===currentStage.attemptId) ? ["cancelProtection"] : [])]
        : []),
      ...(row.status === "called" &&
      currentStage.state === "completed" &&
      stages.some(
        (s) => s.ordinal > currentStage.ordinal && s.state === "pending",
      )
        ? ["handoff"]
        : []),
      ...(row.workflow_mode === "multi_station" &&
      ["waiting", "called", "in_service", "paused"].includes(currentStage.state)
        ? ["reassign"]
        : []),
      ...(row.workflow_mode === "multi_station" &&
      currentStage.state === "in_service"
        ? ["pause"]
        : []),
      ...(row.workflow_mode === "multi_station" &&
      currentStage.state === "paused"
        ? ["resume"]
        : []),
    ],
    publishedAt: row.created_at,
    observedAt: row.observed_at,
  };
}
module.exports = { read };
