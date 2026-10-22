const { randomUUID } = require("node:crypto");

// Publication/amendment owns the authorized transaction and immutable plan version.
async function captureChildren(
  client,
  scope,
  { ticketId, planRevision, captured, stageAttempts, firstStageId },
) {
  for (const service of captured.serviceSelections) {
    await client.query(
      `INSERT INTO queue_selection_definitions(ticket_id,plan_revision,selection_id,kind,tenant_id,location_id,stage_id,service_id,snapshot)
      VALUES($1,$2,$3,'service',$4,$5,$6,$7,$8::jsonb)`,
      [
        ticketId,
        planRevision,
        service.serviceSelectionId,
        scope.tenantId,
        scope.locationId,
        service.stageId,
        service.serviceId,
        JSON.stringify(service),
      ],
    );
  }
  const attempts = new Map();
  for (const item of captured.items) {
    const parent =
      item.selectionKind === "resource"
        ? item.serviceSelectionId
        : item.parentResourceSelectionId;
    await client.query(
      `INSERT INTO queue_selection_definitions(ticket_id,plan_revision,selection_id,kind,parent_selection_id,parent_kind,
      tenant_id,location_id,stage_id,service_id,pool_id,units,duration_minutes,resource_member_id,resource_member_revision,snapshot)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb)`,
      [
        ticketId,
        planRevision,
        item.selectionId,
        item.selectionKind,
        parent,
        item.selectionKind === "resource" ? "service" : "resource",
        scope.tenantId,
        scope.locationId,
        item.stageId,
        item.serviceId,
        item.resource.poolId,
        item.resource.totalUnits,
        item.durationMinutes,
        item.resourceMemberId || null,
        item.resourceMemberRevision || null,
        JSON.stringify(item),
      ],
    );
    const attemptId = randomUUID();
    const parentAttemptId =
      item.selectionKind === "extra"
        ? attempts.get(item.parentResourceSelectionId)
        : null;
    if (item.selectionKind === "extra" && !parentAttemptId)
      throw new Error("Capture parent resource attempts before their extras.");
    await client.query(
      `INSERT INTO queue_child_attempts(id,ticket_id,plan_revision,selection_id,selection_kind,tenant_id,location_id,stage_id,stage_attempt_id,
      parent_child_attempt_id,parent_executed_selection_id,pool_id,units,duration_minutes,resource_member_id,attempt,state)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,1,$16)`,
      [
        attemptId,
        ticketId,
        planRevision,
        item.selectionId,
        item.selectionKind,
        scope.tenantId,
        scope.locationId,
        item.stageId,
        stageAttempts.get(item.stageId),
        parentAttemptId,
        item.selectionKind === "extra" ? item.parentResourceSelectionId : null,
        item.resource.poolId,
        item.resource.totalUnits,
        item.durationMinutes,
        item.resourceMemberId || null,
        item.stageId === firstStageId ? "waiting" : "pending",
      ],
    );
    attempts.set(item.selectionId, attemptId);
  }
  return attempts;
}
module.exports = { captureChildren };
