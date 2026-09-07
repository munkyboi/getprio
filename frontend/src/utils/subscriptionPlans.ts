import type { SubscriptionPlan } from "@shared";

export function getPlanPriceDisplay(
  plan: SubscriptionPlan,
  interval: "monthly" | "annual" = "monthly"
) {
  const display = interval === "annual" ? plan.price.annualDisplay : plan.price.monthlyDisplay;
  return plan.slug === "enterprise" ? `Starts at ${display}` : display;
}
