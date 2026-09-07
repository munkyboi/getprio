/** @param {{ planSlug?: string | null, subscriptionStatus?: string | null } | null} [plan] */
export function canAccessVendorSection(section, entitlements, plan = null) {
  if (section === "settings" || section === "account") {
    return true;
  }

  if (section === "ratings") {
    return plan?.subscriptionStatus === "active" && Boolean(plan.planSlug) && plan.planSlug !== "free";
  }

  if (!entitlements) {
    return false;
  }

  switch (section) {
    case "queue":
      return entitlements.queueSystemAccess === true;
    case "tenants":
      return Number(entitlements.locations || 0) > 0;
    case "services":
    case "bookings":
      return entitlements.serviceBookingAccess === true;
    case "group-funded":
      return entitlements.serviceBookingAccess === true && entitlements.groupFundedCampaignAccess === true;
    case "staff":
      return Number(entitlements.staffSeats || 0) > 1;
    case "clients":
      return entitlements.basicDashboard === true;
    case "history":
      return Number(entitlements.historyDays || 0) > 0;
    case "reports":
      return entitlements.analytics === true;
    default:
      return false;
  }
}
