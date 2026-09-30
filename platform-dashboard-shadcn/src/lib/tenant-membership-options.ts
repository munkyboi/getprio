export function tenantMembershipOptions(memberships: readonly { tenantId: string; tenantName: string }[]) {
  return memberships.map((membership) => ({ id: membership.tenantId, name: membership.tenantName }))
}
