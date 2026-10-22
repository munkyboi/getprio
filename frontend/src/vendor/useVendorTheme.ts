import { useCallback, useEffect, useState } from "react";
import { readPreference, savePreference } from "./workspace";
const themeKey = "getprio.vendor.theme";
export function useVendorTheme() {
  const [theme, setCurrentTheme] = useState<"light" | "dark">(() => {
    const saved = readPreference(themeKey);
    return saved === "dark" || saved === "light"
      ? saved
      : window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
  });
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const change = () => {
      const saved = readPreference(themeKey);
      if (saved !== "dark" && saved !== "light")
        setCurrentTheme(media.matches ? "dark" : "light");
    };
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  const setTheme = useCallback((next: "light" | "dark") => {
    savePreference(themeKey, next);
    setCurrentTheme(next);
  }, []);
  return { theme, setTheme };
}
