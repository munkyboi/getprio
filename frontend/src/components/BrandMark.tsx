import { Group, Text } from "@mantine/core";

export default function BrandMark() {
  return (
    <Group gap="sm" wrap="nowrap">
      <img className="getprio-brand-logo" src="/logo.svg" alt="" aria-hidden="true" />
      <div>
        <Text fw={900} lh={1}>GetPrio</Text>
      </div>
    </Group>
  );
}
