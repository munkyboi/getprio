import { Progress, Stack, Text } from "@mantine/core";
import { getCampaignFundingPercent } from "../utils/campaignFunding";

type CampaignFundingProgressProps = {
  className?: string;
  color?: string;
  fundedAmountCents: number;
  radius?: string | number;
  size?: string | number;
  targetAmountCents: number;
};

export default function CampaignFundingProgress({
  className,
  color = "orange",
  fundedAmountCents,
  radius = "xl",
  size = "md",
  targetAmountCents
}: CampaignFundingProgressProps) {
  const fundingPercent = getCampaignFundingPercent(fundedAmountCents, targetAmountCents);

  return (
    <Stack className={className} gap={4}>
      <Progress
        aria-label={`Campaign funding ${fundingPercent}%`}
        color={color}
        radius={radius}
        size={size}
        value={fundingPercent}
      />
      <Text fw={700} size="xs" ta="right">
        Funding: {fundingPercent}%
      </Text>
    </Stack>
  );
}
