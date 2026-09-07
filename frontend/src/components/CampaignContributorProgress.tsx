import { Card, Group, RingProgress, Stack, Text } from "@mantine/core";

type CampaignContributorProgressProps = {
  acceptedContributors: number;
  requiredContributors: number;
  reservedContributors: number;
  underReviewContributors: number;
};

const CONFIRMED_COLOR = "var(--mantine-color-teal-5)";
const RESERVED_COLOR = "var(--mantine-color-blue-5)";
const AVAILABLE_COLOR = "rgba(255, 255, 255, 0.18)";
const SEPARATOR_COLOR = "rgba(8, 25, 30, 0.92)";
const SLOT_GAP_DEGREES = 5;

export default function CampaignContributorProgress({
  acceptedContributors,
  requiredContributors,
  reservedContributors,
  underReviewContributors
}: CampaignContributorProgressProps) {
  const total = Math.max(1, Math.floor(requiredContributors));
  const confirmed = Math.min(total, Math.max(0, Math.floor(acceptedContributors)));
  const reserved = Math.min(
    total - confirmed,
    Math.max(0, Math.floor(reservedContributors + underReviewContributors))
  );
  const occupied = confirmed + reserved;
  const slotValue = 100 / total;
  const requestedSeparatorValue = SLOT_GAP_DEGREES / 360 * 100;
  const separatorValue = Math.min(requestedSeparatorValue, slotValue * 0.8);
  const fillValue = slotValue - separatorValue;
  const sections = Array.from({ length: total }, (_, index) => {
    const color = index < confirmed
      ? CONFIRMED_COLOR
      : index < occupied
        ? RESERVED_COLOR
        : AVAILABLE_COLOR;

    return [
      { color, value: fillValue },
      { color: SEPARATOR_COLOR, value: separatorValue }
    ];
  }).flat();

  return (
    <Card className="campaign-contributor-progress campaign-hero-stat">
      <Group gap="md" justify="center" wrap="nowrap">
        <RingProgress
          aria-label={`${occupied} of ${total} contributor slots occupied: ${confirmed} confirmed and ${reserved} reserved`}
          label={<Text className="campaign-contributor-progress__total" ta="center">{occupied}/{total}</Text>}
          sections={sections}
          size={92}
          thickness={11}
        />
        <Stack className="campaign-contributor-progress__details" gap={1}>
          <Text className="campaign-contributor-progress__label">Contributors</Text>
          <Text className="campaign-contributor-progress__confirmed">{confirmed}/{total} Confirmed</Text>
          <Text className="campaign-contributor-progress__reserved" size="xs">{reserved} Reserved</Text>
        </Stack>
      </Group>
    </Card>
  );
}
