import type { QueueSelectionPlanV3 as LegacyPlan } from "../../../shared/queueSelectionPlanV3";
import type { QueueSelectionPlanV4 } from "../../../shared/queueSelectionPlanV4";
import type { NamedQueueFormDraft } from "./NamedQueuePlanDialog";
type QueueSelectionPlanV3 = LegacyPlan | QueueSelectionPlanV4;
export function namedQueueForm(
  plan?: QueueSelectionPlanV3,
): NamedQueueFormDraft {
  return {
    customerName: plan?.customer.name || "",
    customerEmail: plan?.customer.email || "",
    customerPhone: plan?.customer.phone || "",
    notes: plan?.notes || "",
    catalogRevision: plan?.state === "draft" ? plan.catalogRevision : null,
    selections:
      plan?.serviceSelections.map((service) => ({
        serviceSelectionId: service.serviceSelectionId,
        serviceId: service.serviceId || "",
        courts: service.resources.map((resource) => ({
          courtSelectionId: resource.resourceSelectionId,
          resourceMemberId: resource.resourceMemberId || null,
          durationMinutes:
            "durationMinutes" in resource && resource.durationMinutes != null
              ? String(resource.durationMinutes)
              : "",
          durationCount:
            "durationCount" in resource && resource.durationCount != null
              ? String(resource.durationCount)
              : "",
          durationBaseMinutes:
            "baseMinutes" in resource ? resource.baseMinutes : undefined,
          durationPolicyRevision:
            "durationPolicyRevision" in resource
              ? resource.durationPolicyRevision || ""
              : undefined,
          resourceQuantity:
            resource.quantity == null ? "" : String(resource.quantity),
          extras: resource.extras.map((extra) => ({
            extraSelectionId: extra.extraSelectionId,
            resourceMemberIds:
              "resourceMemberIds" in extra
                ? extra.resourceMemberIds
                : undefined,
            serviceId: extra.serviceId || "",
            quantity: extra.quantity == null ? "" : String(extra.quantity),
            durationMinutes:
              "durationMinutes" in extra && extra.durationMinutes != null
                ? String(extra.durationMinutes)
                : "",
            durationCount:
              "durationCount" in extra && extra.durationCount != null
                ? String(extra.durationCount)
                : "",
            durationBaseMinutes:
              "baseMinutes" in extra ? extra.baseMinutes : undefined,
            durationPolicyRevision:
              "durationPolicyRevision" in extra
                ? extra.durationPolicyRevision || ""
                : undefined,
          })),
        })),
      })) || [],
  };
}
