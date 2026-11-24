import { useCustomerTheme } from "../../CustomerTheme";
import { useState } from "react";
import type { PublicBoardThemeSettings } from "@shared";
export function BusinessMedia({
  theme,
  name,
  variant = "pass",
}: {
  theme: PublicBoardThemeSettings | null;
  name: string;
  variant?: "pass" | "join";
}) {
  const [failedCover, setFailedCover] = useState("");
  const [failedLogo, setFailedLogo] = useState("");
  const { theme: mode } = useCustomerTheme();
  const fallback =
    mode === "dark"
      ? "/illustrations/generated/hero-queue-scene-transparent.png"
      : "/illustrations/generated/hero-queue-scene-transparent.png";
  const cover = theme?.backgroundImageUrl || fallback;
  const defaultLogo = mode === "dark" ? "/logo-dark.svg" : "/logo.svg";
  const logo = theme?.logoUrl || defaultLogo;
  return (
    <div className={variant === "pass" ? "booking-detail-hero" : "customer-detail-media"}>
      <div className="vendor-profile-cover" data-default={cover === fallback || failedCover === cover}>
      <img
        className={
          cover === fallback || failedCover === cover ? "is-default" : ""
        }
        src={failedCover === cover ? fallback : cover}
        alt=""
        onError={() => setFailedCover(cover)}
      /></div>
      <div className={variant === "pass" ? "vendor-profile-logo" : "customer-detail-logo"} data-vendor-logo={Boolean(theme?.logoUrl && failedLogo !== logo)} data-logo-fit={theme?.logoUrl && failedLogo !== logo && theme.logoFit === "cover" ? "cover" : "contain"}>
        <img
          src={failedLogo === logo ? defaultLogo : logo}
          alt={`${name} logo`}
          onError={() => setFailedLogo(logo)}
        />
      </div>
    </div>
  );
}
