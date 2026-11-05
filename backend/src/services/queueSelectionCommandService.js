const serviceHours = require("./queueServiceHoursService");
const nested = require("../repositories/queueSelectionLedger");
const stages = require("./queueStageService");
const { randomUUID } = require("node:crypto");
const capture = require("./queueSelectionCapture");
const workflowService = require("./queueWorkflowService");
const definitions = require("../repositories/queueSelectionRepository");

function fail(code, message) {
  throw Object.assign(new Error(message), { code, statusCode: 409 });
}

async function amend(client, { scope, ticket, p, stage, body, draft }) {
  const tuple = [scope.tenantId, scope.locationId, ticket._id];
  if (
    !["waiting", "called"].includes(ticket.status) ||
    ticket.serviceStartedAt ||
    ticket.serviceEndedAt ||
    (
      await client.query(
        "SELECT 1 FROM resource_allocations WHERE tenant_id=$1 AND location_id=$2 AND ticket_id=$3 LIMIT 1",
        tuple,
      )
    ).rows.length
  )
    fail(
      "PLAN_LOCKED",
      "Named selections can only change before the initial Start.",
    );
  const workflow = await workflowService.readVersion(
    client,
    scope,
    p.workflow_configuration_revision,
  );
  if (p.contract_version === 4 && body.contractVersion !== 4)
    fail(
      "INVALID_PLAN",
      "Version 4 amendments require the duration-count contract.",
    );
  if (p.contract_version === 3 && body.contractVersion !== undefined)
    fail(
      "INVALID_PLAN",
      "A published historical plan cannot change input contract.",
    );
  const captured = await (
    p.contract_version === 4 ? require("./queueSelectionCaptureV4") : capture
  ).capture(
    client,
    scope,
    body.serviceSelections,
    body.expectedCatalogRevision,
    { workflowOverride: workflow },
  );
  if(p.contract_version===4&&serviceHours.provenance(p.items)==='enforced'){
    await serviceHours.assertPlanFits(client,scope,captured.items,workflow);
    serviceHours.tagItems(captured.items);
  }
  const reduced = p.items.some((old) => {
    const next = captured.items.find(
      (item) => item.selectionId === old.selectionId,
    );
    return (
      !next ||
      next.quantity < old.quantity ||
      next.durationMinutes < old.durationMinutes
    );
  });
  if (reduced && body.customerAgreement?.confirmed !== true)
    fail(
      "CUSTOMER_AGREEMENT_REQUIRED",
      "Confirm the customer agreed to remove or reduce the selected resources or extras.",
    );
  for (const item of captured.items) {
    const old = p.items.find(
      (previous) => previous.selectionId === item.selectionId,
    );
    if (
      old &&
      (old.serviceId !== item.serviceId ||
        old.resourceMemberId !== item.resourceMemberId ||
        old.parentResourceSelectionId !== item.parentResourceSelectionId ||
        old.serviceSelectionId !== item.serviceSelectionId)
    )
      fail(
        "INVALID_PLAN",
        "A replacement resource or extra needs a new selection identifier.",
      );
    item.lineRevision = String(BigInt(old?.lineRevision || "0") + 1n);
  }
  const required = captured.requiredStages.map((s) => ({
    ...s,
    stageId: s.stageId || p.stage_id,
    station: s.stationId
      ? workflow.stations.find((station) => station.stationId === s.stationId)
      : null,
  }));
  const preserveCall =
    ticket.status === "called" && required[0].stageId === p.stage_id;
  for (const service of captured.serviceSelections) {
    service.stageId = required.find((s) =>
      s.serviceSelectionIds.includes(service.serviceSelectionId),
    ).stageId;
  }
  for (const item of captured.items)
    item.stageId = required.find((s) =>
      s.serviceSelectionIds.includes(item.serviceSelectionId),
    ).stageId;
  await require("./queueAmendAvailability").assertAvailable(client, scope, ticket._id, p.items, captured.items);
  const groups = (
    await client.query(
      "SELECT id FROM queue_reservation_groups WHERE tenant_id=$1 AND location_id=$2 AND ticket_id=$3 AND state='protected' FOR UPDATE",
      tuple,
    )
  ).rows;
  for (const group of groups) {
    await client.query(
      "UPDATE resource_ledger_reservations SET state='cancelled' WHERE group_id=$1 AND state='protected'",
      [group.id],
    );
    await client.query(
      "UPDATE queue_reservation_groups SET state='cancelled' WHERE id=$1",
      [group.id],
    );
  }
  await client.query(
    "UPDATE queue_child_attempts SET state='superseded',is_current=FALSE,revision=revision+1 WHERE tenant_id=$1 AND location_id=$2 AND ticket_id=$3 AND is_current",
    tuple,
  );
  await client.query(
    "UPDATE queue_stage_attempts SET state='superseded',ended_at=clock_timestamp(),revision=revision+1 WHERE tenant_id=$1 AND location_id=$2 AND ticket_id=$3 AND started_at IS NULL AND state IN('pending','waiting','called')",
    tuple,
  );
  const stageAttempts = new Map(),
    revision = String(BigInt(p.revision) + 1n);
  for (const [index, s] of required.entries()) {
    const id = randomUUID();
    stageAttempts.set(s.stageId, id);
    const attempt = (
      await client.query(
        "SELECT COALESCE(max(attempt),0)::text AS n FROM queue_stage_attempts WHERE ticket_id=$1 AND stage_id=$2",
        [ticket._id, s.stageId],
      )
    ).rows[0].n;
    await client.query(
      `INSERT INTO queue_stage_attempts(id,tenant_id,location_id,ticket_id,stage_id,attempt,ordinal,state,station_id,station_snapshot,label,assigned_user_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12)`,
      [
        id,
        ...tuple,
        s.stageId,
        String(BigInt(attempt) + 1n),
        index + 1,
        index === 0 ? (preserveCall ? "called" : "waiting") : "pending",
        s.station?.stationId || null,
        s.station ? JSON.stringify(s.station) : null,
        s.label || "Service",
        index === 0 && preserveCall ? stage.assigned_user_id : null,
      ],
    );
  }
  await client.query(
    `UPDATE ticket_service_plans SET items=$4::jsonb,service_selections=$5::jsonb,revision=$6,resource_wait=NULL,
    stage_id=$7,stage_attempt_id=$8,current_station_id=$9,current_station_counter_ids=$10::jsonb WHERE tenant_id=$1 AND location_id=$2 AND ticket_id=$3`,
    [
      ...tuple,
      JSON.stringify(captured.items),
      JSON.stringify(captured.serviceSelections),
      revision,
      required[0].stageId,
      stageAttempts.get(required[0].stageId),
      required[0].station?.stationId || null,
      required[0].station
        ? JSON.stringify(required[0].station.serviceCounterIds)
        : null,
    ],
  );
  await client.query(
    `INSERT INTO queue_plan_versions(id,draft_id,tenant_id,location_id,ticket_id,revision,workflow_mode,stage_id,lines_snapshot,
    service_selections,actor_user_id,reason,customer_agreement,workflow_configuration_revision) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13::jsonb,$14)`,
    [
      randomUUID(),
      draft.id,
      ...tuple,
      revision,
      p.workflow_mode,
      required[0].stageId,
      JSON.stringify(captured.items),
      JSON.stringify(captured.serviceSelections),
      scope.actorUserId,
      body.reason.trim(),
      body.customerAgreement ? JSON.stringify(body.customerAgreement) : null,
      p.workflow_configuration_revision,
    ],
  );
  await definitions.captureChildren(client, scope, {
    ticketId: ticket._id,
    planRevision: revision,
    captured,
    stageAttempts,
    firstStageId: required[0].stageId,
  });
  if (preserveCall)
    await nested.reserve(
      client,
      [scope.tenantId, scope.locationId],
      ticket._id,
    );
  else if (ticket.status === "called")
    await client.query(
      "UPDATE tickets SET status='waiting',called_at=NULL,service_counter_id=NULL,updated_at=clock_timestamp() WHERE id=$1",
      [ticket._id],
    );
  await client.query(
    `INSERT INTO queue_plan_notification_outbox(tenant_id,location_id,ticket_id,plan_revision,kind)
    VALUES($1,$2,$3,$4,'service_plan_published') ON CONFLICT DO NOTHING`,
    [...tuple, revision],
  );
}

// The common command service owns authorization, revisions, replay, audit and
// the location-first transaction. No child command can bypass those boundaries.
async function execute(client, ledger, args) {
  const { scope, tenant, location, ticket, p, stage, action, body, timing } =
    args;
  const tuple = [scope.tenantId, scope.locationId];
  if (["start", "retry"].includes(action)) {
    const activity = (
      await client.query(
        `SELECT l.is_active,l.service_timing_enabled,t.is_active AS tenant_active FROM store_locations l
      JOIN tenants t ON t.id=l.tenant_id WHERE l.tenant_id=$1 AND l.id=$2`,
        tuple,
      )
    ).rows[0];
    if (
      !activity?.is_active ||
      !activity.tenant_active ||
      !activity.service_timing_enabled
    )
      fail("INVALID_STATE", "This branch is not accepting service starts.");
  }
  if (action === "amend") await amend(client, args);
  else if (action === "start") {
    if (ticket.joinChannel !== 'vendor' && !ticket.customerConfirmedAt)
      fail('CUSTOMER_CONFIRMATION_REQUIRED', 'Confirm the customer’s ticket before starting service.');
    const result = await nested.allocate(
      client,
      tuple,
      ticket._id,
      body.reservationGroupId,
    );
    await timing.applySelectionTiming(
      client,
      tenant,
      ticket._id,
      "start",
      { location, actorUserId: scope.actorUserId },
      result.allocationId,
    );
  } else if (action === "complete" || action === "interrupt") {
    if (stage.state !== "in_service")
      fail(
        "INVALID_STATE",
        "Resume the active stage before recording a child outcome.",
      );
    const result = body.completeAll
      ? await nested.completeAll(client, tuple, ticket._id, body)
      : await nested.releaseChild(client, tuple, ticket._id, {
          ...body,
          outcome: action === "complete" ? "completed" : "terminated",
        });
    if (result.stageCompleted) {
      const required = await stages.latestStages(client, scope, ticket._id);
      if (required.every((s) => s.state === "completed"))
        await timing.applySelectionTiming(
          client,
          tenant,
          ticket._id,
          "complete",
          { location, actorUserId: scope.actorUserId },
          result.allocationId,
        );
    }
  } else if (action === "retry") {
    if (stage.state !== "in_service")
      fail(
        "INVALID_STATE",
        "Resume the stage before retrying an interrupted resource.",
      );
    await nested.retryResource(client, tuple, ticket._id, body);
  } else if (["handoff", "pause", "resume", "reassign"].includes(action)) {
    if (p.workflow_mode !== "multi_station")
      fail(
        "UNSUPPORTED_EXECUTION_MODE",
        "This action requires a multi-station workflow.",
      );
    await stages.execute(client, ledger, args);
    if (action === "handoff")
      await client.query(
        `UPDATE queue_child_attempts SET state='waiting',revision=revision+1
      WHERE ticket_id=$1 AND plan_revision=$2 AND is_current AND state='pending'
      AND stage_attempt_id=(SELECT stage_attempt_id FROM ticket_service_plans WHERE ticket_id=$1)`,
        [ticket._id, p.revision],
      );
  } else
    fail(
      "UNSUPPORTED_EXECUTION_MODE",
      "This named-resource command is not available yet.",
    );
  await client.query(
    "UPDATE resource_ledger_scopes SET revision=revision+1 WHERE tenant_id=$1 AND location_id=$2",
    tuple,
  );
}
module.exports = { execute };
