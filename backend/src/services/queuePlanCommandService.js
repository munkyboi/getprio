const serviceHours = require("./queueServiceHoursService");
const { createHash, randomUUID } = require("node:crypto");
const db = require("../config/db");
const drafts = require("../repositories/queuePlanDrafts");
const projection = require("../repositories/queuePlanProjection");
const grouped = require("../repositories/queueGroupedLedger");
const tickets = require("../repositories/tickets");
const { captureLines, assignStages } = require("./queuePlanCatalog");
const workflows = require("./queueWorkflowService");
const queue = require("./queueService");
const timing = require("./ticketServiceTimingService");
const dispatch = require("./counterDispatchService");
const {
  withVendorQueueTransaction,
} = require("./vendorQueueTransactionService");
const events = require("../repositories/queueEvents");
const queueEventStream = require("./queueEvents");
const webhooks = require("./developerWebhookService");
const stages = require("./queueStageService");

function fail(code, message, statusCode = 409) {
  throw Object.assign(new Error(message), { code, statusCode });
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort((left, right) => left < right ? -1 : Number(left > right))
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}
function validate(action, body, operationKey) {
  if (
    ![
      "call",
      "start",
      "complete",
      "interrupt",
      "amend",
      "handoff",
      "pause",
      "resume",
      "retry",
      "reassign",
      "cancelProtection",
      "skip",
      "recall",
    ].includes(action)
  )
    fail("INVALID_PLAN", "Unsupported plan command.", 400);
  if (
    typeof operationKey !== "string" ||
    !/^[\x21-\x7e]{1,120}$/u.test(operationKey)
  )
    fail("INVALID_PLAN", "Idempotency-Key is required.", 400);
  const fields = [
    "expectedTicketRevision",
    "expectedPlanRevision",
    "currentStageId",
    "expectedStageRevision",
  ];
  const extra = {
    call: ["counterSlug", "dispatchMode"],
    start: ["reservationGroupId"],
    complete: ["allocationGroupId", "childAttemptId", "expectedChildRevision", "completeAll"],
    interrupt: [
      "allocationGroupId",
      "reason",
      "childAttemptId",
      "expectedChildRevision",
      "interruptedExtras",
    ],
    amend: [
      "lines",
      "serviceSelections",
      "contractVersion",
      "reason",
      "customerAgreement",
      "expectedCatalogRevision",
    ],
    handoff: [],
    pause: ["allocationGroupId"],
    resume: ["allocationGroupId"],
    retry: ["childAttemptId", "expectedChildRevision", "interruptedExtras"],
    reassign: ["assignedUserId"],
    cancelProtection: ["reservationGroupId", "reason"],
    skip: ["reservationGroupId", "reason"],
    recall: ["reason"],
  };
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some(
      (key) => ![...fields, ...extra[action], "counterSlug", "expectedCounterId"].includes(key),
    ) ||
    fields.some((key) => typeof body[key] !== "string" || !body[key])
  )
    fail(
      "INVALID_PLAN",
      "Ticket, plan and current stage revisions are required.",
      400,
    );
  require("./queueCounterBinding").validate(body,{call:action === "call"});
  if (body.dispatchMode !== undefined && (action !== 'call' || !['nextEligible','selectedRequest'].includes(body.dispatchMode)))
    fail('INVALID_PLAN', 'Unsupported call dispatch mode.', 400);
  if (
    ["interrupt", "amend", "cancelProtection", "skip", "recall"].includes(action) &&
    (typeof body.reason !== "string" ||
      !body.reason.trim() ||
      body.reason.length > 500)
  )
    fail(
      "INVALID_PLAN",
      "A reason of one to five hundred characters is required.",
      400,
    );
  if (
    action === "reassign" &&
    (typeof body.assignedUserId !== "string" ||
      !/^[1-9]\d{0,18}$/u.test(body.assignedUserId) ||
      BigInt(body.assignedUserId) > 9223372036854775807n)
  )
    fail("INVALID_PLAN", "Select a valid operator.", 400);
  const uuid = (value) =>
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
      value,
    );
  const childRef = (value) =>
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).every((key) =>
      ["childAttemptId", "expectedChildRevision"].includes(key),
    ) &&
    uuid(value.childAttemptId) &&
    typeof value.expectedChildRevision === "string" &&
    /^[1-9]\d{0,18}$/u.test(value.expectedChildRevision);
  if (
    (body.childAttemptId !== undefined ||
      body.expectedChildRevision !== undefined) &&
    !childRef({
      childAttemptId: body.childAttemptId,
      expectedChildRevision: body.expectedChildRevision,
    })
  )
    fail(
      "INVALID_PLAN",
      "A recorded child identifier and revision are required.",
      400,
    );
  if (
    body.interruptedExtras !== undefined &&
    (!Array.isArray(body.interruptedExtras) ||
      body.interruptedExtras.length > 20 ||
      !body.interruptedExtras.every(childRef))
  )
    fail(
      "INVALID_PLAN",
      "Interrupted extras need their recorded identifiers and revisions.",
      400,
    );
  if (["cancelProtection", "skip"].includes(action) && !uuid(body.reservationGroupId)) fail("INVALID_PLAN", "A recorded reservation group is required.", 400);
  if (body.allocationGroupId !== undefined && !uuid(body.allocationGroupId))
    fail("INVALID_PLAN", "A recorded allocation group is required.", 400);
  if (action === "complete") {
    if (body.completeAll === true) {
      if (!uuid(body.allocationGroupId) || body.childAttemptId !== undefined || body.expectedChildRevision !== undefined)
        fail("INVALID_PLAN", "A complete-all command needs the recorded allocation group only.", 400);
    } else if (!uuid(body.childAttemptId) || typeof body.expectedChildRevision !== "string" || !/^[1-9]\d{0,18}$/u.test(body.expectedChildRevision) || !uuid(body.allocationGroupId)) {
      fail("INVALID_PLAN", "A recorded child allocation is required.", 400);
    }
  }
  if (action === "amend") {
    if (body.contractVersion !== undefined && body.contractVersion !== 4)
      fail("INVALID_PLAN", "Unsupported input contract version.", 400);
    if (body.serviceSelections !== undefined && body.lines !== undefined)
      fail("INVALID_PLAN", "Use one selection model.", 400);
    drafts.validateDraft(
      body.serviceSelections !== undefined
        ? {
            serviceSelections: body.serviceSelections,
            ...(body.contractVersion === 4 ? { contractVersion: 4 } : {}),
          }
        : { lines: body.lines },
    );
    if (
      body.customerAgreement != null &&
      (typeof body.customerAgreement !== "object" ||
        Array.isArray(body.customerAgreement) ||
        Object.keys(body.customerAgreement).some(
          (key) => key !== "confirmed",
        ) ||
        body.customerAgreement.confirmed !== true)
    )
      fail(
        "INVALID_PLAN",
        "Customer agreement must be explicitly confirmed.",
        400,
      );
  }
}
async function queueEvent(client, ticket, eventType, actorUserId, metadata, fromStatus = "waiting") {
  const event = await events.createQueueEvent(
    {
      ticketId: ticket._id,
      tenantId: ticket.tenantId,
      locationId: ticket.locationId,
      queueDateKey: ticket.dateKey,
      eventType,
      fromStatus,
      toStatus: ticket.status,
      actorUserId,
      actorRole: "vendor",
      source: "vendor",
      metadata,
    },
    { client },
  );
  await webhooks.enqueueQueueEvent({ event, ticket }, { client });
}
async function amend(client, scope, draft, p, ticket, body) {
  if (
    !["waiting", "called"].includes(ticket.status) ||
    ticket.serviceStartedAt ||
    ticket.serviceEndedAt
  )
    fail("PLAN_LOCKED", "The service plan can only change before Start.");
  if (
    (
      await client.query(
        "SELECT 1 FROM resource_allocations WHERE tenant_id=$1 AND location_id=$2 AND ticket_id=$3 LIMIT 1",
        [scope.tenantId, scope.locationId, ticket._id],
      )
    ).rows.length
  )
    fail("PLAN_LOCKED", "An allocated service plan cannot change.");
  const workflow = await workflows.readVersion(
    client,
    scope,
    p.workflow_configuration_revision,
  );
  const items = await captureLines(
    client,
    scope,
    body.lines,
    body.expectedCatalogRevision,
    { allowStagePools: p.workflow_mode === "multi_station" },
  );
  const configured = await assignStages(client, scope, workflow, items);
  if (typeof body.expectedCatalogRevision !== "string")
    fail(
      "CATALOG_ACCEPTANCE_REQUIRED",
      "Review the current catalog before amending.",
    );
  const reduced = p.items.some((old) => {
    const next = items.find(
      (item) => item.lineId === old.lineId && item.serviceId === old.serviceId,
    );
    return !next || next.quantity < old.quantity;
  });
  if (reduced && body.customerAgreement?.confirmed !== true)
    fail(
      "CUSTOMER_AGREEMENT_REQUIRED",
      "Confirm the customer agreed to this quantity reduction.",
    );
  for (const item of items) {
    const old = p.items.find((previous) => previous.lineId === item.lineId);
    if (old && old.serviceId !== item.serviceId)
      fail(
        "INVALID_PLAN",
        "A replacement service needs a new line identifier.",
        400,
      );
    if (!configured) item.stageId = p.stage_id;
    item.lineRevision = String(BigInt(old?.lineRevision || "0") + 1n);
    if (old) item.priceDisplay = old.priceDisplay;
  }
  await require("./queueAmendAvailability").assertAvailable(client, scope, ticket._id, p.items, items);
  const groups = (
    await client.query(
      `SELECT id FROM queue_reservation_groups WHERE tenant_id=$1 AND location_id=$2 AND ticket_id=$3 AND state='protected' FOR UPDATE`,
      [scope.tenantId, scope.locationId, ticket._id],
    )
  ).rows;
  for (const group of groups) {
    await client.query(
      "UPDATE resource_ledger_reservations SET state='cancelled' WHERE tenant_id=$1 AND location_id=$2 AND group_id=$3 AND state='protected'",
      [scope.tenantId, scope.locationId, group.id],
    );
    await client.query(
      "UPDATE queue_reservation_groups SET state='cancelled' WHERE id=$1",
      [group.id],
    );
  }
  const revision = String(BigInt(p.revision) + 1n);
  const oldStage = (
    await client.query(
      "SELECT * FROM queue_stage_attempts WHERE id=$1 FOR UPDATE",
      [p.stage_attempt_id],
    )
  ).rows[0];
  const required = configured || [
    { stageId: p.stage_id, label: oldStage.label || "Service", station: null },
  ];
  const preserveCall =
    ticket.status === "called" && required[0].stageId === p.stage_id;
  await client.query(
    `UPDATE queue_stage_attempts SET state='superseded',ended_at=clock_timestamp(),revision=revision+1
  WHERE tenant_id=$1 AND location_id=$2 AND ticket_id=$3 AND started_at IS NULL AND state IN('pending','waiting','called')`,
    [scope.tenantId, scope.locationId, ticket._id],
  );
  const firstId = randomUUID();
  for (const [index, stage] of required.entries()) {
    const attempt = (
      await client.query(
        "SELECT COALESCE(max(attempt),0)::text AS prior FROM queue_stage_attempts WHERE ticket_id=$1 AND stage_id=$2",
        [ticket._id, stage.stageId],
      )
    ).rows[0].prior;
    await client.query(
      `INSERT INTO queue_stage_attempts(id,tenant_id,location_id,ticket_id,stage_id,attempt,ordinal,state,station_id,station_snapshot,label,assigned_user_id)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12)`,
      [
        index === 0 ? firstId : randomUUID(),
        scope.tenantId,
        scope.locationId,
        ticket._id,
        stage.stageId,
        String(BigInt(attempt) + 1n),
        index + 1,
        index === 0 ? (preserveCall ? "called" : "waiting") : "pending",
        stage.station?.stationId || null,
        stage.station ? JSON.stringify(stage.station) : null,
        stage.label,
        index === 0 && preserveCall ? oldStage.assigned_user_id : null,
      ],
    );
  }
  await client.query(
    `UPDATE ticket_service_plans SET items=$4::jsonb,revision=$5,resource_wait=NULL,stage_id=$6,stage_attempt_id=$7,current_station_id=$8,current_station_counter_ids=$9::jsonb
  WHERE tenant_id=$1 AND location_id=$2 AND ticket_id=$3`,
    [
      scope.tenantId,
      scope.locationId,
      ticket._id,
      JSON.stringify(items),
      revision,
      required[0].stageId,
      firstId,
      required[0].station?.stationId || null,
      required[0].station
        ? JSON.stringify(required[0].station.serviceCounterIds)
        : null,
    ],
  );
  await client.query(
    `INSERT INTO queue_plan_versions(id,draft_id,tenant_id,location_id,ticket_id,revision,workflow_mode,stage_id,lines_snapshot,actor_user_id,reason,customer_agreement,workflow_configuration_revision)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12::jsonb,$13)`,
    [
      randomUUID(),
      draft.id,
      scope.tenantId,
      scope.locationId,
      ticket._id,
      revision,
      p.workflow_mode,
      required[0].stageId,
      JSON.stringify(items),
      scope.actorUserId,
      body.reason.trim(),
      body.customerAgreement ? JSON.stringify(body.customerAgreement) : null,
      p.workflow_configuration_revision,
    ],
  );
  if (preserveCall)
    await grouped.reserve(
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
    [scope.tenantId, scope.locationId, ticket._id, revision],
  );
  await client.query(
    "UPDATE resource_ledger_scopes SET revision=revision+1 WHERE tenant_id=$1 AND location_id=$2",
    [scope.tenantId, scope.locationId],
  );
}
async function execute(
  context,
  { draftId, action, operationKey, body, serviceCounter },
) {
  validate(action, body, operationKey);
  const { tenant, location, actorUserId } = context;
  const scope = {
    tenantId: String(tenant._id),
    locationId: String(location._id),
    actorUserId: String(actorUserId),
  };
  const hash = createHash("sha256")
    .update(JSON.stringify(canonical({ action, draftId, body })))
    .digest("hex");
  try {
    const outcome = await withVendorQueueTransaction(
      {
        pool: db.pool,
        tenant,
        location,
        actorUserId,
        permission:
          action === "reassign"
            ? "tenant.staff.manage"
            : ["call", "amend", "cancelProtection"].includes(action)
              ? "tenant.queue.operate"
              : "tenant.ticket.update_state",
        lockTenantActivity: ["start", "call", "retry"].includes(action),
      },
      async (client, ledger, actor) => {
        scope.actorRole = actor.tenantMemberships[0].role;
        const args = [
          scope.tenantId,
          scope.locationId,
          scope.actorUserId,
          operationKey,
        ];
        const receipt = (
          await client.query(
            "SELECT payload_hash,result FROM queue_plan_command_receipts WHERE tenant_id=$1 AND location_id=$2 AND actor_user_id=$3 AND operation_key=$4",
            args,
          )
        ).rows[0];
        if (receipt) {
          if (receipt.payload_hash !== hash)
            fail(
              "IDEMPOTENCY_CONFLICT",
              "This key was used for a different command.",
            );
          return receipt.result;
        }
        const draft = await drafts.find(client, scope, draftId, true);
        if (draft.state !== "published")
          fail(
            "PLAN_NOT_PUBLISHED",
            "Publish the draft before operating its ticket.",
          );
        if (
          await grouped.expireUnstarted(
            client,
            { ...scope, actorRole: actor.tenantMemberships[0].role },
            draft,
          )
        )
          return {
            expired: true,
            plan: await projection.read(client, scope, draft),
          };
        const ticket = await tickets.findTicketByIdForUpdate(
          draft.published_ticket_id,
          { client },
        );
        if (
          !ticket ||
          String(ticket.tenantId) !== scope.tenantId ||
          String(ticket.locationId) !== scope.locationId
        )
          fail("INVALID_STATE", "Ticket scope changed.");
        const p = (
          await client.query(
            "SELECT *,revision::text,ticket_revision::text FROM ticket_service_plans WHERE tenant_id=$1 AND location_id=$2 AND ticket_id=$3 FOR UPDATE",
            [scope.tenantId, scope.locationId, ticket._id],
          )
        ).rows[0];
        const stage = (
          await client.query(
            "SELECT *,revision::text FROM queue_stage_attempts WHERE id=$1 FOR UPDATE",
            [p.stage_attempt_id],
          )
        ).rows[0];
        if (![2, 3, 4].includes(p.contract_version))
          fail(
            "UNSUPPORTED_EXECUTION_MODE",
            "This command requires a published queue plan.",
          );
        if (
          p.ticket_revision !== body.expectedTicketRevision ||
          p.revision !== body.expectedPlanRevision ||
          p.stage_id !== body.currentStageId ||
          stage.revision !== body.expectedStageRevision
        )
          fail(
            "STALE_REVISION",
            "The ticket, plan or current stage changed. Reload before continuing.",
          );
        if (Object.hasOwn(body,"expectedCounterId")) {
          if (action === "call") {
            if (String(serviceCounter?._id) !== body.expectedCounterId) fail("COUNTER_CONTEXT_CHANGED","The selected counter changed. Refresh before continuing.");
          } else await require("./queueCounterBinding").assert(client,scope,ticket,body,{status:action === "recall" ? "skipped" : "called"});
        }
        const before = await projection.read(client, scope, draft);
        if (p.workflow_mode === "multi_station")
          await stages.assertActor(
            client,
            scope,
            stage,
            actor,
            action === "call" ? serviceCounter : undefined,
          );
        if (["skip", "recall"].includes(action)) {
          await require("./queuePlanRecoveryService")[action](client,{scope,tenant,location,ticket,p,stage,body,queue,queueEvent,readTicket:id=>tickets.findTicketByIdForUpdate(id,{client})});
        }
        else if (action === "cancelProtection") {
          if (![3,4].includes(p.contract_version) || ticket.status !== "called" || stage.started_at) fail("INVALID_STATE", "Cancel protection requires a called, unstarted service request.");
          const binding=(await client.query(`SELECT r.id::text FROM resource_ledger_reservations r
            JOIN queue_reservation_groups g ON g.id=r.group_id
            WHERE r.tenant_id=$1 AND r.location_id=$2 AND r.ticket_id=$3 AND g.id=$4
              AND g.stage_attempt_id=$5 AND g.state='protected' AND r.state='protected' ORDER BY r.id LIMIT 1`,
            [scope.tenantId,scope.locationId,ticket._id,body.reservationGroupId,p.stage_attempt_id])).rows[0];
          if(!binding) fail("INVALID_STATE","The current protected group is missing. Reload before continuing.");
          await ledger.executeCommand({command:"cancelReservation",payload:{reservationId:binding.id},operationKey:`plan-cancel:${createHash("sha256").update(`${actorUserId}:${operationKey}`).digest("hex")}`});
        }
        else if ([3, 4].includes(p.contract_version) && action !== "call") {
          if(p.contract_version===4&&['start','retry'].includes(action))
            await serviceHours.assertRemainingPlanFits(client,scope,p,stage,
              action==='retry'?{retryChildId:body.childAttemptId}:{});
          await require("./queueSelectionCommandService").execute(
            client,
            ledger,
            {
              scope,
              tenant,
              location,
              ticket,
              p,
              stage,
              action,
              body,
              actor,
              timing,
              draft,
            },
          );
        }
        else if (action === "amend")
          await amend(client, scope, draft, p, ticket, body);
        else if (action === "call") {
          if (ticket.status !== "waiting")
            fail("INVALID_STATE", "Only a waiting ticket can be called.");
          const activity = (
            await client.query(
              "SELECT l.is_active,t.is_active AS tenant_active FROM store_locations l JOIN tenants t ON t.id=l.tenant_id WHERE l.tenant_id=$1 AND l.id=$2",
              [scope.tenantId, scope.locationId],
            )
          ).rows[0];
          if (!activity?.is_active || !activity.tenant_active)
            fail("INVALID_STATE", "This business or branch is inactive.");
          let day;
          try {
            day = await queue.assertQueueDayOpen(tenant, location, { client });
          } catch (error) {
            if (error.code !== "QUEUE_DAY_OVERDUE") throw error;
            await client.query(
              "UPDATE resource_ledger_scopes SET revision=revision+1 WHERE tenant_id=$1 AND location_id=$2",
              [scope.tenantId, scope.locationId],
            );
            return { overdueError: error };
          }
          if(p.contract_version===4)await serviceHours.assertRemainingPlanFits(client,scope,p,stage);
          let eligibleTicketId=body.dispatchMode==='selectedRequest'?String(ticket._id):undefined;
          if(body.dispatchMode==='nextEligible'){
            const candidate=await require('./queueCounterControlsService').findNextEligible(client,scope,{
              queueOpen:true,counter:{id:String(serviceCounter?._id),is_active:true},
              dateKey:day?.businessDate?String(day.businessDate).replaceAll('-',''):ticket.dateKey,
            });
            if(!candidate||candidate.ticketId!==String(ticket._id))
              fail('ELIGIBLE_CANDIDATE_CHANGED','The next eligible request changed. Refresh before calling.');
            eligibleTicketId=candidate.ticketId;
          }
          const next = await dispatch.claimNext(
            client,
            {
              tenantId: scope.tenantId,
              locationId: scope.locationId,
              dateKey: day?.businessDate
                ? String(day.businessDate).replaceAll("-", "")
                : ticket.dateKey,
            },
            { serviceCounter, ...(eligibleTicketId?{targetTicketId:eligibleTicketId}:{}) },
          );
          if (!next || String(next._id) !== String(ticket._id))
            fail(
              "INVALID_STATE",
              "Another ticket has priority. Refresh the queue.",
            );
          if ([3, 4].includes(p.contract_version))
            await require("../repositories/queueSelectionLedger").reserve(
              client,
              [scope.tenantId, scope.locationId],
              ticket._id,
            );
          else
            await ledger.executeCommand({
              operationKey: `plan:${scope.actorUserId}:${hash}:call`,
              command: "reserveTicket",
              payload: { ticketId: String(ticket._id) },
            });
          if (p.workflow_mode === "multi_station")
            await client.query(
              "UPDATE queue_stage_attempts SET assigned_user_id=$2 WHERE id=$1 AND assigned_user_id IS NULL",
              [stage.id, actorUserId],
            );
          await client.query(
            "UPDATE ticket_service_plans SET resource_wait=NULL WHERE ticket_id=$1",
            [ticket._id],
          );
          await queueEvent(client, next, "ticket_called", actorUserId, {
            serviceCounterId: serviceCounter?._id,
            planRevision: p.revision,
          });
        } else if (
          ["start", "complete", "interrupt", "pause", "resume"].includes(action)
        ) {
          const table =
            action === "start"
              ? "queue_reservation_groups"
              : "queue_allocation_groups";
          const groupId =
            action === "start"
              ? body.reservationGroupId
              : body.allocationGroupId;
          if (
            typeof groupId !== "string" ||
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
              groupId,
            )
          )
            fail(
              "INVALID_PLAN",
              "A recorded resource group identifier is required.",
              400,
            );
          const group = (
            await client.query(
              `SELECT * FROM ${table} WHERE id=$1 AND tenant_id=$2 AND location_id=$3 AND ticket_id=$4 AND stage_attempt_id=$5 FOR UPDATE`,
              [
                groupId,
                scope.tenantId,
                scope.locationId,
                ticket._id,
                p.stage_attempt_id,
              ],
            )
          ).rows[0];
          if (!group)
            fail(
              "INVALID_STATE",
              "The recorded resource group does not belong to the current stage.",
            );
          if (
            action === "start" &&
            (group.state !== "protected" ||
              String(group.plan_revision) !== p.revision)
          )
            fail(
              "STALE_REVISION",
              "The selected reservation group is no longer current.",
            );
          if (p.workflow_mode === "multi_station")
            await stages.execute(client, ledger, {
              scope,
              tenant,
              location,
              ticket,
              p,
              stage,
              action,
              body,
              actor,
              timing,
            });
          else {
            if (!["start", "complete", "interrupt"].includes(action))
              fail(
                "UNSUPPORTED_EXECUTION_MODE",
                "This action requires a multi-station workflow.",
              );
            await timing.applyTicketService(
              client,
              ledger,
              tenant,
              ticket._id,
              action,
              { location, actorUserId, reason: body.reason },
            );
          }
        } else {
          if (p.workflow_mode !== "multi_station")
            fail(
              "UNSUPPORTED_EXECUTION_MODE",
              "This action requires a multi-station workflow.",
            );
          await stages.execute(client, ledger, {
            scope,
            tenant,
            location,
            ticket,
            p,
            stage,
            action,
            body,
            actor,
            timing,
          });
        }
        if (action !== "cancelProtection") await client.query(
          "UPDATE ticket_service_plans SET ticket_revision=ticket_revision+1 WHERE tenant_id=$1 AND location_id=$2 AND ticket_id=$3",
          [scope.tenantId, scope.locationId, ticket._id],
        );
        // A released allocation can make previously blocked waiting plans
        // eligible again. Clear their retryable wait marker; the next Call
        // attempt rechecks authoritative capacity and restores it if needed.
        if (["complete", "interrupt"].includes(action)) await client.query(
          `UPDATE ticket_service_plans p SET resource_wait=NULL
           WHERE p.tenant_id=$1 AND p.location_id=$2 AND p.resource_wait IS NOT NULL
             AND EXISTS (SELECT 1 FROM tickets t WHERE t.id=p.ticket_id AND t.status='waiting')`,
          [scope.tenantId, scope.locationId],
        );
        if (
          ([3, 4].includes(p.contract_version) && action === "call") || ["skip","recall"].includes(action) ||
          (![3, 4].includes(p.contract_version) &&
            ["handoff", "pause", "resume", "retry", "reassign"].includes(
              action,
            ))
        )
          await client.query(
            "UPDATE resource_ledger_scopes SET revision=revision+1 WHERE tenant_id=$1 AND location_id=$2",
            [scope.tenantId, scope.locationId],
          );
        const result = { plan: await projection.read(client, scope, draft) };
        await client.query(
          `INSERT INTO queue_plan_events(tenant_id,location_id,actor_user_id,draft_id,event_type,old_revision,new_revision,snapshot,actor_role,old_snapshot)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10::jsonb)`,
          [
            scope.tenantId,
            scope.locationId,
            actorUserId,
            draftId,
            `plan_${action}`,
            before.planRevision,
            result.plan.planRevision,
            JSON.stringify(["cancelProtection","skip","recall"].includes(action) ? {...result.plan,actionReason:body.reason.trim()} : result.plan),
            actor.tenantMemberships[0].role,
            JSON.stringify(before),
          ],
        );
        await client.query(
          "INSERT INTO queue_plan_command_receipts(tenant_id,location_id,actor_user_id,operation_key,payload_hash,result) VALUES($1,$2,$3,$4,$5,$6::jsonb)",
          [...args, hash, JSON.stringify(result)],
        );
        return result;
      },
    );
    queueEventStream.publish(tenant.slug,{type:"queue-plans-updated",locationId:String(location._id),planId:outcome.plan?.id||draftId},{locationId:location._id});
    if (outcome.overdueError) throw outcome.overdueError;
    if (outcome.expired)
      throw Object.assign(
        new Error(
          "The protected call expired. Reload and call the ticket again.",
        ),
        { statusCode: 409, code: "RESERVATION_EXPIRED", plan: outcome.plan },
      );
    return outcome;
  } catch (error) {
    if (action === "call" && error.code === "RESOURCE_CAPACITY_UNAVAILABLE") {
      error.plan = await withVendorQueueTransaction(
        {
          pool: db.pool,
          tenant,
          location,
          actorUserId,
          permission: "tenant.queue.operate",
        },
        async (client, _ledger, actor) => {
          const draft = await drafts.find(client, scope, draftId, true);
          const ticket = await tickets.findTicketByIdForUpdate(
            draft.published_ticket_id,
            { client },
          );
          const p = (
            await client.query(
              "SELECT revision::text,ticket_revision::text,stage_id FROM ticket_service_plans WHERE ticket_id=$1 FOR UPDATE",
              [ticket._id],
            )
          ).rows[0];
          if (
            ticket.status === "waiting" &&
            p.revision === body.expectedPlanRevision &&
            p.ticket_revision === body.expectedTicketRevision
          ) {
            const before = await projection.read(client, scope, draft);
            await client.query(
              `UPDATE ticket_service_plans SET resource_wait=jsonb_build_object('code','RESOURCE_CAPACITY_UNAVAILABLE','message','Waiting for the requested resource capacity.','planRevision',revision::text,'stageId',stage_id,'observedAt',clock_timestamp()) || $2::jsonb,ticket_revision=ticket_revision+1 WHERE ticket_id=$1`,
              [ticket._id, JSON.stringify(error.capacityWait || {})],
            );
            const after = await projection.read(client, scope, draft);
            await client.query(
              `INSERT INTO queue_plan_events(tenant_id,location_id,actor_user_id,draft_id,event_type,old_revision,new_revision,snapshot,actor_role,old_snapshot)
       VALUES($1,$2,$3,$4,'capacity_wait',$5,$5,$6::jsonb,$7,$8::jsonb)`,
              [
                scope.tenantId,
                scope.locationId,
                actorUserId,
                draft.id,
                p.revision,
                JSON.stringify(after),
                actor.tenantMemberships[0].role,
                JSON.stringify(before),
              ],
            );
            await client.query(
              "UPDATE resource_ledger_scopes SET revision=revision+1 WHERE tenant_id=$1 AND location_id=$2",
              [scope.tenantId, scope.locationId],
            );
          }
          return projection.read(client, scope, draft);
        },
      );
      queueEventStream.publish(tenant.slug,{type:"queue-plans-updated",locationId:String(location._id),planId:error.plan?.id||draftId},{locationId:location._id});
    }
    throw error;
  }
}
module.exports = { execute, validate };
