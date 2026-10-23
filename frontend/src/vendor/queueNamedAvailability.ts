import type {
  QueueNamedAvailabilityRequestV1,
  QueueNamedAvailabilityResponseV1,
  QueueServiceSelectionInputV4,
} from "../../../shared/queueSelectionPlanV4";

/** Include pooled rows as well: omitted demand must never make a named member look free. */
export function namedAvailabilityRequest(
  serviceSelections: QueueServiceSelectionInputV4[],
  catalogRevision: string,
  requestKey: string,
  draftId?: string,
): QueueNamedAvailabilityRequestV1 {
  return {
    serviceSelections,
    catalogRevision,
    requestKey,
    ...(draftId ? { draftId } : {}),
    requests: serviceSelections.flatMap((service) =>
      service.resources.flatMap((resource) => [
        {
          selectionId: resource.resourceSelectionId,
          serviceId: service.serviceId || "",
          quantity: resource.quantity,
          durationCount: resource.durationCount,
          durationPolicyRevision: resource.durationPolicyRevision,
          resourceMemberIds: resource.resourceMemberId
            ? [resource.resourceMemberId]
            : [],
        },
        ...resource.extras.map((extra) => ({
          selectionId: extra.extraSelectionId,
          serviceId: extra.serviceId || "",
          parentServiceId: service.serviceId || "",
          quantity: extra.quantity,
          durationCount: extra.durationCount,
          durationPolicyRevision: extra.durationPolicyRevision,
          resourceMemberIds: extra.resourceMemberIds || [],
        })),
      ]),
    ),
  };
}
export function acceptedNamedAvailability(
  response: QueueNamedAvailabilityResponseV1,
  request: QueueNamedAvailabilityRequestV1,
): boolean {
  return (
    response.contractVersion === 4 &&
    response.availabilityVersion === 1 &&
    response.requestKey === request.requestKey &&
    response.catalogRevision === request.catalogRevision &&
    response.currentCatalogRevision === request.catalogRevision
  );
}
