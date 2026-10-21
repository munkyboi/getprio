const { createHash } = require("node:crypto");
const workflows = require("./queueWorkflowService");

function fail(code, message, statusCode = 400) {
  throw Object.assign(new Error(message), { code, statusCode });
}
const logicalId = (value) =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,80}$/u.test(value);
const serviceId = (value) =>
  typeof value === "string" &&
  /^[1-9]\d{0,18}$/u.test(value) &&
  BigInt(value) <= 9223372036854775807n;
const memberId = (value) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
    value,
  );
const quote = () => ({
  status: "unavailable",
  reasonCode: "SERVICE_PRICING_NOT_CONFIGURED",
});
function keys(value, allowed) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).every((key) => allowed.includes(key))
  );
}

function validateSelections(selections, { complete = false, allowNamedExtrasV1 = false } = {}) {
  if (
    !Array.isArray(selections) ||
    selections.length > 20 ||
    (complete && !selections.length)
  )
    fail("INVALID_SELECTION_PLAN", "Select at most twenty catalog services.");
  const seen = new Set();
  let children = 0;
  function identify(value) {
    if (!logicalId(value) || seen.has(value))
      fail(
        "INVALID_SELECTION_PLAN",
        "Selection identities must be stable and unique.",
      );
    seen.add(value);
  }
  function number(value, min, max) {
    return value == null
      ? !complete
      : Number.isInteger(value) && value >= min && value <= max;
  }
  for (const service of selections) {
    if (
      !keys(service, ["serviceSelectionId", "serviceId", "resources"]) ||
      (service.serviceId == null ? complete : !serviceId(service.serviceId)) ||
      !Array.isArray(service.resources) ||
      service.resources.length > 100 ||
      (complete && !service.resources.length)
    )
      fail(
        "INVALID_SELECTION_PLAN",
        "Each service needs a valid selection identity and resource selections.",
      );
    identify(service.serviceSelectionId);
    for (const resource of service.resources) {
      if (
        !keys(resource, [
          "resourceSelectionId",
          "resourceMemberId",
          "quantity",
          "durationMinutes",
          "extras",
        ]) ||
        (resource.resourceMemberId != null &&
          !memberId(resource.resourceMemberId)) ||
        !number(resource.quantity, 1, 100) ||
        !number(resource.durationMinutes, 5, 480) ||
        !Array.isArray(resource.extras) ||
        resource.extras.length > (allowNamedExtrasV1 ? 100 : 20)
      )
        fail(
          "INVALID_SELECTION_PLAN",
          "Each resource needs valid duration, quantity and nested extras.",
        );
      identify(resource.resourceSelectionId);
      children++;
      for (const extra of resource.extras) {
        if (
          !keys(extra, [
            "extraSelectionId",
            "serviceId",
            "quantity",
            "durationMinutes",
            ...(allowNamedExtrasV1 ? ["resourceMemberId"] : []),
          ]) ||
          (extra.resourceMemberId != null && (!allowNamedExtrasV1 || !memberId(extra.resourceMemberId))) ||
          (extra.serviceId == null ? complete : !serviceId(extra.serviceId)) ||
          !number(extra.quantity, 1, 100) ||
          !number(extra.durationMinutes, 5, 480)
        )
          fail(
            "INVALID_SELECTION_PLAN",
            "Each extra needs its own identity, quantity and duration.",
          );
        identify(extra.extraSelectionId);
        children++;
        if (
          resource.durationMinutes != null &&
          extra.durationMinutes != null &&
          extra.durationMinutes > resource.durationMinutes
        )
          fail(
            "EXTRA_DURATION_EXCEEDS_PARENT",
            "An extra cannot outlast its parent resource. Correct the duration or explicitly remove the extra.",
          );
      }
      if (children > 100)
        fail(
          "INVALID_SELECTION_PLAN",
          "A plan supports at most one hundred resource and extra children.",
        );
    }
  }
  return selections;
}

async function catalogData(client, scope) {
  const services = (
    await client.query(
      `SELECT s.id::text,s.name,s.updated_at::text AS service_revision,l.is_active AS offered,
    r.pool_id::text,r.units_required,r.revision AS requirement_revision,p.name AS pool_name,p.capacity,p.revision AS pool_revision,(p.tracking_enabled AND (to_jsonb(p)->>'archived_at') IS NULL) AS tracking_enabled,
    q.revision::text AS policy_revision,q.selection_mode,q.duration_options,q.extra_service_ids,to_jsonb(q)->'configuration' AS configuration
    FROM vendor_services s JOIN location_services l ON(l.service_id,l.tenant_id)=(s.id,s.tenant_id)
    LEFT JOIN service_resource_requirements r ON(r.service_id,r.tenant_id,r.location_id)=(s.id,s.tenant_id,l.location_id)
    LEFT JOIN location_resource_pools p ON(p.id,p.tenant_id,p.location_id)=(r.pool_id,r.tenant_id,r.location_id)
    LEFT JOIN queue_service_policies q ON(q.service_id,q.tenant_id,q.location_id)=(s.id,s.tenant_id,l.location_id)
    WHERE s.tenant_id=$1 AND l.location_id=$2 AND s.is_active=TRUE AND l.is_active=TRUE ORDER BY s.id`,
      [scope.tenantId, scope.locationId],
    )
  ).rows;
  const members = (
    await client.query(
      "SELECT id,pool_id::text,name,revision::text,display_order,is_active,to_jsonb(resource_pool_members)->>'archived_at' AS archived_at FROM resource_pool_members WHERE tenant_id=$1 AND location_id=$2 ORDER BY pool_id,display_order,id",
      [scope.tenantId, scope.locationId],
    )
  ).rows;
  const workflow = await workflows.read(client, scope);
  const observedAt = (
    await client.query("SELECT clock_timestamp() AS observed_at")
  ).rows[0].observed_at;
  return {
    services,
    members,
    workflow,
    observedAt,
    catalogRevision: createHash("sha256")
      .update(JSON.stringify({ services, members, workflow }))
      .digest("hex"),
  };
}
async function readCatalog(client, scope) {
  const data = await catalogData(client, scope);
  const pools = (
    await client.query(
      `SELECT p.id::text,GREATEST(0,p.capacity-
    COALESCE((SELECT sum(a.units) FROM resource_allocations a WHERE a.tenant_id=p.tenant_id AND a.location_id=p.location_id AND a.pool_id=p.id AND a.released_at IS NULL),0)-
    COALESCE((SELECT sum(r.units) FROM resource_ledger_reservations r WHERE r.tenant_id=p.tenant_id AND r.location_id=p.location_id AND r.pool_id=p.id AND r.state='protected' AND r.starts_at<=clock_timestamp() AND r.ends_at>clock_timestamp()),0))::int AS available_units
    FROM location_resource_pools p WHERE p.tenant_id=$1 AND p.location_id=$2`,
      [scope.tenantId, scope.locationId],
    )
  ).rows;
  const availability = (poolId) => ({
    availableUnits:
      pools.find((pool) => pool.id === poolId)?.available_units ?? null,
    provisional: true,
    observedAt: data.observedAt,
  });
  const states = (
    await client.query(
      `SELECT m.id,
    CASE WHEN EXISTS(SELECT 1 FROM resource_allocations a WHERE a.tenant_id=m.tenant_id AND a.location_id=m.location_id AND a.pool_id=m.pool_id AND a.resource_member_id IS NULL AND a.released_at IS NULL)
      OR EXISTS(SELECT 1 FROM resource_ledger_reservations r WHERE r.tenant_id=m.tenant_id AND r.location_id=m.location_id AND r.pool_id=m.pool_id AND r.resource_member_id IS NULL AND r.state='protected') THEN 'unknown'
      WHEN EXISTS(SELECT 1 FROM resource_allocations a WHERE a.resource_member_id=m.id AND a.released_at IS NULL) THEN 'occupied'
      WHEN EXISTS(SELECT 1 FROM resource_ledger_reservations r WHERE r.resource_member_id=m.id AND r.state='protected') THEN 'protected'
      ELSE 'provisional_free' END AS availability
    FROM resource_pool_members m WHERE m.tenant_id=$1 AND m.location_id=$2`,
      [scope.tenantId, scope.locationId],
    )
  ).rows;
  const byId = new Map(data.services.map((service) => [service.id, service]));
  return {
    contractVersion: 3,
    catalogRevision: data.catalogRevision,
    observedAt: data.observedAt,
    workflow: data.workflow,
    capabilities: { publication: true, childOutcomes: true },
    quote: quote(),
    extraScheduling: "same_start_within_parent",
    services: data.services
      .filter((service) => service.policy_revision)
      .map((service) => ({
        id: service.id,
        name: service.name,
        serviceRevision: service.service_revision,
        policyRevision: service.policy_revision,
        selectionMode: service.selection_mode,
        durationOptionsMinutes: service.duration_options,
        resourceReady: Boolean(service.pool_id && service.tracking_enabled),
        availability: availability(service.pool_id),
        quote: quote(),
        resourceMembers:
          service.selection_mode === "named"
            ? data.members
                .filter((member) => member.pool_id === service.pool_id)
                .map((member) => ({
                  id: member.id,
                  name: member.name,
                  revision: member.revision,
                  displayOrder: Number(member.display_order),
                  isActive: member.is_active,
                  archivedAt: member.archived_at || null,
                  availability: {
                    state: member.archived_at ? "archived" : member.is_active
                      ? states.find((state) => state.id === member.id)
                          ?.availability || "unknown"
                      : "inactive",
                    provisional: true,
                    observedAt: data.observedAt,
                  },
                }))
            : [],
        extras: service.extra_service_ids
          .map((id) => byId.get(id))
          .filter(
            (extra) =>
              extra?.policy_revision && extra.selection_mode === "pooled",
          )
          .map((extra) => ({
            serviceId: extra.id,
            name: extra.name,
            policyRevision: extra.policy_revision,
            durationOptionsMinutes: extra.duration_options,
            quantityMin: 1,
            quantityMax:
              extra.pool_id && extra.units_required
                ? Math.min(
                    100,
                    Math.floor(extra.capacity / extra.units_required),
                  )
                : 0,
            resourceReady: Boolean(extra.pool_id && extra.tracking_enabled),
            availability: availability(extra.pool_id),
            quote: quote(),
          })),
      })),
  };
}
function demand(service, quantity) {
  const totalUnits = service.units_required * quantity;
  if (
    !service.pool_id ||
    !service.tracking_enabled ||
    !Number.isInteger(totalUnits) ||
    totalUnits < 1 ||
    totalUnits > 100 ||
    totalUnits > service.capacity
  )
    fail(
      "RESOURCE_CONFIGURATION_REQUIRED",
      "This selection needs a ready resource mapping with sufficient configured capacity.",
    );
  return {
    known: true,
    poolId: service.pool_id,
    poolName: service.pool_name,
    unitsRequired: service.units_required,
    totalUnits,
    poolRevision: service.pool_revision,
    requirementRevision: service.requirement_revision,
  };
}
async function capture(
  client,
  scope,
  selections,
  expectedCatalogRevision,
  { workflowOverride, allowConfiguredV4 = false, allowNamedExtrasV1 = false } = {},
) {
  validateSelections(selections, { complete: true, allowNamedExtrasV1 });
  const data = await catalogData(client, scope);
  if (
    typeof expectedCatalogRevision !== "string" ||
    data.catalogRevision !== expectedCatalogRevision
  )
    fail(
      "CATALOG_ACCEPTANCE_REQUIRED",
      "Review and accept the current named-resource catalog before publication.",
      409,
    );
  const workflow = workflowOverride || data.workflow;
  const byId = new Map(data.services.map((service) => [service.id, service]));
  const captured = [],
    items = [];
  for (const selected of selections) {
    const service = byId.get(selected.serviceId);
    if (!service?.policy_revision)
      fail(
        "SERVICE_POLICY_REQUIRED",
        "A selected service is inactive, unavailable at this branch, or lacks an explicit queue policy.",
      );
    if (service.configuration && !allowConfiguredV4)
      fail(
        "USE_SERVICE_SELECTION_V4",
        "Review the explicit duration-count policy using contract version 4.",
        409,
      );
    const parent = {
      serviceSelectionId: selected.serviceSelectionId,
      serviceId: service.id,
      serviceName: service.name,
      serviceRevision: service.service_revision,
      policyRevision: service.policy_revision,
      resources: [],
      quote: quote(),
    };
    for (const selection of selected.resources) {
      if (!service.duration_options.includes(selection.durationMinutes))
        fail(
          "INVALID_DURATION_OPTION",
          "Select a duration explicitly permitted by this service’s queue policy.",
        );
      const member = selection.resourceMemberId
        ? data.members.find(
            (candidate) =>
              candidate.id === selection.resourceMemberId &&
              candidate.pool_id === service.pool_id &&
              candidate.is_active && !candidate.archived_at,
          )
        : null;
      if (
        service.selection_mode === "named" &&
        (!member || selection.quantity !== 1 || service.units_required !== 1)
      )
        fail(
          "NAMED_RESOURCE_REQUIRED",
          "Choose one active named member for this resource selection.",
        );
      if (service.selection_mode === "pooled" && selection.resourceMemberId)
        fail(
          "INVALID_SELECTION_PLAN",
          "A pooled selection cannot claim a named member.",
        );
      const resource = {
        resourceSelectionId: selection.resourceSelectionId,
        serviceSelectionId: selected.serviceSelectionId,
        resourceMemberId: member?.id || null,
        resourceMemberName: member?.name || null,
        resourceMemberRevision: member?.revision || null,
        quantity: selection.quantity,
        durationMinutes: selection.durationMinutes,
        policyRevision: service.policy_revision,
        extras: [],
        quote: quote(),
      };
      items.push({
        lineId: selection.resourceSelectionId,
        lineRevision: "1",
        selectionId: selection.resourceSelectionId,
        selectionKind: "resource",
        serviceSelectionId: selected.serviceSelectionId,
        parentResourceSelectionId: null,
        serviceId: service.id,
        serviceName: service.name,
        serviceRevision: service.service_revision,
        policyRevision: service.policy_revision,
        resourceMemberId: member?.id || null,
        resourceMemberName: member?.name || null,
        resourceMemberRevision: member?.revision || null,
        quantity: selection.quantity,
        durationMinutes: selection.durationMinutes,
        executionMode: "parallel",
        resource: demand(service, selection.quantity),
        quote: quote(),
      });
      for (const extraSelection of selection.extras) {
        const extra = byId.get(extraSelection.serviceId);
        if (extra?.configuration && !allowConfiguredV4)
          fail(
            "USE_SERVICE_SELECTION_V4",
            "Review the extra duration-count policy using contract version 4.",
            409,
          );
        if (
          !service.extra_service_ids.includes(extraSelection.serviceId) ||
          !extra?.policy_revision ||
          (extra.selection_mode !== "pooled" && !(allowNamedExtrasV1 && extra.selection_mode === "named"))
        )
          fail(
            "EXTRA_NOT_ELIGIBLE",
            "This extra is not explicitly eligible for the selected parent service.",
          );
        if (!extra.duration_options.includes(extraSelection.durationMinutes))
          fail(
            "INVALID_DURATION_OPTION",
            "Select a duration explicitly permitted for this extra.",
          );
        const extraMember = extraSelection.resourceMemberId ? data.members.find(candidate=>candidate.id===extraSelection.resourceMemberId && candidate.pool_id===extra.pool_id && candidate.is_active && !candidate.archived_at) : null;
        if(extra.selection_mode === "named" && (!allowNamedExtrasV1 || !extraMember || extraSelection.quantity!==1 || extra.units_required!==1)) fail("NAMED_EXTRA_MEMBER_UNAVAILABLE","Select current enabled, non-archived named members from this extra’s own pool.");
        if(extra.selection_mode === "pooled" && extraSelection.resourceMemberId) fail("EXTRA_ASSIGNMENT_MISMATCH","Automatic extras cannot claim a named member.");
        if (member && extra.pool_id === service.pool_id && !extraMember)
          fail(
            "EXTRA_RESOURCE_CONFLICT",
            "An extra cannot duplicate its parent named resource demand.",
          );
        const extraSnapshot = {
          extraSelectionId: extraSelection.extraSelectionId,
          parentResourceSelectionId: selection.resourceSelectionId,
          serviceSelectionId: selected.serviceSelectionId,
          serviceId: extra.id,
          serviceName: extra.name,
          serviceRevision: extra.service_revision,
          policyRevision: extra.policy_revision,
          quantity: extraSelection.quantity,
          durationMinutes: extraSelection.durationMinutes,
          required: true,
          ...(extraMember ? {resourceMemberId:extraMember.id,resourceMemberName:extraMember.name,resourceMemberRevision:extraMember.revision} : {}),
          quote: quote(),
        };
        resource.extras.push(extraSnapshot);
        items.push({
          lineId: extraSelection.extraSelectionId,
          lineRevision: "1",
          selectionId: extraSelection.extraSelectionId,
          selectionKind: "extra",
          serviceSelectionId: selected.serviceSelectionId,
          parentResourceSelectionId: selection.resourceSelectionId,
          serviceId: extra.id,
          serviceName: extra.name,
          serviceRevision: extra.service_revision,
          policyRevision: extra.policy_revision,
          resourceMemberId: extraMember?.id || null,
          ...(extraMember ? {resourceMemberName:extraMember.name,resourceMemberRevision:extraMember.revision} : {}),
          quantity: extraSelection.quantity,
          durationMinutes: extraSelection.durationMinutes,
          executionMode: "parallel",
          resource: demand(extra, extraSelection.quantity),
          quote: quote(),
        });
      }
      parent.resources.push(resource);
    }
    captured.push(parent);
  }
  const requiredStages = [];
  if (workflow.mode === "linear")
    requiredStages.push({
      stageId: null,
      serviceSelectionIds: captured.map(
        (service) => service.serviceSelectionId,
      ),
    });
  else
    for (const stage of workflow.stages) {
      const roots = captured.filter((service) =>
        stage.serviceIds.includes(service.serviceId),
      );
      if (roots.length)
        requiredStages.push({
          ...stage,
          serviceSelectionIds: roots.map(
            (service) => service.serviceSelectionId,
          ),
        });
    }
  if (
    captured.some(
      (service) =>
        requiredStages.filter((stage) =>
          stage.serviceSelectionIds.includes(service.serviceSelectionId),
        ).length !== 1,
    )
  )
    fail(
      "WORKFLOW_SERVICE_UNASSIGNED",
      "Each selected catalog service needs one unambiguous workflow stage.",
    );
  for (const stage of requiredStages) {
    const leaves = items.filter((item) =>
      stage.serviceSelectionIds.includes(item.serviceSelectionId),
    );
    const named = leaves
      .filter((item) => item.resourceMemberId)
      .map((item) => item.resourceMemberId);
    if (new Set(named).size !== named.length)
      fail(
        "NAMED_RESOURCE_DUPLICATE",
        "A named member cannot be selected twice for the same simultaneous stage.",
      );
    for (const leaf of leaves) {
      if (leaf.resourceMemberId && leaves.some(other => other.resource.poolId === leaf.resource.poolId && !other.resourceMemberId))
        fail("EXTRA_RESOURCE_CONFLICT", "Anonymous and named demand cannot prove distinct physical members in the same simultaneous pool.");
    }
    const totals = new Map();
    for (const leaf of leaves)
      totals.set(
        leaf.resource.poolId,
        (totals.get(leaf.resource.poolId) || 0) + leaf.resource.totalUnits,
      );
    for (const [poolId, units] of totals)
      if (
        units >
        data.services.find((service) => service.pool_id === poolId).capacity
      )
        fail(
          "RESOURCE_CAPACITY_EXCEEDED",
          "Combined required children exceed configured pool capacity.",
        );
    for (const leaf of leaves) leaf.stageId = stage.stageId;
  }
  return {
    contractVersion: 3,
    serviceSelections: captured,
    items,
    requiredStages,
    workflow,
    catalogRevision: data.catalogRevision,
    quote: quote(),
    extraScheduling: "same_start_within_parent",
  };
}
module.exports = { validateSelections, readCatalog, capture };
