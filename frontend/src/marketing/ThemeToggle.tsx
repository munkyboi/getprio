import { IconMoon, IconSun } from "@tabler/icons-react";
import { Button } from "@vendor/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@vendor/components/ui/tooltip";
import { usePublicTheme } from "../surfaces/PublicTheme";

export default function ThemeToggle() {
  const state = usePublicTheme();
  if (!state) return null;
  const label = `Switch to ${state.theme === "light" ? "dark" : "light"} mode`;
  return <Tooltip><TooltipTrigger render={<Button className="public-theme-toggle" size="icon" variant="ghost" aria-label={label} onClick={state.toggleTheme} />}>
    {state.theme === "light" ? <IconMoon aria-hidden="true" /> : <IconSun aria-hidden="true" />}
  </TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>;
}
