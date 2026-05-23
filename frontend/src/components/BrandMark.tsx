import { Box, Group, Text } from "@mantine/core";

export default function BrandMark() {
  return (
    <Group gap="sm" wrap="nowrap">
      <Box className="finazze-brand-mark">G</Box>
      <div>
        <Text fw={900} lh={1}>GetPrio</Text>
      </div>
    </Group>
  );
}
