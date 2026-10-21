const capture = require("./queueSelectionCaptureV4");
const availability = require("./queueNamedAvailabilityService");

function durationInput(value, service) {
  if (value.durationCount != null) return { durationCount: value.durationCount, durationPolicyRevision: value.durationPolicyRevision };
  const baseMinutes = service?.durationPolicy?.baseMinutes;
  const minutes = Number(value.durationMinutes);
  const count = Number.isInteger(minutes) && Number.isInteger(baseMinutes) && baseMinutes > 0 && minutes % baseMinutes === 0 ? minutes / baseMinutes : null;
  return { durationCount: count, durationPolicyRevision: service?.durationPolicy?.revision || null };
}
function requestBody(serviceSelections, catalogRevision, catalog) {
  const services = new Map((catalog?.services || []).map((service) => [service.id, service]));
  const selections = (serviceSelections || []).map((service) => ({
    serviceSelectionId: service.serviceSelectionId,
    serviceId: service.serviceId,
    resources: (service.resources || []).map((resource) => ({
      resourceSelectionId: resource.resourceSelectionId,
      resourceMemberId: resource.resourceMemberId || null,
      quantity: resource.quantity,
      ...durationInput(resource, services.get(service.serviceId)),
      extras: (resource.extras || []).map((extra) => ({
        extraSelectionId: extra.extraSelectionId,
        serviceId: extra.serviceId,
        quantity: extra.quantity,
        ...durationInput(extra, services.get(extra.serviceId)),
        resourceMemberIds: extra.resourceMemberIds || (extra.resourceMembers || []).map((member) => member.id),
      })),
    })),
  }));
  const requests = selections.flatMap((service) => service.resources.flatMap((resource) => [
    {
      selectionId: resource.resourceSelectionId,
      serviceId: service.serviceId,
      quantity: resource.quantity,
      durationCount: durationInput(resource, services.get(service.serviceId)).durationCount,
      durationPolicyRevision: durationInput(resource, services.get(service.serviceId)).durationPolicyRevision,
      resourceMemberIds: resource.resourceMemberId ? [resource.resourceMemberId] : [],
    },
    ...resource.extras.map((extra) => ({
      selectionId: extra.extraSelectionId,
      serviceId: extra.serviceId,
      parentServiceId: service.serviceId,
      quantity: extra.quantity,
      durationCount: durationInput(extra, services.get(extra.serviceId)).durationCount,
      durationPolicyRevision: durationInput(extra, services.get(extra.serviceId)).durationPolicyRevision,
      resourceMemberIds: extra.resourceMemberIds || [],
    })),
  ]));
  return { serviceSelections: selections, requests, catalogRevision, requestKey: `projection-${Date.now()}` };
}

async function readWaitingConflict(client, scope, draft, serviceSelections) {
  if (!Array.isArray(serviceSelections) || !serviceSelections.length) return null;
  const catalog = await capture.readCatalog(client, scope);
  const body = requestBody(serviceSelections, catalog.catalogRevision, catalog);
  const preview = await availability.evaluate(client, scope, {
    ...body,
    draftId: draft.id,
  });
  let unavailable, detail;
  for (const selection of preview.selections) {
    const requested = body.requests.find((request) => request.selectionId === selection.selectionId);
    const selectedMember = selection.resourceMembers?.find((member) => requested?.resourceMemberIds.includes(member.id) && member.availability?.state !== 'available');
    const blocked = selectedMember?.availability || (selection.availability?.state !== 'available' ? selection.availability : null);
    if (blocked) { unavailable = selection; detail = blocked; break; }
  }
  if (!unavailable) return null;
  return {
    code: detail?.reasonCode || "RESOURCE_CAPACITY_UNAVAILABLE",
    message: detail?.message || "Waiting for the requested resource capacity.",
    planRevision: draft.revision,
    stageId: unavailable.stageId || "linear",
    observedAt: preview.checkedAt,
  };
}

module.exports = { readWaitingConflict };
