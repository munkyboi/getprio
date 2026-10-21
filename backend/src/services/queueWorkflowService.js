const { createHash } = require("node:crypto");
const db = require("../config/db");
const {
  withVendorQueueTransaction,
} = require("./vendorQueueTransactionService");
const { assertPublicTextFieldsAllowed } = require("./contentModeration");
const uuid = (value) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
    value,
  );
const id = (value) =>
  typeof value === "string" &&
  /^[1-9]\d{0,18}$/u.test(value) &&
  BigInt(value) <= 9223372036854775807n;
function fail(code, message, statusCode = 409) {
  throw Object.assign(new Error(message), { code, statusCode });
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}
async function read(client, scope, { initialize = false } = {}) {
  if (initialize) {
    await client.query(
      `INSERT INTO queue_workflow_versions(tenant_id,location_id,revision,mode,stations,stages,actor_role)
   VALUES($1,$2,1,'linear','[]','[]','system_default') ON CONFLICT DO NOTHING`,
      [scope.tenantId, scope.locationId],
    );
    await client.query(
      "INSERT INTO queue_workflow_configurations(tenant_id,location_id,revision) VALUES($1,$2,1) ON CONFLICT DO NOTHING",
      [scope.tenantId, scope.locationId],
    );
  }
  const row = (
    await client.query(
      `SELECT v.revision::text,v.mode,v.stations,v.stages FROM queue_workflow_configurations h
  JOIN queue_workflow_versions v ON(v.tenant_id,v.location_id,v.revision)=(h.tenant_id,h.location_id,h.revision)
  WHERE h.tenant_id=$1 AND h.location_id=$2`,
      [scope.tenantId, scope.locationId],
    )
  ).rows[0];
  return row
    ? {
        configurationRevision: row.revision,
        mode: row.mode,
        stations: row.stations,
        stages: row.stages,
      }
    : { configurationRevision: "1", mode: "linear", stations: [], stages: [] };
}
async function readVersion(client, scope, revision) {
  const row = (
    await client.query(
      "SELECT revision::text,mode,stations,stages FROM queue_workflow_versions WHERE tenant_id=$1 AND location_id=$2 AND revision=$3",
      [scope.tenantId, scope.locationId, revision],
    )
  ).rows[0];
  if (!row)
    fail("INVALID_STATE", "The published workflow configuration is missing.");
  return {
    configurationRevision: row.revision,
    mode: row.mode,
    stations: row.stations,
    stages: row.stages,
  };
}
function validate(body) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some(
      (key) =>
        ![
          "expectedConfigurationRevision",
          "mode",
          "stations",
          "stages",
        ].includes(key),
    ) ||
    typeof body.expectedConfigurationRevision !== "string" ||
    !["linear", "multi_station"].includes(body.mode) ||
    !Array.isArray(body.stations) ||
    body.stations.length > 20 ||
    !Array.isArray(body.stages) ||
    body.stages.length > 20
  )
    fail(
      "INVALID_WORKFLOW",
      "Provide the current version, workflow mode, stations and ordered stages.",
      400,
    );
  const stationIds = new Set(),
    stageIds = new Set(),
    services = new Set();
  for (const station of body.stations) {
    if (
      !station ||
      Object.keys(station).some(
        (key) => !["stationId", "name", "serviceCounterIds"].includes(key),
      ) ||
      !uuid(station.stationId) ||
      stationIds.has(station.stationId) ||
      typeof station.name !== "string" ||
      !station.name.trim() ||
      station.name.length > 120 ||
      !Array.isArray(station.serviceCounterIds) ||
      !station.serviceCounterIds.length ||
      station.serviceCounterIds.length > 50 ||
      station.serviceCounterIds.some((counter) => !id(counter)) ||
      new Set(station.serviceCounterIds).size !==
        station.serviceCounterIds.length
    )
      fail(
        "INVALID_WORKFLOW",
        "Each unique station needs a name and permitted counter lanes.",
        400,
      );
    assertPublicTextFieldsAllowed({ "Station name": station.name });
    stationIds.add(station.stationId);
  }
  for (const stage of body.stages) {
    if (
      !stage ||
      Object.keys(stage).some(
        (key) => !["stageId", "stationId", "label", "serviceIds"].includes(key),
      ) ||
      !uuid(stage.stageId) ||
      stageIds.has(stage.stageId) ||
      !stationIds.has(stage.stationId) ||
      typeof stage.label !== "string" ||
      !stage.label.trim() ||
      stage.label.length > 120 ||
      !Array.isArray(stage.serviceIds) ||
      !stage.serviceIds.length ||
      stage.serviceIds.length > 100 ||
      stage.serviceIds.some((service) => !id(service) || services.has(service))
    )
      fail(
        "INVALID_WORKFLOW",
        "Each unique ordered stage must map offered services unambiguously to a configured station.",
        400,
      );
    if (new Set(stage.serviceIds).size !== stage.serviceIds.length)
      fail("INVALID_WORKFLOW", "A service can belong to only one stage.", 400);
    assertPublicTextFieldsAllowed({ "Stage name": stage.label });
    stageIds.add(stage.stageId);
    stage.serviceIds.forEach((service) => services.add(service));
  }
  if (body.mode === "multi_station" && !body.stages.length)
    fail(
      "INVALID_WORKFLOW",
      "Multi-station mode requires at least one ordered stage.",
      400,
    );
  return body;
}
async function get(context) {
  const { tenant, location, actorUserId } = context;
  return withVendorQueueTransaction(
    {
      pool: db.pool,
      tenant,
      location,
      actorUserId,
      permission: "tenant.location.manage",
    },
    async (client) => {
      const scope = {
        tenantId: String(tenant._id),
        locationId: String(location._id),
      };
      const workflow = await read(client, scope, { initialize: true });
      const counters = (
        await client.query(
          "SELECT id::text,name,slug FROM service_counters WHERE tenant_id=$1 AND location_id=$2 AND is_active=TRUE ORDER BY id",
          [scope.tenantId, scope.locationId],
        )
      ).rows;
      const services = (
        await client.query(
          `SELECT s.id::text,s.name FROM vendor_services s JOIN location_services l ON(l.service_id,l.tenant_id)=(s.id,s.tenant_id)
   WHERE s.tenant_id=$1 AND l.location_id=$2 AND s.is_active=TRUE AND l.is_active=TRUE ORDER BY s.id`,
          [scope.tenantId, scope.locationId],
        )
      ).rows;
      return {
        workflow,
        counters,
        services,
        appliesTo: "new_publications_only",
      };
    },
  );
}
async function put(context, body, operationKey) {
  validate(body);
  if (
    typeof operationKey !== "string" ||
    !/^[\x21-\x7e]{1,120}$/u.test(operationKey)
  )
    fail("INVALID_WORKFLOW", "Idempotency-Key is required.", 400);
  const { tenant, location, actorUserId } = context;
  const scope = {
    tenantId: String(tenant._id),
    locationId: String(location._id),
    actorUserId: String(actorUserId),
  };
  const hash = createHash("sha256")
    .update(JSON.stringify(canonical({ action: "workflow", body })))
    .digest("hex");
  return withVendorQueueTransaction(
    {
      pool: db.pool,
      tenant,
      location,
      actorUserId,
      permission: "tenant.location.manage",
    },
    async (client, _ledger, actor) => {
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
            "This key was already used for a different command.",
          );
        return receipt.result;
      }
      const current = await read(client, scope, { initialize: true });
      if (current.configurationRevision !== body.expectedConfigurationRevision)
        fail("STALE_REVISION", "The workflow changed. Reload before saving.");
      const serviceIds = body.stages.flatMap((stage) => stage.serviceIds);
      const offered = (
        await client.query(
          `SELECT s.id::text FROM vendor_services s JOIN location_services l ON(l.service_id,l.tenant_id)=(s.id,s.tenant_id)
   WHERE s.tenant_id=$1 AND l.location_id=$2 AND s.id=ANY($3::bigint[]) AND s.is_active=TRUE AND l.is_active=TRUE FOR SHARE OF s,l`,
          [scope.tenantId, scope.locationId, serviceIds],
        )
      ).rows;
      if (offered.length !== serviceIds.length)
        fail(
          "INVALID_WORKFLOW",
          "Every mapped service must be active and offered at this branch.",
          400,
        );
      for (const station of body.stations) {
        const counters = (
          await client.query(
            "SELECT id FROM service_counters WHERE tenant_id=$1 AND location_id=$2 AND id=ANY($3::bigint[]) AND is_active=TRUE FOR SHARE",
            [scope.tenantId, scope.locationId, station.serviceCounterIds],
          )
        ).rows;
        if (counters.length !== station.serviceCounterIds.length)
          fail(
            "INVALID_WORKFLOW",
            "Station counters must be active at this branch.",
            400,
          );
        const owner = (
          await client.query(
            "SELECT tenant_id::text,location_id::text FROM queue_stations WHERE id=$1 FOR UPDATE",
            [station.stationId],
          )
        ).rows[0];
        if (
          owner &&
          (owner.tenant_id !== scope.tenantId ||
            owner.location_id !== scope.locationId)
        )
          fail(
            "INVALID_WORKFLOW",
            "Station identity belongs to another scope.",
            400,
          );
        await client.query(
          `INSERT INTO queue_stations(id,tenant_id,location_id,name) VALUES($1,$2,$3,$4)
    ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,is_active=TRUE`,
          [
            station.stationId,
            scope.tenantId,
            scope.locationId,
            station.name.trim(),
          ],
        );
        await client.query(
          "DELETE FROM queue_station_counters WHERE station_id=$1",
          [station.stationId],
        );
        for (const counterId of station.serviceCounterIds)
          await client.query(
            "INSERT INTO queue_station_counters(station_id,tenant_id,location_id,counter_id) VALUES($1,$2,$3,$4)",
            [station.stationId, scope.tenantId, scope.locationId, counterId],
          );
      }
      await client.query(
        "UPDATE queue_stations SET is_active=FALSE WHERE tenant_id=$1 AND location_id=$2 AND NOT(id=ANY($3::uuid[]))",
        [
          scope.tenantId,
          scope.locationId,
          body.stations.map((s) => s.stationId),
        ],
      );
      const revision = String(BigInt(current.configurationRevision) + 1n);
      await client.query(
        `INSERT INTO queue_workflow_versions(tenant_id,location_id,revision,mode,stations,stages,actor_user_id,actor_role)
   VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8)`,
        [
          scope.tenantId,
          scope.locationId,
          revision,
          body.mode,
          JSON.stringify(body.stations),
          JSON.stringify(body.stages),
          actorUserId,
          actor.tenantMemberships[0].role,
        ],
      );
      await client.query(
        "UPDATE queue_workflow_configurations SET revision=$3 WHERE tenant_id=$1 AND location_id=$2",
        [scope.tenantId, scope.locationId, revision],
      );
      const result = {
        workflow: await read(client, scope),
        appliesTo: "new_publications_only",
      };
      await client.query(
        "INSERT INTO queue_plan_command_receipts(tenant_id,location_id,actor_user_id,operation_key,payload_hash,result) VALUES($1,$2,$3,$4,$5,$6::jsonb)",
        [...args, hash, JSON.stringify(result)],
      );
      await client.query(
        "UPDATE resource_ledger_scopes SET revision=revision+1 WHERE tenant_id=$1 AND location_id=$2",
        [scope.tenantId, scope.locationId],
      );
      return result;
    },
  );
}
module.exports = { read, readVersion, get, put, validate };
