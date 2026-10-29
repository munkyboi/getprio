import { ActionIcon, Tooltip } from "@mantine/core";
import { IconMoon, IconSun } from "@tabler/icons-react";
import { usePublicTheme } from "./PublicTheme";

export default function PublicThemeToggle() {
  const theme = usePublicTheme();
  if (!theme) return null;
  const label = `Switch to ${theme.theme === "light" ? "dark" : "light"} mode`;
  return <Tooltip label={label} events={{ hover: true, focus: true, touch: false }}>
    <ActionIcon className="public-theme-toggle" variant="subtle" size={44} radius="md" aria-label={label} onClick={theme.toggleTheme}>
      {theme.theme === "light" ? <IconMoon size={20} aria-hidden="true" /> : <IconSun size={20} aria-hidden="true" />}
    </ActionIcon>
  </Tooltip>;
}
