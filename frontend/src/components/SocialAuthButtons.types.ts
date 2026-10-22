import type { AuthIntent } from "@shared";

export interface SocialAuthButtonsProps {
  intent: AuthIntent;
  returnPath?: string;
  iconOnly?: boolean;
  vendor?: boolean;
  disabled?: boolean;
}
