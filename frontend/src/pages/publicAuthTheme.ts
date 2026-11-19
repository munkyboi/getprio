import { readPreference, savePreference } from "../vendor/workspace";

// Public login and registration share a preference without changing app themes.
export const PUBLIC_AUTH_THEME_KEY = "getprio.public.auth.theme";
export type PublicAuthTheme = "light" | "dark";

export function readPublicAuthTheme(): PublicAuthTheme {
  const saved = readPreference(PUBLIC_AUTH_THEME_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function savePublicAuthTheme(theme: PublicAuthTheme) {
  savePreference(PUBLIC_AUTH_THEME_KEY, theme);
}
