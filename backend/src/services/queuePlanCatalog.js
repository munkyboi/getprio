const { createHash } = require("node:crypto");
function fail(message) {
  throw Object.assign(new Error(message), {
    code: "INVALID_PLAN",
    statusCode: 400,
  });
}

// Captures executable demand, never occupancy. Publication may wait for busy resources.
async function readCatalog(client, scope) {
  const rows = (
    await client.query(
      `SELECT s.id::text,s.name,s.duration_minutes,s.updated_at::text AS service_revision,s.price_display,
      r.pool_id::text,r.units_required,r.revision AS requirement_revision,p.revision AS pool_revision,p.capacity,p.name AS pool_name,(p.tracking_enabled AND (to_jsonb(p)->>'archived_at') IS NULL) AS tracking_enabled
    FROM vendor_services s JOIN location_services l ON(l.service_id,l.tenant_id)=(s.id,s.tenant_id)
    LEFT JOIN service_resource_requirements r ON(r.service_id,r.tenant_id,r.location_id)=(s.id,s.tenant_id,l.location_id)
    LEFT JOIN location_resource_pools p ON(p.id,p.tenant_id,p.location_id)=(r.pool_id,r.tenant_id,r.location_id)
    WHERE s.tenant_id=$1 AND l.location_id=$2 AND s.is_active=TRUE AND l.is_active=TRUE ORDER BY s.id`,
      [scope.tenantId, scope.locationId],
    )
  ).rows;
  const definitions=require('./queueWorkflowService');
  const definition=await definitions.read(client,scope);
  const workflow=definition.executionType&&definition.executionType!=='workflow'?await definitions.readVersion(client,scope,'1'):definition;
  return {
    catalogRevision: createHash("sha256")
      .update(JSON.stringify({ rows, workflow }))
      .digest("hex"),
    workflow,
    services: rows.map((row) => ({
      id: row.id,
      name: row.name,
      serviceRevision: row.service_revision,
      durationMinutes: row.duration_minutes,
      durationEditable: false,
      quantityMin: 1,
      quantityMax: row.units_required
        ? Math.min(100, Math.floor(row.capacity / row.units_required))
        : 100,
      resourceReady: row.tracking_enabled === true,
      resourceLabel: row.pool_name || null,
      unitsPerQuantity: row.units_required || null,
      poolId: row.pool_id || null,
      poolRevision: row.pool_revision || null,
      requirementRevision: row.requirement_revision || null,
    })),
  };
}
async function captureLines(
  client,
  scope,
  lines,
  expectedCatalogRevision,
  { allowStagePools = false, workflow } = {},
) {
  if (
    expectedCatalogRevision &&
    (await readCatalog(client, scope)).catalogRevision !==
      expectedCatalogRevision
  )
    throw Object.assign(
      new Error(
        "The service catalog changed. Review and accept the current services before publishing.",
      ),
      { code: "CATALOG_ACCEPTANCE_REQUIRED", statusCode: 409 },
    );
  if (!Array.isArray(lines) || !lines.length || lines.length > 20)
    fail("Select between one and twenty service lines.");
  const serviceIds = lines.map((line) => line.serviceId);
  if (new Set(serviceIds).size !== lines.length)
    fail("Combine quantities for the same service instead of duplicating it.");
  const services = await client.query(
    `SELECT s.id::text,s.name,s.duration_minutes,s.updated_at::text AS service_revision,
      s.price_display,q.configuration AS queue_policy_configuration,r.pool_id::text,r.units_required,r.revision AS requirement_revision,
      p.revision AS pool_revision,p.name AS pool_name,p.capacity,(p.tracking_enabled AND (to_jsonb(p)->>'archived_at') IS NULL) AS tracking_enabled
    FROM vendor_services s JOIN location_services l ON (l.service_id,l.tenant_id)=(s.id,s.tenant_id)
    LEFT JOIN service_resource_requirements r ON (r.service_id,r.tenant_id,r.location_id)=(s.id,s.tenant_id,l.location_id)
    LEFT JOIN location_resource_pools p ON (p.id,p.tenant_id,p.location_id)=(r.pool_id,r.tenant_id,r.location_id)
    LEFT JOIN queue_service_policies q ON(q.service_id,q.tenant_id,q.location_id)=(s.id,s.tenant_id,l.location_id)
    WHERE s.tenant_id=$1 AND l.location_id=$2 AND s.id=ANY($3::bigint[])
      AND s.is_active=TRUE AND l.is_active=TRUE ORDER BY s.id FOR SHARE OF s,l`,
    [scope.tenantId, scope.locationId, serviceIds],
  );
  const byId = new Map(services.rows.map((row) => [row.id, row]));
  const items = lines.map((line) => {
    const service = byId.get(line.serviceId);
    const configured=workflow?.stages?.find(stage=>stage.serviceIds.includes(line.serviceId));
    const noResource=workflow?.mode==='multi_station' && configured?.resourceRequirement?.kind==='none';
    if (!service || (!noResource && !service.tracking_enabled))
      fail(
        "Each service must be active at this branch with a ready resource pool.",
      );
    if (
      !Number.isInteger(line.quantity) ||
      line.quantity < 1 ||
      line.quantity > 100
    )
      fail(
        "Each service needs a concurrent quantity between one and one hundred.",
      );
    if (
      line.durationMinutes != null &&
      line.durationMinutes !== service.duration_minutes
    )
      fail(
        "Service duration must match the current catalog duration. Reload the service options.",
      );
    if(workflow?.mode==='multi_station'&&!noResource&&service.queue_policy_configuration?.assignment?.mode==='named')throw Object.assign(new Error('Workflow resource stages support pooled capacity only. Use Resource Queue for named resource selection.'),{statusCode:409,code:'WORKFLOW_NAMED_ASSIGNMENT_UNSUPPORTED'});
    const units = noResource ? 0 : service.units_required * line.quantity;
    if (!noResource && (units > 100 || units > service.capacity))
      fail("Requested concurrent units exceed configured pool capacity.");
    return {
      lineId: line.lineId,
      lineRevision: "1",
      serviceId: service.id,
      serviceName: service.name,
      serviceRevision: service.service_revision,
      quantity: line.quantity,
      durationMinutes: service.duration_minutes,
      executionMode: "parallel",
      priceDisplay: service.price_display,
      resource: noResource ? {known:false,reason:"workflow_stage_without_resource"} : {
        known: true,
        poolId: service.pool_id,
        poolName: service.pool_name,
        unitsRequired: service.units_required,
        totalUnits: units,
        poolRevision: service.pool_revision,
        requirementRevision: service.requirement_revision,
      },
    };
  });
  const poolIds = new Set(items.map((item) => item.resource.poolId));
  if (!allowStagePools) {
    if (poolIds.size !== 1)
      fail("This beta requires parallel services from the same resource pool.");
    if (
      items.reduce((sum, item) => sum + item.resource.totalUnits, 0) >
      services.rows[0].capacity
    )
      fail("Combined concurrent demand exceeds pool capacity.");
  }
  return items;
}
async function assignStages(client, scope, workflow, items) {
  if (workflow.mode === "linear") return null;
  const stages = [];
  for (const configured of workflow.stages) {
    const selected = items.filter((item) =>
      configured.serviceIds.includes(item.serviceId),
    );
    if (!selected.length) fail("Choose a service for every required workflow stage.");
    const station = workflow.stations.find(
      (candidate) => candidate.stationId === configured.stationId,
    );
    if (!station) fail("Configured station is unavailable.");
    for (const item of selected) item.stageId = configured.stageId;
    if(configured.resourceRequirement?.kind==='none') {
      if(selected.some(item=>item.resource.known))fail('A no-resource stage cannot capture pool demand.');
      stages.push({...configured,station});continue;
    }
    if(selected.some(item=>!item.resource.known))fail('Resource stages require configured pool demand.');
    if (new Set(selected.map((item) => item.resource.poolId)).size !== 1)
      fail("Each station stage must use parallel lines from the same pool.");
    const capacity = (
      await client.query(
        "SELECT capacity FROM location_resource_pools WHERE tenant_id=$1 AND location_id=$2 AND id=$3",
        [scope.tenantId, scope.locationId, selected[0].resource.poolId],
      )
    ).rows[0]?.capacity;
    if (
      selected.reduce((sum, item) => sum + item.resource.totalUnits, 0) >
      capacity
    )
      fail("Combined current-stage demand exceeds pool capacity.");
    stages.push({ ...configured, station });
  }
  if (!stages.length || items.some((item) => !item.stageId))
    fail(
      "Every selected service must be assigned unambiguously to a configured workflow stage.",
    );
  return stages;
}
module.exports = { captureLines, readCatalog, assignStages };
