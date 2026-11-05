import type { SubscriptionEntitlements, SubscriptionPlan } from "./types"

export type PlanPolicyPublication = Omit<SubscriptionPlan, "allowances" | "entitlements"> & {
  allowances?: { queueTickets: number; serviceBookings: number; queueEmailJourneys?: number }
  entitlements: Omit<SubscriptionEntitlements, "monthlyTransactionalEmails" | "monthlyQueueEmailJourneys"> & {
    monthlyTransactionalEmails?: number | null
    monthlyQueueEmailJourneys?: number
  }
}

export function planPolicyPayload(plan: SubscriptionPlan, queueEmailQuotaRetired = false): PlanPolicyPublication {
  if (!queueEmailQuotaRetired) return structuredClone(plan)
  const { monthlyTransactionalEmails: _transactional, monthlyQueueEmailJourneys: _journeys, ...entitlements } = plan.entitlements
  return {
    ...plan,
    allowances: plan.allowances ? { queueTickets: plan.allowances.queueTickets, serviceBookings: plan.allowances.serviceBookings } : undefined,
    entitlements,
  }
}
