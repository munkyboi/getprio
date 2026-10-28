import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { appUrl, safeSurfaceNext } from "./surfaceConfig";

export const publicUniversalAuthEnabled = import.meta.env.VITE_PUBLIC_UNIVERSAL_AUTH === "1";
export function publicAuthEntry(surface: "customer" | "vendor", mode: "login" | "register", search = "") {
  const original = new URLSearchParams(search);
  const params = new URLSearchParams();
  params.set("app", surface);
  if (original.has("next")) params.set("next", safeSurfaceNext(original.get("next"), surface));
  for (const key of ["reset", "passwordChanged", "oauthError"]) if (original.has(key)) params.set(key, original.get(key) || "");
  // Existing recovery links remain app-owned until their purpose is migrated.
  return appUrl("marketing", `/${mode}?${params.toString()}`);
}
export default function PublicAuthRedirect({ surface, mode }: { surface: "customer" | "vendor"; mode: "login" | "register" }) {
  const location = useLocation();
  const destination = publicAuthEntry(surface, mode, location.search);
  useEffect(() => { window.location.replace(destination); }, [destination]);
  return <p role="status">Opening GetPrio sign-in… <a href={destination}>Continue</a></p>;
}
