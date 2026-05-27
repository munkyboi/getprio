import { Group, Image, Text } from "@mantine/core";

export default function BrandMark() {
  return (
    <Group gap="sm" wrap="nowrap">
      <Image alt="GetPrio logo" className="finazze-brand-mark" src="/brand/getprio-mark.svg" />
      <div>
        <Text fw={900} lh={1}>GetPrio</Text>
      </div>
    </Group>
  );
}
