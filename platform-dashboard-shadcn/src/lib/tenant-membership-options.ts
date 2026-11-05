export function tenantMembershipOptions(memberships: readonly { tenantId: string; tenantName: string }[]) {
  return memberships.map((membership) => ({ id: membership.tenantId, name: membership.tenantName }))
}

export function membershipSessionNotice(preview: Pick<UserTenantMembershipPreview, "previousRole" | "previouslyActive" | "role" | "active">) {
  return preview.previousRole === preview.role && preview.previouslyActive === preview.active
    ? "No changes will be made. Active sessions will remain signed in."
    : "Active sessions will be revoked."
}
import type { UserTenantMembershipPreview } from "./platform-contracts"
