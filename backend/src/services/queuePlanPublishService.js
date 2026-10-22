const serviceHours = require("./queueServiceHoursService");
const { createHash, randomUUID } = require("node:crypto");
const db = require("../config/db");
const drafts = require("../repositories/queuePlanDrafts");
const projection = require("../repositories/queuePlanProjection");
const queueEvents = require("./queueEvents");
const { captureLines, assignStages } = require("./queuePlanCatalog");
const workflows = require("./queueWorkflowService");
const queue = require("./queueService");
const { getDateKey } = require("./queueHelpers");
const {
  withVendorQueueTransaction,
} = require("./vendorQueueTransactionService");
const maintenance = require("./platformMaintenanceService");
const entitlements = require("./entitlementAdmissionService");
const storeHours = require("./storeHoursService");
const { assertPublicTextFieldsAllowed } = require("./contentModeration");

function fail(code, message, statusCode = 409) {
  throw Object.assign(new Error(message), { code, statusCode });
}
async function publish(context, { draftId, operationKey, body }) {
  if (
    typeof operationKey !== "string" ||
    !/^[\x21-\x7e]{1,120}$/u.test(operationKey)
  )
    fail("INVALID_PLAN", "Idempotency-Key is required.", 400);
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some(
      (key) =>
        !["expectedPlanRevision", "expectedCatalogRevision"].includes(key),
    ) ||
    typeof body.expectedPlanRevision !== "string"
  )
    fail("INVALID_PLAN", "Expected draft revision is required.", 400);
  const { tenant, location, actorUserId } = context;
  const scope = {
    tenantId: String(tenant._id),
    locationId: String(location._id),
    actorUserId: String(actorUserId),
  };
  const hash = createHash("sha256")
    .update(
      JSON.stringify({
        action: "publish",
        draftId,
        expectedPlanRevision: body.expectedPlanRevision,
        expectedCatalogRevision: body.expectedCatalogRevision,
      }),
    )
    .digest("hex");
  let published = false;
  const result = await withVendorQueueTransaction(
    {
      pool: db.pool,
      tenant,
      location,
      actorUserId,
      permission: "tenant.queue.operate",
      lockTenantActivity: true,
    },
    async (client, _ledger, actor) => {
      scope.actorRole = actor.tenantMemberships[0].role;
      const args = [
        scope.tenantId,
        scope.locationId,
        scope.actorUserId,
        operationKey,
      ];
      const receipt = (
        await client.query(
          `SELECT payload_hash,result FROM queue_plan_command_receipts
      WHERE tenant_id=$1 AND location_id=$2 AND actor_user_id=$3 AND operation_key=$4`,
          args,
        )
      ).rows[0];
      if (receipt) {
        if (receipt.payload_hash !== hash)
          fail(
            "IDEMPOTENCY_CONFLICT",
            "This key was already used for a different command.",
          );
        return receipt.result;
      }
      const draft = await drafts.find(client, scope, draftId, true);
      if (draft.state !== "draft")
        fail(
          "PLAN_LOCKED",
          "This draft has already been published or discarded. Reload its authoritative result.",
        );
      if (draft.revision !== body.expectedPlanRevision)
        fail("STALE_REVISION", "The draft changed. Reload before publishing.");
      if (!draft.customer.name?.trim())
        fail(
          "INVALID_PLAN",
          "Customer name is required before publication.",
          400,
        );
      assertPublicTextFieldsAllowed({
        "Customer name": draft.customer.name,
        Notes: draft.notes,
      });
      const nested=Array.isArray(draft.service_selections);
      drafts.validateDraft({
        ...(nested?{serviceSelections:draft.service_selections}:{lines:draft.lines}),
        ...(draft.selection_contract_version===4?{contractVersion:4}:{}),
        customer: draft.customer,
        notes: draft.notes,
      });
      if (
        !draft.catalog_revision ||
        draft.catalog_revision !== body.expectedCatalogRevision
      )
        fail(
          "CATALOG_ACCEPTANCE_REQUIRED",
          "Review and save the current catalog before publishing.",
        );
      const workflow = await workflows.read(client, scope, {
        initialize: true,
      });
      const captured=nested?await require(draft.selection_contract_version===4?'./queueSelectionCaptureV4':'./queueSelectionCapture').capture(client,scope,draft.service_selections,draft.catalog_revision):null;
      const items = captured?captured.items:await captureLines(
        client,
        scope,
        draft.lines,
        draft.catalog_revision,
        { allowStagePools: workflow.mode === "multi_station" },
      );
      const configuredStages = captured?(workflow.mode==='linear'?null:captured.requiredStages.map(stage=>({...stage,station:workflow.stations.find(station=>station.stationId===stage.stationId)}))):await assignStages(
        client,
        scope,
        workflow,
        items,
      );
      if (captured?.contractVersion === 4) {
        await serviceHours.assertPlanFits(client,scope,items,workflow);
        serviceHours.tagItems(items);
      }
      await maintenance.assertNewIntake({ client });
      await entitlements.admit({
        tenantId: scope.tenantId,
        featureKey: "queue",
        client,
        lockPolicy: true,
      });
      const policy = (
        await client.query(
          `SELECT l.is_active,l.queue_lifecycle_mode,l.timezone,t.is_active AS tenant_active,
      t.auto_pause_enabled,t.auto_pause_threshold,t.queue_prefix FROM store_locations l JOIN tenants t ON t.id=l.tenant_id
      WHERE l.tenant_id=$1 AND l.id=$2`,
          [scope.tenantId, scope.locationId],
        )
      ).rows[0];
      if (!policy?.is_active || !policy.tenant_active)
        fail("INVALID_STATE", "This business or branch is inactive.");
      const currentLocation = {
        ...location,
        queueLifecycleMode: policy.queue_lifecycle_mode,
        timezone: policy.timezone,
      };
      const currentTenant = {
        ...tenant,
        autoPauseEnabled: policy.auto_pause_enabled,
        autoPauseThreshold: policy.auto_pause_threshold,
        queuePrefix: policy.queue_prefix,
      };
      const day = await queue.assertQueueIntakeOpen(
        currentTenant,
        currentLocation,
        { client },
      );
      const dateKey = day?.businessDate
        ? String(day.businessDate).replaceAll("-", "")
        : getDateKey(new Date(), currentLocation.timezone);
      await storeHours.assertLocationOpenForCustomerJoin(currentLocation, {
        client,
      });
      await queue.assertWaitingIntakeCapacityAvailable(
        currentTenant,
        currentLocation,
        { client, queueDateKey: dateKey, issuance: true },
      );
      const ticket = await queue.createTicketForTenantInTransaction(client, {
        tenant: currentTenant,
        location: currentLocation,
        customerName: draft.customer.name,
        customerEmail: draft.customer.email,
        customerPhone: draft.customer.phone,
        notes: draft.notes,
        joinChannel: "vendor",
        notifyByEmail: false,
        notifyBySms: false,
        queueDateKey: dateKey,
      });
      const stages = configuredStages || [
        { stageId: randomUUID(), label: "Service", station: null },
      ];
      const stageId = stages[0].stageId,
        attemptId = randomUUID();
      if (!configuredStages) for (const item of items) item.stageId = stageId;
      if(captured)for(const service of captured.serviceSelections)service.stageId=items.find(item=>item.serviceSelectionId===service.serviceSelectionId).stageId;
      const stageAttempts=new Map();
      for (const [index, stage] of stages.entries()){
        const stageAttemptId=index===0?attemptId:randomUUID();stageAttempts.set(stage.stageId,stageAttemptId);
        await client.query(
          `INSERT INTO queue_stage_attempts(id,tenant_id,location_id,ticket_id,stage_id,attempt,ordinal,state,station_id,station_snapshot,label)
      VALUES($1,$2,$3,$4,$5,1,$6,$7,$8,$9::jsonb,$10)`,
          [
            stageAttemptId,
            scope.tenantId,
            scope.locationId,
            ticket._id,
            stage.stageId,
            index + 1,
            index === 0 ? "waiting" : "pending",
            stage.station?.stationId || null,
            stage.station ? JSON.stringify(stage.station) : null,
            stage.label,
          ],
        );
      }
      await client.query(
        `INSERT INTO ticket_service_plans(ticket_id,tenant_id,location_id,source,execution_mode,items,
      created_by_user_id,contract_version,stage_id,stage_attempt_id,workflow_mode,workflow_configuration_revision,current_station_id,current_station_counter_ids,service_selections)
      VALUES($1,$2,$3,'staff_selection','parallel',$4::jsonb,$5,$12,$6,$7,$8,$9,$10,$11::jsonb,$13::jsonb)`,
        [
          ticket._id,
          scope.tenantId,
          scope.locationId,
          JSON.stringify(items),
          scope.actorUserId,
          stageId,
          attemptId,
          workflow.mode,
          workflow.configurationRevision,
          stages[0].station?.stationId || null,
          stages[0].station
            ? JSON.stringify(stages[0].station.serviceCounterIds)
            : null,
          nested?captured.contractVersion:2,
          captured?JSON.stringify(captured.serviceSelections):null,
        ],
      );
      await client.query(
        `INSERT INTO queue_plan_versions(id,draft_id,tenant_id,location_id,ticket_id,revision,workflow_mode,
      stage_id,lines_snapshot,actor_user_id,reason,workflow_configuration_revision,service_selections) VALUES($1,$2,$3,$4,$5,1,$6,$7,$8::jsonb,$9,'Initial publication',$10,$11::jsonb)`,
        [
          randomUUID(),
          draftId,
          scope.tenantId,
          scope.locationId,
          ticket._id,
          workflow.mode,
          stageId,
          JSON.stringify(items),
          scope.actorUserId,
          workflow.configurationRevision,
          captured?JSON.stringify(captured.serviceSelections):null,
        ],
      );
      if(captured)await require('../repositories/queueSelectionRepository').captureChildren(client,scope,{ticketId:ticket._id,planRevision:'1',captured,stageAttempts,firstStageId:stageId});
      const updated = (
        await client.query(
          `UPDATE queue_plan_drafts SET state='published',published_ticket_id=$4,
      revision=revision+1,updated_at=clock_timestamp() WHERE tenant_id=$1 AND location_id=$2 AND id=$3 RETURNING *,revision::text,published_ticket_id::text`,
          [scope.tenantId, scope.locationId, draftId, ticket._id],
        )
      ).rows[0];
      const result = { plan: await projection.read(client, scope, updated) };
      await client.query(
        `INSERT INTO queue_plan_notification_outbox(tenant_id,location_id,ticket_id,plan_revision,kind)
      VALUES($1,$2,$3,1,'service_plan_published') ON CONFLICT DO NOTHING`,
        [scope.tenantId, scope.locationId, ticket._id],
      );
      await queue.recordCreatedTicketEvent(client, ticket, {
        actorUserId,
        actorRole: "vendor",
        source: "vendor",
      });
      await client.query(
        `INSERT INTO queue_plan_events(tenant_id,location_id,actor_user_id,draft_id,event_type,old_revision,new_revision,
      snapshot,actor_role,old_snapshot) VALUES($1,$2,$3,$4,'plan_published',$5,$6,$7::jsonb,$8,$9::jsonb)`,
        [
          scope.tenantId,
          scope.locationId,
          actorUserId,
          draftId,
          draft.revision,
          updated.revision,
          JSON.stringify(result.plan),
          actor.tenantMemberships[0].role,
          JSON.stringify(drafts.dto(draft)),
        ],
      );
      await client.query(
        `INSERT INTO queue_plan_command_receipts(tenant_id,location_id,actor_user_id,operation_key,payload_hash,result)
      VALUES($1,$2,$3,$4,$5,$6::jsonb)`,
        [...args, hash, JSON.stringify(result)],
      );
      await client.query(
        "UPDATE resource_ledger_scopes SET revision=revision+1 WHERE tenant_id=$1 AND location_id=$2",
        [scope.tenantId, scope.locationId],
      );
      published = true;
      return result;
    },
  );
  // Publication changes operational counts; drafts alone are not Dashboard work.
  // Emit only after commit, and avoid duplicate hints for receipt-only replay.
  if (published) queueEvents.publish(tenant.slug,
    {type:"queue-plans-updated",locationId:String(location._id),planId:result.plan?.id||draftId},
    {locationId:location._id});
  return result;
}
module.exports = { publish };
