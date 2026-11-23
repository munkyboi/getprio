import type { AuthIntent } from "@shared";

export interface SocialAuthButtonsProps {
  intent: AuthIntent;
  iconOnly?: boolean;
  vendor?: boolean;
  disabled?: boolean;
  returnPath?: string;
}
