import type { QueueExtraSelectionV3 } from "../../../shared/queueSelectionPlanV3";
import type { QueueExtraSelectionV4 } from "../../../shared/queueSelectionPlanV4";
/** Named groups have no aggregate execution: only the frozen members carry outcomes. */
export function namedExtraExecutions(
  extra: QueueExtraSelectionV3 | QueueExtraSelectionV4,
) {
  if ("namedExtraVersion" in extra && extra.namedExtraVersion === 1) {
    return (extra.resourceMembers || []).map((member) => ({
      id: member.id,
      memberName: member.name,
      name: `${extra.serviceName} · ${member.name}`,
      execution:
        extra.memberExecutions?.find(
          (item) => item.resourceMemberId === member.id,
        )?.execution || null,
    }));
  }
  return [
    {
      id: extra.extraSelectionId,
      memberName: extra.serviceName,
      name: extra.serviceName,
      execution: extra.execution,
    },
  ];
}
