import { apiRequest } from "./client";

export interface ResourceMember {
  id: string;
  name: string;
  revision: string;
  displayOrder: number;
  isActive: boolean;
  archivedAt: string | null;
  availability: { state: string; provisional: boolean; observedAt: string };
}
export interface ResourceMemberRegistry {
  pool: { id: string; name: string; capacity: number };
  members: ResourceMember[];
  holdsCreated: false;
}
export interface ResourceMemberWrite {
  name: string;
  isActive: boolean;
  expectedRevision?: string;
  displayOrder?: number;
  poolId?: string;
}
export function listResourceMembers(
  token: string,
  tenant: string,
  location: string,
  poolId: string,
  signal?: AbortSignal,
) {
  return apiRequest<ResourceMemberRegistry>(
    `/vendor/tenant/${encodeURIComponent(tenant)}/queue/resource-members?location=${encodeURIComponent(location)}&poolId=${encodeURIComponent(poolId)}`,
    { token, signal },
  );
}
export function saveResourceMember(
  token: string,
  tenant: string,
  location: string,
  memberId: string | null,
  body: ResourceMemberWrite,
  key: string,
  signal?: AbortSignal,
) {
  return apiRequest<{
    member: {
      id: string;
      poolId: string;
      name: string;
      revision: string;
      isActive: boolean;
      archivedAt: string | null;
    };
    holdsCreated: false;
  }>(
    `/vendor/tenant/${encodeURIComponent(tenant)}/queue/resource-members${memberId ? `/${encodeURIComponent(memberId)}` : ""}?location=${encodeURIComponent(location)}`,
    {
      token,
      signal,
      method: memberId ? "PATCH" : "POST",
      body,
      headers: { "Idempotency-Key": key },
    },
  );
}
export function reorderResourceMembers(
  token: string,
  tenant: string,
  location: string,
  poolId: string,
  memberIds: string[],
  key: string,
  signal?: AbortSignal,
) {
  return apiRequest<{ reordered: boolean }>(
    `/vendor/tenant/${encodeURIComponent(tenant)}/queue/resource-members/reorder?location=${encodeURIComponent(location)}`,
    { token, signal, method: "POST", body: { poolId, memberIds }, headers: { "Idempotency-Key": key } },
  );
}

export function archiveResourceMember(
  token: string,
  tenant: string,
  location: string,
  memberId: string,
  body: { expectedRevision: string },
  key: string,
  signal?: AbortSignal,
) {
  return apiRequest<{
    member: {
      id: string;
      poolId: string;
      name: string;
      revision: string;
      isActive: boolean;
      archivedAt: string | null;
    };
    holdsCreated: false;
  }>(
    `/vendor/tenant/${encodeURIComponent(tenant)}/queue/resource-members/${encodeURIComponent(memberId)}/archive?location=${encodeURIComponent(location)}`,
    {
      token,
      signal,
      method: "POST",
      body,
      headers: { "Idempotency-Key": key },
    },
  );
}
