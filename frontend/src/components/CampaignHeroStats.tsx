import { Card, SimpleGrid, Text } from "@mantine/core";
import CampaignContributorProgress from "./CampaignContributorProgress";
import {
  formatCampaignHeroDeadline,
  formatCampaignHeroScheduleDate,
  formatCampaignHeroScheduleSummary
} from "../utils/campaignHero";

type CampaignHeroStatsProps = {
  acceptedContributors: number;
  currency?: string;
  deadlineAt: string | Date;
  joinFeeCents: number;
  requiredContributors: number;
  reservedContributors: number;
  scheduledEndAt?: string | Date;
  scheduledStartAt?: string | Date;
  timeZone?: string;
  underReviewContributors: number;
};

function money(cents: number, currency = "PHP") {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency }).format(cents / 100);
}

export default function CampaignHeroStats({
  acceptedContributors,
  currency,
  deadlineAt,
  joinFeeCents,
  requiredContributors,
  reservedContributors,
  scheduledEndAt,
  scheduledStartAt,
  timeZone,
  underReviewContributors
}: CampaignHeroStatsProps) {
  return (
    <SimpleGrid cols={{ base: 1, md: 3 }}>
      <Card className="campaign-hero-stat">
        <Text size="xs">Join fee</Text>
        <Text fw={800}>{money(joinFeeCents, currency)}</Text>
        <Text className="campaign-hero-secondary" size="xs">
          Deadline: {formatCampaignHeroDeadline(deadlineAt, timeZone)}
        </Text>
      </Card>
      <Card className="campaign-hero-stat">
        <Text size="xs">Schedule</Text>
        <Text fw={800}>{formatCampaignHeroScheduleDate(scheduledStartAt, timeZone) || "Date unavailable"}</Text>
        <Text className="campaign-hero-secondary" size="xs">
          {formatCampaignHeroScheduleSummary(scheduledStartAt, scheduledEndAt, timeZone) || "Time unavailable"}
        </Text>
      </Card>
      <CampaignContributorProgress
        acceptedContributors={acceptedContributors}
        requiredContributors={requiredContributors}
        reservedContributors={reservedContributors}
        underReviewContributors={underReviewContributors}
      />
    </SimpleGrid>
  );
}
