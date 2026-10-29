import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { PUBLIC_AUTH_THEME_KEY, readPublicAuthTheme, savePublicAuthTheme, type PublicAuthTheme } from "../pages/publicAuthTheme";
import { readPreference } from "../vendor/workspace";

type PublicThemeState = { theme: PublicAuthTheme; toggleTheme: () => void };
const PublicThemeContext = createContext<PublicThemeState | null>(null);
export const usePublicTheme = () => useContext(PublicThemeContext);

export function PublicThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<PublicAuthTheme>(readPublicAuthTheme);
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.dataset.publicTheme;
    const previousScheme = root.style.colorScheme;
    return () => { if (previous) root.dataset.publicTheme = previous; else delete root.dataset.publicTheme; root.style.colorScheme = previousScheme; };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.publicTheme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const systemChanged = () => {
      const saved = readPreference(PUBLIC_AUTH_THEME_KEY);
      if (saved !== "light" && saved !== "dark") setTheme(media.matches ? "dark" : "light");
    };
    const storageChanged = (event: StorageEvent) => {
      if (event.key === PUBLIC_AUTH_THEME_KEY || event.key === null) setTheme(readPublicAuthTheme());
    };
    media.addEventListener("change", systemChanged);
    window.addEventListener("storage", storageChanged);
    return () => { media.removeEventListener("change", systemChanged); window.removeEventListener("storage", storageChanged); };
  }, []);
  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    savePublicAuthTheme(next);
    setTheme(next);
  };
  return <PublicThemeContext.Provider value={{ theme, toggleTheme }}>{children}</PublicThemeContext.Provider>;
}
