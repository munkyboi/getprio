export interface TenantPeriodUsageResource {
  limit: number;
  /** Canonical base allowance use, including projected unaccounted admissions. */
  used: number | null;
  /** Retained admissions created in the current window, independent of status. */
  observedUsed: number | null;
  accountingStatus: "complete" | "partial" | "unavailable";
}

export interface TenantPeriodUsage {
  subscriptionId: string | null;
  planSlug: string | null;
  observedAt: string;
  period: { start: string; end: string } | null;
  usageAvailable: boolean;
  resources: Record<"queueTickets" | "serviceBookings", TenantPeriodUsageResource>;
}

export interface TenantPeriodUsageResponse {
  tenant: { id: string; slug: string };
  usage: TenantPeriodUsage;
}
