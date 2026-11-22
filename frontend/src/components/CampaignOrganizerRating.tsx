import { Group, Text } from "@mantine/core";
import { IconStar } from "@tabler/icons-react";

type OrganizerTrustRating = {
  average: number;
  count: number;
};

export default function CampaignOrganizerRating({
  rating
}: {
  rating?: OrganizerTrustRating | null;
}) {
  return rating?.count ? (
    <Group aria-label={`${rating.average.toFixed(1)} from ${rating.count} organizer ratings`} gap={6} wrap="nowrap">
      <IconStar aria-hidden="true" color="#ffd000" fill="#ffd000" size={20}/>
      <Text fw={900}>{rating.average.toFixed(1)}</Text>
      <Text className="campaign-hero-secondary" size="xs">({rating.count})</Text>
    </Group>
  ) : (
    <Group aria-label="Organizer not yet rated" gap={6} wrap="nowrap">
      <IconStar aria-hidden="true" color="var(--mantine-color-gray-4)" size={20}/>
      <Text className="campaign-hero-secondary" size="sm">Not yet rated</Text>
    </Group>
  );
}
