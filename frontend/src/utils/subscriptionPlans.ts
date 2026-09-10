import type { SubscriptionPlan } from "@shared";

const planNumber = new Intl.NumberFormat("en-PH");

/** Public card copy follows the same structured values as the plan policy. */
export function getPlanHighlights(plan: SubscriptionPlan): string[] {
  const e = plan.entitlements;
  const highlights: string[] = [];
  const count = (value: number | null | undefined, label: string, plural = `${label}s`, suffix = "") => {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      highlights.push(`${planNumber.format(value)} ${value === 1 ? label : plural}${suffix}`);
    }
  };
  count(e.locations, "location");
  count(e.counters, "counter");
  count(e.staffSeats, "staff seat");
  count(plan.allowances?.queueTickets ?? e.monthlyTickets, "Queue Ticket", "Queue Tickets", "/mo");
  count(plan.allowances?.queueEmailJourneys ?? e.monthlyQueueEmailJourneys ?? e.monthlyTransactionalEmails, "Queue Email Journey", "Queue Email Journeys", "/mo");
  if (plan.features?.booking ?? e.serviceBookingAccess) {
    count(plan.allowances?.serviceBookings ?? e.monthlyServiceBookings, "service booking", "service bookings", "/mo");
  }
  if (Number.isFinite(e.historyDays)) highlights.push(`${planNumber.format(e.historyDays)}-day history`);
  if (e.qrJoinPage) highlights.push("QR join page");
  if (e.publicQueueBoard) {
    highlights.push((plan.features?.branding ?? e.publicFacingBranding ?? e.brandedQueuePages)
      ? "Branded public queue pages" : "GetPrio-branded public queue page");
  }
  if (plan.features?.discovery ?? e.marketplaceDiscovery) highlights.push("Marketplace discovery");
  if (plan.features?.campaigns ?? e.groupFundedCampaignAccess) highlights.push("Group-funded campaigns");
  if (e.analytics) highlights.push("Analytics");
  else if (e.basicDashboard) highlights.push("Basic queue dashboard");
  if (e.csvExport || e.pdfExport) highlights.push(`${[e.csvExport && "CSV", e.pdfExport && "PDF"].filter(Boolean).join(" and ")} export`);
  if (e.queueSettings) highlights.push("Queue settings");
  if (e.emailAlerts) highlights.push("Email alerts");
  if (e.smsBundleType === "custom") highlights.push("Custom SMS bundle");
  else if (e.smsBundleType === "fixed") count(e.smsAllowance, "SMS", "SMS", "/mo");
  if (e.advancedRoles) highlights.push("Advanced roles");
  if (e.slaSupport) highlights.push("SLA/support");
  if (e.customDomain || e.sso) highlights.push([e.customDomain && "Custom domain", e.sso && "SSO"].filter(Boolean).join(" / "));
  return highlights;
}

export function getPlanPriceDisplay(
  plan: SubscriptionPlan,
  interval: "monthly" | "annual" = "monthly"
) {
  const display = interval === "annual" ? plan.price.annualDisplay : plan.price.monthlyDisplay;
  return plan.slug === "enterprise" ? `Starts at ${display}` : display;
}
