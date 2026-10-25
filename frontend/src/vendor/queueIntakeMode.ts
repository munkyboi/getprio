import { canAccessVendorSection } from "../lib/vendorDashboardNavigation";

type ModeInput = {
  optedIn: boolean;
  tenantSlug: string;
  entitlementTenantSlug: string | null | undefined;
  loaded: boolean;
  entitlements: { serviceBookingAccess?: boolean } | null | undefined;
  plan?: { planSlug?: string | null; subscriptionStatus?: string | null } | null;
};
/** Presentation only; the server still authorizes queue admission and booking separately. */
export function queueIntakeMode(input: ModeInput): "loading" | "legacy" | "resource" {
  if (!input.tenantSlug || !input.loaded || input.entitlementTenantSlug !== input.tenantSlug || !input.entitlements) return "loading";
  return input.optedIn && canAccessVendorSection("services", input.entitlements, input.plan) ? "resource" : "legacy";
}
