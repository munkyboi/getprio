import type { QueueServiceConfigurationV4 } from "../../../shared/queueSelectionPlanV4";
import type { ResourceConfiguration } from "../components/VendorResourceConfigurationForms";
import { apiRequest } from "../api/client";
import { listResourceMembers, type ResourceMemberRegistry } from "../api/resourceMembers";

type Scope = { tenant: string; location: string; serviceId: string };
export type QueuePolicyNamedCapability = Scope & {
  state: "ready" | "blocked" | "unknown";
  message: string;
  requestKey?: string;
  pending?: boolean;
};
type Readers = {
  configuration: () => Promise<ResourceConfiguration>;
  members: (poolId: string) => Promise<ResourceMemberRegistry>;
};

/** Authoring support comes from the mapped registry, not the current execution mode. */
export async function readPolicyNamedCapability(
  token: string, scope: Scope, stored: QueueServiceConfigurationV4 | null,
  readers: Readers = {
    configuration: () => apiRequest<ResourceConfiguration>(`/vendor/tenant/${encodeURIComponent(scope.tenant)}/locations/${encodeURIComponent(scope.location)}/resources`, { token }),
    members: poolId => listResourceMembers(token, scope.tenant, scope.location, poolId),
  },
): Promise<QueuePolicyNamedCapability> {
  const result = (state: QueuePolicyNamedCapability["state"], message: string) => ({ ...scope, state, message });
  try {
    const configuration = await readers.configuration();
    const requirement = configuration.requirements.find(item => item.service_id === scope.serviceId);
    if (!requirement) return result("blocked", "Map this service to a resource pool at this location before selecting named members.");
    const pool = configuration.pools.find(item => item.id === requirement.pool_id);
    if (!pool || pool.archived_at) return result("blocked", "The mapped resource pool is unavailable. Review this location’s service requirement.");
    if (requirement.units_required !== 1) return result("blocked", "Named assignment requires one pool unit per selected resource. Review the service requirement.");
    for (const extra of stored?.extras || []) {
      const extraRequirement = configuration.requirements.find(item => item.service_id === extra.serviceId);
      if (!extraRequirement) return result("blocked", "Review the resource mappings for this policy’s configured extras before choosing named assignment.");
      if (extraRequirement.pool_id === pool.id) return result("blocked", "Named assignment requires extras to use a different resource pool.");
    }
    const registry = await readers.members(pool.id);
    if (registry.pool.id !== pool.id) return result("unknown", "The mapped resource registry could not be verified. Refresh resource choices before using named assignment.");
    if (!registry.members.some(member => member.isActive && !member.archivedAt))
      return result("blocked", "Enable at least one named resource in this location’s mapped pool before choosing named assignment.");
    // Tracking is intentionally not required to author the policy that precedes activation.
    return result("ready", `Named resources are configured in ${pool.name}. Resource tracking is enabled separately before intake.`);
  } catch {
    return result("unknown", "Named-resource setup could not be verified. Refresh resource choices, or ask an administrator with location-management access. Your saved assignment is unchanged.");
  }
}

export function namedPolicyReady(value: QueuePolicyNamedCapability | null, scope: Scope) {
  return value?.state === "ready" && value.tenant === scope.tenant && value.location === scope.location && value.serviceId === scope.serviceId;
}

export function namedPolicyVerificationRequired(selected: string, stored?: QueueServiceConfigurationV4 | null) {
  return selected === "named" && stored?.assignment.mode !== "named";
}

/** Retain a saved/unsaved named value even when discovery becomes unavailable. */
export function policyAssignmentChoices(value: QueuePolicyNamedCapability | null, scope: Scope, selected: string) {
  const ready = namedPolicyReady(value, scope);
  return [
    { value: "__none__", label: "Choose assignment" },
    ...(ready || selected === "named" ? [{ value: "named", label: ready ? "Select named members" : "Select named members (setup needs review)", disabled: !ready }] : []),
    { value: "automatic", label: "Automatic pooled capacity" },
  ];
}
