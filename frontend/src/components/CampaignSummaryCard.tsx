import { Avatar, Badge, Button, Card, Group, Stack, Text, Title } from "@mantine/core";
import { IconStar } from "@tabler/icons-react";
import { Link } from "react-router-dom";
import type { OrganizerCampaign, OrganizerCampaignStatus, PublicOrganizerCampaign } from "@shared";
import RichCampaignDescription from "./RichCampaignDescription";
import CampaignFundingProgress from "./CampaignFundingProgress";
import { formatBookingScheduleTimeRange } from "../utils/dates";

const CAMPAIGN_STATUS_PRESENTATION: Record<OrganizerCampaignStatus, { color: string; label: string }> = {
  draft: { color: "gray", label: "Draft" },
  collecting: { color: "orange", label: "Collecting" },
  collected: { color: "teal", label: "Collected" },
  refund_pending: { color: "yellow", label: "Refund pending" },
  cancelled: { color: "red", label: "Cancelled" },
  frozen: { color: "indigo", label: "Frozen" }
};

type CampaignSummary = OrganizerCampaign | PublicOrganizerCampaign;

function money(cents: number, currency = "PHP") {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency }).format(cents / 100);
}

function getInitials(value = "") {
  return value.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("") || "U";
}

function formatCampaignListDate(value: string | Date, timeZone = "Asia/Manila") {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone
  }).format(new Date(value));
}

function formatCampaignDuration(startValue?: string | Date, endValue?: string | Date) {
  if (!startValue || !endValue) return "";
  const durationMinutes = Math.max(0, Math.round((new Date(endValue).getTime() - new Date(startValue).getTime()) / 60000));
  if (!durationMinutes) return "";
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  if (!minutes) return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  if (!hours) return `${minutes} minutes`;
  return `${hours}h ${minutes}m`;
}

export default function CampaignSummaryCard({
  action,
  campaign,
  descriptionClassName = "campaign-list-description",
  to
}: {
  action?: { label: string; to: string };
  campaign: CampaignSummary;
  descriptionClassName?: string;
  to?: string;
}) {
  const status = CAMPAIGN_STATUS_PRESENTATION[campaign.status];
  const confirmedContributors = campaign.acceptedContributors ?? 0;
  const reservedContributors = (campaign.reservedContributors ?? 0) + (campaign.underReviewContributors ?? 0);
  const fundingTargetCents = campaign.requiredContributors * campaign.contributionFeeCents;
  const fundedAmountCents = "acceptedAmountCents" in campaign
    ? campaign.acceptedAmountCents ?? confirmedContributors * campaign.contributionFeeCents
    : confirmedContributors * campaign.contributionFeeCents;
  const rating = campaign.organizerTrustRating;
  const timeZone = campaign.location?.timezone || "Asia/Manila";
  const scheduleDuration = formatCampaignDuration(campaign.scheduledStartAt, campaign.scheduledEndAt);
  const scheduleTime = campaign.scheduledStartAt && campaign.scheduledEndAt
    ? `${formatBookingScheduleTimeRange(campaign.scheduledStartAt, campaign.scheduledEndAt, timeZone)}${scheduleDuration ? ` (${scheduleDuration})` : ""}`
    : "Time unavailable";

  const content = (
    <Stack className="campaign-summary-card__content" gap="sm">
      <Group justify="space-between" wrap="nowrap">
        <Badge color={status.color} radius="xl" tt="uppercase" variant="filled">{status.label}</Badge>
        <Text fw={800}>{money(campaign.contributionFeeCents, campaign.currency)}</Text>
      </Group>
      <Title order={3}>{campaign.title}</Title>
      <Group className="campaign-list-organizer" gap="xs" wrap="nowrap">
        <Avatar alt={`${campaign.organizerDisplayName || "Organizer"} profile photo`} color="orange" radius="xl" size={30} src={campaign.organizerAvatarUrl || undefined}>{getInitials(campaign.organizerDisplayName || "Organizer")}</Avatar>
        <Group gap={6} wrap="wrap">
          <Text size="sm">Organized by <Text component="span" fw={800}>{campaign.organizerDisplayName || "Organizer"}</Text></Text>
          <Text aria-hidden="true" c="dimmed" size="sm">|</Text>
          {rating?.count ? <Group gap={4} wrap="nowrap"><IconStar aria-hidden="true" color="#ffd000" fill="#ffd000" size={15}/><Text size="sm">{rating.average.toFixed(1)} ({rating.count})</Text></Group> : <Group gap={4} wrap="nowrap"><IconStar aria-hidden="true" color="var(--mantine-color-gray-5)" size={15}/><Text c="dimmed" size="sm">No rating yet</Text></Group>}
        </Group>
      </Group>
      {campaign.description ? <RichCampaignDescription className={descriptionClassName} content={campaign.description}/> : null}
      <CampaignFundingProgress
        className="campaign-list-progress"
        fundedAmountCents={fundedAmountCents}
        radius="xs"
        size={7}
        targetAmountCents={fundingTargetCents}
      />
      <div className="campaign-list-facts">
        <div className="campaign-list-fact"><Text c="dimmed" size="xs">Location</Text><Text fw={700} size="sm">{campaign.vendor?.name && campaign.location?.name ? `${campaign.vendor.name} - ${campaign.location.name}` : "Location unavailable"}</Text><Text c="dimmed" size="xs">{[campaign.location?.city, campaign.location?.province].filter(Boolean).join(", ") || "Address unavailable"}</Text></div>
        <div className="campaign-list-fact"><Text c="dimmed" size="xs">Schedule</Text><Text fw={700} size="sm">{campaign.scheduledStartAt ? formatCampaignListDate(campaign.scheduledStartAt, timeZone) : "Date unavailable"}</Text><Text c="dimmed" size="xs">{scheduleTime}</Text></div>
        <div className="campaign-list-fact"><Text c="dimmed" size="xs">Contributors</Text><Text fw={700} size="sm">{confirmedContributors}/{campaign.requiredContributors} Confirmed</Text><Text c="dimmed" size="xs">{reservedContributors} Reserved</Text></div>
      </div>
      {action ? <Button className="campaign-discovery-cta" component={Link} to={action.to}>{action.label}</Button> : null}
    </Stack>
  );

  if (to) {
    return <Card component={Link} className="campaign-list-card campaign-summary-card" p="lg" to={to}>{content}</Card>;
  }

  return <Card className="campaign-list-card campaign-summary-card" p="lg">{content}</Card>;
}
