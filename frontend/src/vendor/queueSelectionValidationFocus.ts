import { namedExtraMemberIssue } from "./NamedExtraMembers";
import type { QueueSelectionOptionsV4 } from "../../../shared/queueSelectionPlanV4";
import type { NamedQueueServiceDraft } from "./namedQueueSelectionDraft";
import { durationCountIssue } from "./QueueDurationCount";
export interface SelectionValidationFocus {
  serviceId: string;
  resourceId?: string;
  extraId?: string;
  label?: string;
  action?: string;
}
/** Focus guidance only. Existing publication validation remains authoritative for the UI. */
export function selectionValidationFocus(
  rows: NamedQueueServiceDraft[],
  options: QueueSelectionOptionsV4,
): SelectionValidationFocus | undefined {
  const seen = new Set<string>();
  for (const [index, row] of rows.entries()) {
    const base = { serviceId: row.serviceSelectionId };
    const policy = options.services.find((item) => item.id === row.serviceId);
    const context = `service ${index + 1}`;
    if (!policy || seen.has(row.serviceId))
      return { ...base, label: `Choose service for ${context}` };
    seen.add(row.serviceId);
    if (!row.courts.length) return { ...base, action: "add-resource" };
    for (const [resourceIndex, resource] of row.courts.entries()) {
      const target = { ...base, resourceId: resource.courtSelectionId };
      const resourceContext = `${context}, resource ${resourceIndex + 1}`;
      if (
        policy.assignmentPolicy.mode === "automatic" &&
        resource.resourceMemberId
      )
        return { ...target, action: "remove-resource" };
      if (resource.durationPolicyRevision !== policy.durationPolicy.revision)
        return { ...target, action: "review-resource-policy" };
      if (
        durationCountIssue(resource.durationCount || "", policy.durationPolicy)
      )
        return {
          ...target,
          label: `${policy.labels.duration} for ${resourceContext}`,
        };
      const quantity = Number(resource.resourceQuantity);
      if (
        !Number.isSafeInteger(quantity) ||
        quantity < policy.quantityMin ||
        quantity > policy.quantityMax
      )
        return policy.assignmentPolicy.mode === "named"
          ? { ...target, action: "remove-resource" }
          : { ...target, label: `Resource quantity for ${resourceContext}` };
      if (
        policy.assignmentPolicy.mode === "named" &&
        !policy.resourceMembers.some(
          (member) =>
            member.id === resource.resourceMemberId &&
            member.isActive &&
            !member.archivedAt,
        )
      )
        return {
          ...target,
          label: `${policy.labels.resources} for ${resourceContext}`,
        };
      if (
        policy.extras.some(
          (extra) =>
            extra.selectionRequirement === "required" &&
            !resource.extras.some((item) => item.serviceId === extra.serviceId),
        )
      )
        return { ...target, action: "add-extra" };
      for (const [extraIndex, extra] of resource.extras.entries()) {
        const leaf = { ...target, extraId: extra.extraSelectionId };
        const extraContext = `${resourceContext}, extra ${extraIndex + 1}`;
        const choice = policy.extras.find(
          (item) => item.serviceId === extra.serviceId,
        );
        if (!choice?.configured || !choice.resourceReady)
          return { ...leaf, label: `Choose extra for ${extraContext}` };
        if (extra.durationPolicyRevision !== choice.durationPolicy.revision)
          return { ...leaf, action: "review-extra-policy" };
        if (
          durationCountIssue(
            extra.durationCount || "",
            choice.durationPolicy,
          ) ||
          Number(extra.durationCount) * choice.durationPolicy.baseMinutes >
            Number(resource.durationCount) * policy.durationPolicy.baseMinutes
        )
          return {
            ...leaf,
            label: `${choice.labels.duration} for ${extraContext}`,
          };
        const count = Number(extra.quantity);
        if (
          !Number.isSafeInteger(count) ||
          count < choice.quantityMin ||
          count > choice.quantityMax
        )
          return { ...leaf, label: `Quantity for ${extraContext}` };
        if (
          choice.assignmentPolicy.mode === "named" &&
          namedExtraMemberIssue(
            extra.resourceMemberIds || [],
            extra.quantity,
            choice.resourceMembers.map((member) => ({
              id: member.id,
              name: member.name,
              eligible: member.isActive && !member.archivedAt,
              availability: "unknown",
            })),
          )
        )
          return {
            ...leaf,
            label: `${choice.labels.resources} for ${extraContext}`,
          };
        if (
          choice.assignmentPolicy.mode === "automatic" &&
          extra.resourceMemberIds?.length
        )
          return { ...leaf, action: "remove-extra" };
      }
    }
  }
  return undefined;
}
