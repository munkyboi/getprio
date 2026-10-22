const { createHash, randomUUID } = require("node:crypto");

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
function validateDraft(body) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some(
      (key) =>
        ![
          "lines",
          "notes",
          "customer",
          "expectedPlanRevision",
          "catalogRevision",
          "serviceSelections",
          "contractVersion",
        ].includes(key),
    )
  ) {
    fail("INVALID_PLAN", "Unsupported draft fields.", 400);
  }
  const { lines = [], notes = "", customer = {} } = body;
  if (body.contractVersion !== undefined && body.contractVersion !== 4)
    fail("INVALID_PLAN", "Unsupported input contract version.", 400);
  if (
    body.contractVersion === 4 &&
    !Object.hasOwn(body, "serviceSelections") &&
    !Object.hasOwn(body, "expectedPlanRevision")
  )
    fail(
      "INVALID_PLAN",
      "Version 4 requires explicit service selections.",
      400,
    );
  if (Object.hasOwn(body, "serviceSelections")) {
    if (Object.hasOwn(body, "lines"))
      fail(
        "INVALID_PLAN",
        "Nested selections cannot be mixed with flat lines.",
        400,
      );
    require(
      body.contractVersion === 4
        ? "../services/queueSelectionCaptureV4"
        : "../services/queueSelectionCapture",
    ).validateSelections(body.serviceSelections);
  }
  if (
    body.catalogRevision != null &&
    (typeof body.catalogRevision !== "string" ||
      !/^[a-f0-9]{64}$/u.test(body.catalogRevision))
  )
    fail("INVALID_PLAN", "Invalid catalog revision.", 400);
  if (
    !Array.isArray(lines) ||
    lines.length > 20 ||
    typeof notes !== "string" ||
    notes.length > 2000 ||
    !customer ||
    typeof customer !== "object" ||
    Array.isArray(customer) ||
    Object.keys(customer).some(
      (key) => !["name", "email", "phone"].includes(key),
    ) ||
    Object.values(customer).some(
      (value) => typeof value !== "string" || value.length > 254,
    )
  ) {
    fail("INVALID_PLAN", "Invalid draft details.", 400);
  }
  const seen = new Set();
  for (const line of lines) {
    if (
      !line ||
      typeof line !== "object" ||
      Array.isArray(line) ||
      Object.keys(line).some(
        (key) =>
          !["lineId", "serviceId", "quantity", "durationMinutes"].includes(key),
      ) ||
      typeof line.lineId !== "string" ||
      !/^[A-Za-z0-9_-]{1,80}$/u.test(line.lineId) ||
      seen.has(line.lineId) ||
      (line.serviceId != null &&
        (typeof line.serviceId !== "string" ||
          !/^[1-9]\d{0,18}$/u.test(line.serviceId) ||
          BigInt(line.serviceId) > 9223372036854775807n)) ||
      (line.quantity != null &&
        (!Number.isInteger(line.quantity) ||
          line.quantity < 1 ||
          line.quantity > 100)) ||
      (line.durationMinutes != null &&
        (!Number.isInteger(line.durationMinutes) ||
          line.durationMinutes < 5 ||
          line.durationMinutes > 480))
    ) {
      fail(
        "INVALID_PLAN",
        "Invalid or duplicate service line. Incomplete values may be null.",
        400,
      );
    }
    seen.add(line.lineId);
  }
  return {
    customer,
    lines,
    notes,
    catalogRevision: body.catalogRevision || null,
    serviceSelections: body.serviceSelections ?? null,
    selectionContractVersion: body.serviceSelections
      ? body.contractVersion === 4
        ? 4
        : 3
      : null,
  };
}
function dto(row) {
  const nested = Array.isArray(row.service_selections);
  const result = {
    contractVersion: nested ? row.selection_contract_version || 3 : 2,
    id: row.id,
    draftId: row.id,
    ticketId: row.published_ticket_id || null,
    ticketRevision: null,
    planRevision: String(row.revision),
    state: row.state,
    customer: row.customer,
    lines: row.lines,
    notes: row.notes,
    catalogRevision: row.catalog_revision || null,
    queuePosition: null,
    reservationGroups: [],
    allocationGroups: [],
    currentStage: null,
    resourceWait: null,
    allowedActions:
      row.state === "draft"
        ? [
            "edit", "delete",
            ...(row.catalog_revision &&
            row.customer.name?.trim() &&
            (nested ? row.service_selections.length : row.lines.length)
              ? ["publish"]
              : []),
          ]
        : [],
    observedAt: row.updated_at,
  };
  if (nested) {
    delete result.lines;
    result.serviceSelections = row.service_selections;
    result.quote = {
      status: "unavailable",
      reasonCode: "SERVICE_PRICING_NOT_CONFIGURED",
    };
  }
  return result;
}
async function find(client, scope, draftId, lock = false, includeDiscarded = false) {
  if (
    typeof draftId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
      draftId,
    )
  )
    fail("INVALID_PLAN", "Plan not found.", 404);
  const result = await client.query(
    `SELECT id,revision::text,state,customer,lines,notes,catalog_revision,service_selections,selection_contract_version,published_ticket_id::text,updated_at
    FROM queue_plan_drafts WHERE tenant_id=$1 AND location_id=$2 AND id=$3${lock ? " FOR UPDATE" : ""}`,
    [scope.tenantId, scope.locationId, draftId],
  );
  if (!result.rows[0]) fail("INVALID_PLAN", "Plan not found.", 404);
  if (result.rows[0].state === "discarded" && !includeDiscarded) fail("DRAFT_DELETED", "This draft was deleted.", 410);
  return result.rows[0];
}
// The caller owns the authorized location-first transaction, including replay.
async function command(
  client,
  scope,
  { operationKey, action, draftId = null, body },
) {
  if (
    typeof operationKey !== "string" ||
    !/^[\x21-\x7e]{1,120}$/u.test(operationKey)
  )
    fail("INVALID_PLAN", "Idempotency-Key is required.", 400);
  if (!["create", "update"].includes(action))
    fail("INVALID_PLAN", "Unsupported draft command.", 400);
  let data = validateDraft(body);
  const hash = createHash("sha256")
    .update(JSON.stringify(canonical({ action, draftId, body })))
    .digest("hex");
  const args = [
    scope.tenantId,
    scope.locationId,
    scope.actorUserId,
    operationKey,
  ];
  const prior = await client.query(
    `SELECT payload_hash,result FROM queue_plan_command_receipts
    WHERE tenant_id=$1 AND location_id=$2 AND actor_user_id=$3 AND operation_key=$4`,
    args,
  );
  if (prior.rows[0]) {
    if (prior.rows[0].payload_hash !== hash)
      fail(
        "IDEMPOTENCY_CONFLICT",
        "This key was already used for a different command.",
      );
    const original = prior.rows[0].result;
    if (original.plan?.id) {
      const current = await find(client, scope, original.plan.id);
      if(current.state!=="draft") fail("PLAN_LOCKED","This draft has been published. Refresh its authoritative request.");
    }
    return original;
  }
  let oldRevision = null;
  let oldSnapshot = null;
  let row;
  if (action === "create") {
    const result = await client.query(
      `INSERT INTO queue_plan_drafts(id,tenant_id,location_id,created_by_user_id,customer,lines,notes,catalog_revision,service_selections,selection_contract_version)
      VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9::jsonb,$10) RETURNING *,revision::text`,
      [
        randomUUID(),
        scope.tenantId,
        scope.locationId,
        scope.actorUserId,
        JSON.stringify(data.customer),
        JSON.stringify(data.lines),
        data.notes,
        data.catalogRevision,
        data.serviceSelections ? JSON.stringify(data.serviceSelections) : null,
        data.selectionContractVersion,
      ],
    );
    row = result.rows[0];
  } else {
    row = await find(client, scope, draftId, true);
    if (row.state !== "draft")
      fail("PLAN_LOCKED", "Only an unpublished draft may be saved.");
    if (
      body.contractVersion !== undefined &&
      body.contractVersion !==
        (row.selection_contract_version ||
          (Array.isArray(row.service_selections) ? 3 : 2))
    )
      fail(
        "PLAN_LOCKED",
        "Create a new request to use a different input contract.",
      );
    if (
      typeof body.expectedPlanRevision !== "string" ||
      body.expectedPlanRevision !== row.revision
    )
      fail("STALE_REVISION", "The plan changed. Reload before saving.");
    oldRevision = row.revision;
    oldSnapshot = dto(row);
    data = validateDraft({
      customer: row.customer,
      ...(Array.isArray(row.service_selections)
        ? { serviceSelections: row.service_selections }
        : { lines: row.lines }),
      notes: row.notes,
      catalogRevision: row.catalog_revision,
      ...(row.selection_contract_version === 4 ? { contractVersion: 4 } : {}),
      ...body,
    });
    const result = await client.query(
      `UPDATE queue_plan_drafts SET revision=revision+1,customer=$4::jsonb,lines=$5::jsonb,notes=$6,catalog_revision=$7,service_selections=$8::jsonb,updated_at=clock_timestamp()
      WHERE tenant_id=$1 AND location_id=$2 AND id=$3 RETURNING *,revision::text`,
      [
        scope.tenantId,
        scope.locationId,
        draftId,
        JSON.stringify(data.customer),
        JSON.stringify(data.lines),
        data.notes,
        data.catalogRevision,
        data.serviceSelections ? JSON.stringify(data.serviceSelections) : null,
      ],
    );
    row = result.rows[0];
  }
  const result = { plan: dto(row) };
  await client.query(
    `INSERT INTO queue_plan_events(tenant_id,location_id,actor_user_id,draft_id,event_type,old_revision,new_revision,snapshot,actor_role,old_snapshot)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10::jsonb)`,
    [
      ...args.slice(0, 3),
      row.id,
      `draft_${action}`,
      oldRevision,
      row.revision,
      JSON.stringify(result.plan),
      scope.actorRole,
      oldSnapshot ? JSON.stringify(oldSnapshot) : null,
    ],
  );
  await client.query(
    `INSERT INTO queue_plan_command_receipts(tenant_id,location_id,actor_user_id,operation_key,payload_hash,result)
    VALUES($1,$2,$3,$4,$5,$6::jsonb)`,
    [...args, hash, JSON.stringify(result)],
  );
  return result;
}
async function list(client, scope, cursor = null, state = "draft") {
  if (!["draft", "active", "skipped"].includes(state))
    fail("INVALID_PLAN", "Unsupported plan list state.", 400);
  let after = null;
  if (cursor != null) {
    if (
      typeof cursor !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
        cursor,
      )
    )
      fail("INVALID_PLAN", "Invalid plan cursor.", 400);
    const result = await client.query(
      `SELECT created_at,id FROM queue_plan_drafts WHERE tenant_id=$1 AND location_id=$2 AND id=$3`,
      [scope.tenantId, scope.locationId, cursor],
    );
    after = result.rows[0];
    if (!after) fail("INVALID_PLAN", "Invalid plan cursor.", 400);
  }
  const result = await client.query(
    `SELECT id,revision::text,state,customer,lines,notes,catalog_revision,service_selections,selection_contract_version,published_ticket_id::text,updated_at
    FROM queue_plan_drafts WHERE tenant_id=$1 AND location_id=$2 AND
      (($4='draft' AND state='draft') OR($4='active' AND state='published' AND EXISTS(SELECT 1 FROM tickets t
        WHERE t.id=queue_plan_drafts.published_ticket_id AND t.tenant_id=$1 AND t.location_id=$2
          AND t.status<>'skipped' AND(t.status IN('waiting','called') OR(t.service_started_at IS NOT NULL AND t.service_ended_at IS NULL))))
      OR($4='skipped' AND state='published' AND EXISTS(SELECT 1 FROM tickets t WHERE t.id=queue_plan_drafts.published_ticket_id AND t.tenant_id=$1 AND t.location_id=$2 AND t.status='skipped')))
      AND ($3::uuid IS NULL OR (created_at,id)>(SELECT created_at,id FROM queue_plan_drafts
        WHERE tenant_id=$1 AND location_id=$2 AND id=$3)) ORDER BY created_at,id LIMIT 51`,
    [scope.tenantId, scope.locationId, after?.id || null, state],
  );
  const rows = result.rows.slice(0, 50);
  return {
    plans: rows.map(dto),
    nextCursor: result.rows.length > 50 ? rows.at(-1).id : null,
  };
}
async function remove(client, scope, {draftId,operationKey,body}) {
  if(typeof operationKey!=="string"||!/^[\x21-\x7e]{1,120}$/u.test(operationKey)) fail("INVALID_PLAN","Idempotency-Key is required.",400);
  if(!body||typeof body!=="object"||Array.isArray(body)||Object.keys(body).some(k=>k!=="expectedPlanRevision")||typeof body.expectedPlanRevision!=="string"||!/^[1-9]\d{0,18}$/u.test(body.expectedPlanRevision)) fail("INVALID_PLAN","Expected draft revision is required.",400);
  const args=[scope.tenantId,scope.locationId,scope.actorUserId,operationKey];
  const hash=createHash("sha256").update(JSON.stringify(canonical({action:"delete",draftId,body}))).digest("hex");
  const receipt=(await client.query('SELECT payload_hash,result FROM queue_plan_command_receipts WHERE tenant_id=$1 AND location_id=$2 AND actor_user_id=$3 AND operation_key=$4',args)).rows[0];
  if(receipt){if(receipt.payload_hash!==hash)fail("IDEMPOTENCY_CONFLICT","This key was already used for a different command.");return {...receipt.result,replayed:true};}
  const row=await find(client,scope,draftId,true,true);
  if(row.state==="discarded")fail("DRAFT_DELETED","This draft was deleted.",410);
  if(row.state!=="draft"||row.published_ticket_id||(await client.query('SELECT 1 FROM queue_plan_versions WHERE tenant_id=$1 AND location_id=$2 AND draft_id=$3 LIMIT 1',[scope.tenantId,scope.locationId,draftId])).rows.length)fail("PLAN_LOCKED","Only an unpublished draft without execution history may be deleted.");
  if(body.expectedPlanRevision!==row.revision)fail("STALE_REVISION","The draft changed. Reload before deleting.");
  const oldSnapshot=dto(row);
  const updated=(await client.query("UPDATE queue_plan_drafts SET state='discarded',revision=revision+1,updated_at=clock_timestamp() WHERE tenant_id=$1 AND location_id=$2 AND id=$3 RETURNING revision::text",[scope.tenantId,scope.locationId,draftId])).rows[0];
  const result={deletedDraft:{id:draftId,planRevision:updated.revision,state:"discarded"}};
  await client.query("INSERT INTO queue_plan_events(tenant_id,location_id,actor_user_id,draft_id,event_type,old_revision,new_revision,snapshot,actor_role,old_snapshot) VALUES($1,$2,$3,$4,'draft_delete',$5,$6,$7::jsonb,$8,$9::jsonb)",[...args.slice(0,3),draftId,row.revision,updated.revision,JSON.stringify({...oldSnapshot,state:"discarded",planRevision:updated.revision,allowedActions:[]}),scope.actorRole,JSON.stringify(oldSnapshot)]);
  await client.query('INSERT INTO queue_plan_command_receipts(tenant_id,location_id,actor_user_id,operation_key,payload_hash,result) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[...args,hash,JSON.stringify(result)]);
  return result;
}
module.exports = { command, remove, find, list, dto, validateDraft };
