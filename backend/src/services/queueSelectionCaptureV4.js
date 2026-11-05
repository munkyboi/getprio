const serviceHours = require("./queueServiceHoursService");
const { createHash } = require("node:crypto");
const legacy = require("./queueSelectionCapture");
const policy = require("./queueServicePolicyV4");
function fail(code, message, statusCode = 400) {
  throw Object.assign(new Error(message), { code, statusCode });
}

// Structural draft validation is inert and retains incomplete values. Policy
// acceptance and derived duration belong to publication/amendment only.
function validateSelections(input, { complete = false } = {}) {
  if (!Array.isArray(input))
    fail("INVALID_SELECTION_PLAN", "Service selections must be a list.");
  function leaf(value, fields) {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.keys(value).some((key) => !fields.includes(key))
    )
      fail(
        "INVALID_SELECTION_PLAN",
        "Duration-count selections contain unsupported fields.",
      );
    if (
      value.durationCount == null
        ? complete
        : !Number.isSafeInteger(value.durationCount) ||
          value.durationCount < 1 ||
          value.durationCount > 96
    )
      fail(
        "INVALID_DURATION_COUNT",
        "Provide a positive integer duration count.",
      );
    if (
      value.durationPolicyRevision == null
        ? complete
        : typeof value.durationPolicyRevision !== "string" ||
          !/^[1-9]\d{0,18}$/u.test(value.durationPolicyRevision)
    )
      fail(
        "STALE_DURATION_POLICY",
        "Review the explicit duration policy revision.",
      );
    const rest = { ...value };
    delete rest.durationCount;
    delete rest.durationPolicyRevision;
    return { ...rest, durationMinutes: value.durationCount == null ? null : 5 };
  }
  const rootServices = new Set();
  const normalized = input.map((service) => {
    if (
      !service ||
      typeof service !== "object" ||
      !Array.isArray(service.resources)
    )
      fail("INVALID_SELECTION_PLAN", "Each service needs resource selections.");
    if (service.serviceId != null) {
      if (rootServices.has(service.serviceId))
        fail(
          "DUPLICATE_ROOT_SERVICE",
          "Use one root selection with multiple resources for each catalog service.",
        );
      rootServices.add(service.serviceId);
    }
    return {
      ...service,
      resources: service.resources.map((resource) => {
        const normalized = leaf(resource, [
          "resourceSelectionId",
          "resourceMemberId",
          "quantity",
          "durationCount",
          "durationPolicyRevision",
          "extras",
        ]);
        if (!Array.isArray(resource.extras))
          fail("INVALID_SELECTION_PLAN", "Extras must be a list.");
        normalized.extras = resource.extras.map((extra) =>
          leaf(extra, [
            "extraSelectionId",
            "serviceId",
            "quantity",
            "durationCount",
            "durationPolicyRevision",
            "resourceMemberIds",
          ]),
        ).map((extra)=>{
          const ids=extra.resourceMemberIds;
          if(ids!==undefined && (!Array.isArray(ids) || ids.length>100 || ids.some(id=>typeof id!=="string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(id)) || new Set(ids).size!==ids.length)) fail("NAMED_EXTRA_MEMBERS_INVALID","Named extra members must be a unique bounded list of current resource IDs.");
          if(complete && ids?.length && ids.length!==extra.quantity) fail("NAMED_EXTRA_COUNT_MISMATCH","Select exactly the extra quantity of named resources.");
          const result={...extra};delete result.resourceMemberIds;return result;
        });
        return normalized;
      }),
    };
  });
  // Reuse identity/shape/quantity bounds, without inferring durations from count.
  legacy.validateSelections(normalized, { complete });
  return input;
}
async function data(client, scope) {
  const options = await legacy.readCatalog(client, scope);
  const rows = (
    await client.query(
      `SELECT q.service_id::text,q.revision::text,q.configuration,p.capacity,r.units_required
    FROM queue_service_policies q JOIN vendor_services s ON(s.id,s.tenant_id)=(q.service_id,q.tenant_id)
    JOIN location_services l ON(l.service_id,l.tenant_id,l.location_id)=(q.service_id,q.tenant_id,q.location_id)
    JOIN service_resource_requirements r ON(r.service_id,r.tenant_id,r.location_id)=(q.service_id,q.tenant_id,q.location_id)
    JOIN location_resource_pools p ON(p.id,p.tenant_id,p.location_id)=(r.pool_id,r.tenant_id,r.location_id)
    WHERE q.tenant_id=$1 AND q.location_id=$2 AND q.configuration IS NOT NULL AND s.is_active AND l.is_active ORDER BY q.service_id`,
      [scope.tenantId, scope.locationId],
    )
  ).rows;
  const policies = new Map(
    rows.map((row) => [
      row.service_id,
      {
        ...policy.configuration(row.configuration),
        revision: row.revision,
        capacity: row.capacity,
        unitsRequired: row.units_required,
      },
    ]),
  );
  const identities = (
    await client.query(
      `SELECT s.id::text,s.name,r.pool_id::text,r.units_required,q.configuration,q.configuration IS NOT NULL AS has_configuration FROM vendor_services s JOIN location_services l
    ON(l.service_id,l.tenant_id)=(s.id,s.tenant_id)
    LEFT JOIN service_resource_requirements r ON(r.service_id,r.tenant_id,r.location_id)=(s.id,s.tenant_id,l.location_id)
    LEFT JOIN queue_service_policies q ON(q.service_id,q.tenant_id,q.location_id)=(s.id,s.tenant_id,l.location_id)
    WHERE s.tenant_id=$1 AND l.location_id=$2 AND s.is_active AND l.is_active ORDER BY s.id`,
      [scope.tenantId, scope.locationId],
    )
  ).rows;
  return {
    options,
    policies,
    identities,
    names: new Map(identities.map((service) => [service.id, service.name])),
    catalogRevision: createHash("sha256")
      .update(
        JSON.stringify({
          contractVersion: 4,
          namedExtraMembersVersion: 1,
          legacy: options.catalogRevision,
          policies: rows,
        }),
      )
      .digest("hex"),
  };
}
function presentation(p) {
  return {
    policyRevision: p.revision,
    labels: p.labels,
    assignmentPolicy: { ...p.assignment, revision: p.revision },
    capacity: p.capacity,
    unitsRequired: p.unitsRequired,
    durationPolicy: { ...p.duration, revision: p.revision },
    executionPolicy: { ...p.execution, revision: p.revision },
  };
}
async function readCatalog(client, scope) {
  const d = await data(client, scope),
    byId = new Map(d.options.services.map((service) => [service.id, service]));
  const result = {
    contractVersion: 4,
    serviceHoursWindow: await serviceHours.readWindow(client,scope),
    catalogRevision: d.catalogRevision,
    observedAt: d.options.observedAt,
    workflow: d.options.workflow,
    capabilities: {
      publication: true,
      childOutcomes: true,
      automaticNamedMemberSelection: false,
      namedExtraMembers: {version:1,maxMembersPerExtra:100,maxPlanExecutionChildren:100,exactQuantity:true},
      namedResourceAvailability: {version:1,intervalBased:true,provisional:true},
    },
    quote: d.options.quote,
    services: d.options.services
      .filter((service) => d.policies.has(service.id))
      .map((service) => {
        const p = d.policies.get(service.id);
        const extras = p.extras.map((eligibility) => {
          const extra = byId.get(eligibility.serviceId),
            ep = d.policies.get(eligibility.serviceId);
          return {
            serviceId: eligibility.serviceId,
            name: extra?.name || d.names.get(eligibility.serviceId) || "",
            selectionRequirement: eligibility.selection,
            configured: Boolean(
              extra &&
                ep && (ep.assignment.mode === "automatic" || ep.unitsRequired === 1) &&
                ep.extras.length === 0,
            ),
            ...(ep ? presentation(ep) : {}),
            quantityMin: 1,
            quantityMax: ep
              ? Math.min(100, Math.floor(ep.capacity / ep.unitsRequired))
              : 0,
            resourceReady: Boolean(extra?.resourceReady && ep && (ep.assignment.mode === "automatic" || ep.unitsRequired===1) && ep.extras.length===0),
            resourceMembers: ep?.assignment.mode === "named" ? extra?.resourceMembers || [] : [],
            availability: extra?.availability || null,
            quote: d.options.quote,
          };
        });
        return {
          id: service.id,
          name: service.name,
          serviceRevision: service.serviceRevision,
          ...presentation(p),
          quantityMin: 1,
          quantityMax:
            p.assignment.mode === "named"
              ? 1
              : Math.min(100, Math.floor(p.capacity / p.unitsRequired)),
          resourceReady:
            service.resourceReady &&
            extras
              .filter((extra) => extra.selectionRequirement === "required")
              .every((extra) => extra.configured && extra.resourceReady),
          availability: service.availability,
          quote: service.quote,
          resourceMembers:
            p.assignment.mode === "named" ? service.resourceMembers : [],
          extras,
        };
      }),
  };
  const pools=(await client.query(`SELECT id::text,name,capacity,tracking_enabled,to_jsonb(location_resource_pools)->>'archived_at' AS archived_at,
    (SELECT count(*)::int FROM resource_pool_members m WHERE m.tenant_id=location_resource_pools.tenant_id AND m.location_id=location_resource_pools.location_id AND m.pool_id=location_resource_pools.id AND m.is_active AND (to_jsonb(m)->>'archived_at') IS NULL) AS active_members
    FROM location_resource_pools WHERE tenant_id=$1 AND location_id=$2 ORDER BY display_order,id`,[scope.tenantId,scope.locationId])).rows;
  return {...result,resourceSetup:require("./queueResourceSetupProjection").build({pools,services:d.identities,choices:result.services,workflow:result.workflow})};
}
async function capture(
  client,
  scope,
  input,
  expectedCatalogRevision,
  { workflowOverride } = {},
) {
  validateSelections(input, { complete: true });
  const d = await data(client, scope);
  if (
    typeof expectedCatalogRevision !== "string" ||
    expectedCatalogRevision !== d.catalogRevision
  )
    fail(
      "CATALOG_ACCEPTANCE_REQUIRED",
      "Review the current service configuration before publishing.",
      409,
    );
  const capturedDurations = new Map(),
    leafPolicies = new Map(),
    rootPolicies = new Map(),
    eligibilityByLeaf = new Map(),
    namedGroups = new Map(),groupForLeaf = new Map();
  const normalized = input.map((service) => {
    const p = d.policies.get(service.serviceId);
    if (!p)
      fail(
        "SERVICE_POLICY_REQUIRED",
        "This service requires an explicit duration-count configuration.",
      );
    rootPolicies.set(service.serviceSelectionId, p);
    return {
      ...service,
      resources: service.resources.map((resource) => {
        const duration = policy.duration(
          resource.durationCount,
          resource.durationPolicyRevision,
          p,
        );
        capturedDurations.set(resource.resourceSelectionId, duration);
        leafPolicies.set(resource.resourceSelectionId, p);
        for (const required of p.extras.filter(
          (extra) => extra.selection === "required",
        ))
          if (
            !resource.extras.some(
              (extra) => extra.serviceId === required.serviceId,
            )
          )
            fail(
              "REQUIRED_EXTRA_MISSING",
              "Select every configured required extra.",
            );
        const extras = resource.extras.flatMap((extra) => {
          const eligible = p.extras.find(
              (option) => option.serviceId === extra.serviceId,
            ),
            ep = d.policies.get(extra.serviceId);
          if (!eligible || !ep)
            fail(
              "EXTRA_NOT_ELIGIBLE",
              "Select a configured eligible extra.",
            );
          const ed = policy.duration(
            extra.durationCount,
            extra.durationPolicyRevision,
            ep,
          );
          if (ep.extras.length)
            fail(
              "UNSUPPORTED_EXTRA_NESTING",
              "Selected extras cannot have their own configured extra requirements in this version.",
            );
          if (ed.durationMinutes > duration.durationMinutes)
            fail(
              "EXTRA_DURATION_EXCEEDS_PARENT",
              "The configured containment policy requires the extra duration to fit its parent resource.",
            );
          const ids=extra.resourceMemberIds || [];
          if(ep.assignment.mode === "named"){
            if(ep.unitsRequired!==1) fail("NAMED_EXTRA_REQUIREMENT_INVALID","Named extras require one pool unit per selected member.");
            if(ids.length!==extra.quantity) fail("NAMED_EXTRA_COUNT_MISMATCH","Select exactly the extra quantity of named resources.");
            const leaves=ids.map(id=>({extraSelectionId:"nem_"+createHash("sha256").update(extra.extraSelectionId+":"+id).digest("hex").slice(0,48),serviceId:extra.serviceId,quantity:1,durationMinutes:ed.durationMinutes,resourceMemberId:id}));
            namedGroups.set(extra.extraSelectionId,{input:extra,policy:ep,duration:ed,selectionRequirement:eligible.selection,leafIds:leaves.map(leaf=>leaf.extraSelectionId)});
            for(const leaf of leaves){capturedDurations.set(leaf.extraSelectionId,ed);leafPolicies.set(leaf.extraSelectionId,ep);eligibilityByLeaf.set(leaf.extraSelectionId,eligible.selection);groupForLeaf.set(leaf.extraSelectionId,extra.extraSelectionId);}
            return leaves;
          }
          if(ids.length) fail("EXTRA_ASSIGNMENT_MISMATCH","Automatic extras cannot claim named members. Review the current assignment policy.");
          capturedDurations.set(extra.extraSelectionId, ed);
          leafPolicies.set(extra.extraSelectionId, ep);
          eligibilityByLeaf.set(extra.extraSelectionId, eligible.selection);
          return [{extraSelectionId:extra.extraSelectionId,serviceId:extra.serviceId,quantity:extra.quantity,durationMinutes:ed.durationMinutes}];
        });
        return {
          resourceSelectionId: resource.resourceSelectionId,
          resourceMemberId: resource.resourceMemberId,
          quantity: resource.quantity,
          durationMinutes: duration.durationMinutes,
          extras,
        };
      }),
    };
  });
  const result = await legacy.capture(
    client,
    scope,
    normalized,
    d.options.catalogRevision,
    { workflowOverride, allowConfiguredV4: true, allowNamedExtrasV1: true },
  );
  for (const service of result.serviceSelections) {
    const p = rootPolicies.get(service.serviceSelectionId);
    Object.assign(service, presentation(p), { inputContractVersion: 4 });
    for (const resource of service.resources) {
      Object.assign(
        resource,
        capturedDurations.get(resource.resourceSelectionId),
        { executionPolicy: { ...p.execution, revision: p.revision } },
      );
      const grouped=[];const seenGroups=new Set();
      for(const extra of resource.extras){
        const groupId=groupForLeaf.get(extra.extraSelectionId);
        if(!groupId){grouped.push(extra);continue;}
        if(seenGroups.has(groupId))continue;seenGroups.add(groupId);
        const group=namedGroups.get(groupId),leaves=resource.extras.filter(e=>group.leafIds.includes(e.extraSelectionId));
        grouped.push({...extra,extraSelectionId:groupId,quantity:group.input.quantity,namedExtraVersion:1,resourceMemberIds:[...group.input.resourceMemberIds],resourceMembers:leaves.map(e=>({id:e.resourceMemberId,name:e.resourceMemberName,revision:e.resourceMemberRevision,selectionId:e.extraSelectionId})),...group.duration,assignmentPolicy:{...group.policy.assignment,revision:group.policy.revision},selectionRequirement:group.selectionRequirement,executionPolicy:{...p.execution,revision:p.revision}});
        delete grouped.at(-1).resourceMemberId;delete grouped.at(-1).resourceMemberName;delete grouped.at(-1).resourceMemberRevision;
      }
      resource.extras=grouped;
      for (const extra of resource.extras)
        Object.assign(extra, capturedDurations.get(extra.extraSelectionId), {
          selectionRequirement: eligibilityByLeaf.get(extra.extraSelectionId) || extra.selectionRequirement,
          executionPolicy: { ...p.execution, revision: p.revision },
        });
    }
  }
  for (const item of result.items) {
    const root = rootPolicies.get(item.serviceSelectionId),
      own = leafPolicies.get(item.selectionId);
    if(groupForLeaf.has(item.selectionId)) Object.assign(item,{namedExtraVersion:1,extraGroupId:groupForLeaf.get(item.selectionId)});
    Object.assign(item, capturedDurations.get(item.selectionId), {
      inputContractVersion: 4,
      assignmentPolicy: { ...own.assignment, revision: own.revision },
      executionPolicy: { ...root.execution, revision: root.revision },
      selectionRequirement: eligibilityByLeaf.get(item.selectionId) || null,
    });
  }
  return { ...result, contractVersion: 4, catalogRevision: d.catalogRevision };
}
module.exports = { validateSelections, readCatalog, capture };
