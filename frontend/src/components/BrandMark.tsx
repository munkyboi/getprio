import { Group, Text } from "@mantine/core";
import { useVendorTheme } from "../vendor/useVendorTheme";

export default function BrandMark() {
  const { theme } = useVendorTheme();
  return (
    <Group gap="sm" wrap="nowrap" align="center">
      <img className="getprio-brand-logo" src={theme === "dark" ? "/logo-dark.svg" : "/logo.svg"} alt="" aria-hidden="true" />
      <Text fw={900} lh={1}>
        GetPrio
      </Text>
    </Group>
  );
}
