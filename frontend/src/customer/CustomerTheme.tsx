import {
  createContext,
  useContext,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";

export const CUSTOMER_THEME_KEY = "getprio.customer.theme";
type Theme = "light" | "dark";
type Preference = Theme | "system";
export function readCustomerTheme(): Theme | null {
  try {
    const value = localStorage.getItem(CUSTOMER_THEME_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}
function readPreference(): Preference {
  try {
    return localStorage.getItem(CUSTOMER_THEME_KEY) === "system"
      ? "system"
      : readCustomerTheme() || "system";
  } catch {
    return "system";
  }
}
const Context = createContext<{
  theme: Theme;
  preference: Preference;
  setPreference: (preference: Preference) => void;
  toggleTheme: () => void;
}>({
  theme: "light",
  preference: "system",
  setPreference: () => {},
  toggleTheme: () => {},
});
export const useCustomerTheme = () => useContext(Context);

export default function CustomerTheme({
  children,
}: {
  children: ReactNode;
}) {
  const [preference, setPreferenceState] = useState<Preference>(readPreference);
  const [theme, setTheme] = useState<Theme>(
    () =>
      readCustomerTheme() ||
      (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
  );
  useLayoutEffect(() => {
    const root = document.documentElement;
    const previous = root.getAttribute("data-customer-theme");
    root.setAttribute("data-customer-theme", theme);
    return () => {
      if (previous) root.setAttribute("data-customer-theme", previous);
      else root.removeAttribute("data-customer-theme");
    };
  }, [theme]);
  useLayoutEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      setPreferenceState(readPreference());
      setTheme(readCustomerTheme() || (media.matches ? "dark" : "light"));
    };
    const storage = (event: StorageEvent) => {
      if (event.key === CUSTOMER_THEME_KEY || event.key === null) update();
    };
    media.addEventListener("change", update);
    window.addEventListener("storage", storage);
    return () => {
      media.removeEventListener("change", update);
      window.removeEventListener("storage", storage);
    };
  }, []);
  const setPreference = (next: Preference) => {
    try {
      localStorage.setItem(CUSTOMER_THEME_KEY, next);
    } catch {
      /* Continue for this session. */
    }
    setPreferenceState(next);
    setTheme(
      next === "system"
        ? matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : next,
    );
  };
  const toggleTheme = () => setPreference(theme === "light" ? "dark" : "light");
  return (
    <Context.Provider value={{ theme, preference, setPreference, toggleTheme }}>
      {children}
    </Context.Provider>
  );
}
