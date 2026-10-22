import { useId } from "react";
import { Collapse, Group, Stack, Text, ThemeIcon } from "@mantine/core";
import { useReducedMotion } from "@mantine/hooks";
import { IconCheck } from "@tabler/icons-react";
import type { SubscriptionPlan } from "@shared";
import { getPlanHighlights } from "../utils/subscriptionPlans";

export default function PricingHighlights({ plan, expanded, onToggle }: {
  plan: SubscriptionPlan;
  expanded: boolean;
  onToggle: () => void;
}) {
  const detailsId = useId();
  const reducedMotion = useReducedMotion();
  const highlights = getPlanHighlights(plan);
  const qrIndex = highlights.indexOf("QR join page");
  const splitAt = qrIndex === -1 ? highlights.length : qrIndex + 1;
  const remaining = highlights.slice(splitAt);
  const renderFeature = (feature: string) => (
    <Group gap="sm" key={feature} wrap="nowrap">
      <ThemeIcon color={plan.slug === "pro" ? "orange" : "dark"} radius="xl" size={22} variant="light">
        <IconCheck size={14} aria-hidden="true" />
      </ThemeIcon>
      <Text size="sm">{feature}</Text>
    </Group>
  );

  return (
    <Stack gap="xs">
      {highlights.slice(0, splitAt).map(renderFeature)}
      {remaining.length > 0 && (
        <>
          <Collapse
            id={detailsId}
            in={expanded}
            transitionDuration={reducedMotion ? 0 : 320}
            transitionTimingFunction="cubic-bezier(.2, .75, .25, 1)"
          >
            <Stack gap="xs">{remaining.map(renderFeature)}</Stack>
          </Collapse>
          <button
            type="button"
            className="lp-pricing-toggle"
            aria-expanded={expanded}
            aria-controls={detailsId}
            aria-label={`${expanded ? "Show less" : "Show more"} for all plans`}
            onClick={onToggle}
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        </>
      )}
    </Stack>
  );
}
