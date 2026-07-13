import type { CSSProperties } from "react";
import type { PublicBoardThemeSettings } from "@shared";

export function buildVendorThemeStyle(theme?: PublicBoardThemeSettings | null): CSSProperties | undefined {
  if (!theme) {
    return undefined;
  }

  return {
    "--vendor-theme-page-bg": theme.pageBackgroundColor,
    "--vendor-theme-card-bg": theme.cardBackgroundColor,
    "--vendor-theme-card-alpha": String(theme.cardAlpha),
    "--vendor-theme-card-border": theme.cardBorderColor,
    "--vendor-theme-header": theme.headerColor,
    "--vendor-theme-subheader": theme.subheaderColor,
    "--vendor-theme-body": theme.bodyColor,
    "--vendor-theme-button-bg": theme.buttonBackgroundColor,
    "--vendor-theme-button-text": theme.buttonTextColor,
    "--vendor-theme-button-border": theme.buttonBorderColor,
    "--vendor-theme-pill-primary-bg": theme.buttonBackgroundColor,
    "--vendor-theme-pill-primary-text": theme.buttonTextColor,
    "--vendor-theme-pill-secondary-bg": theme.subheaderColor,
    "--vendor-theme-pill-secondary-text": theme.pageBackgroundColor,
    "--vendor-theme-pill-muted-bg": theme.bodyColor,
    "--vendor-theme-pill-muted-text": theme.pageBackgroundColor,
    "--vendor-theme-button-border-width": theme.presetId === "sports" ? "0px" : "1px",
    "--vendor-theme-logo-bg": theme.cardBackgroundColor,
    ...(theme.pageBackgroundImageUrl
      ? {
          "--vendor-theme-page-image": `url(${theme.pageBackgroundImageUrl})`,
          "--vendor-theme-page-image-position": "center",
          "--vendor-theme-page-image-repeat": "no-repeat",
          "--vendor-theme-page-image-size": theme.pageBackgroundImageFit
        }
      : {})
  } as CSSProperties;
}

export function buildVendorThemeMediaStyle(theme?: PublicBoardThemeSettings | null): CSSProperties | undefined {
  if (!theme?.backgroundImageUrl) {
    return undefined;
  }

  return {
    backgroundImage: `linear-gradient(rgba(255,255,255,0.08), rgba(255,255,255,0.08)), url(${theme.backgroundImageUrl})`,
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    backgroundSize: theme.backgroundImageFit
  };
}
