import { useId } from "react";
import { IconCheck } from "@tabler/icons-react";
import { Button } from "@vendor/components/ui/button";
import type { SubscriptionPlan } from "@shared";
import { getPlanHighlights } from "../utils/subscriptionPlans";
export default function PricingHighlights({ plan, expanded, onToggle }: { plan: SubscriptionPlan; expanded: boolean; onToggle: () => void }) {
  const id = useId();
  const highlights = getPlanHighlights(plan);
  const qrIndex = highlights.indexOf("QR join page");
  const splitAt = qrIndex === -1 ? highlights.length : qrIndex + 1;
  const remaining = highlights.slice(splitAt);
  const feature = (item: string) => <p key={item}><IconCheck aria-hidden="true" size={18} /><span>{item}</span></p>;
  return <div className="marketing-pricing-features">{highlights.slice(0, splitAt).map(feature)}{remaining.length > 0 && <><div id={id} hidden={!expanded}>{remaining.map(feature)}</div><Button variant="ghost" type="button" aria-expanded={expanded} aria-controls={id} aria-label={`${expanded ? "Show less" : "Show more"} for all plans`} onClick={onToggle}>{expanded ? "Show less" : "Show more"}</Button></>}</div>;
}
