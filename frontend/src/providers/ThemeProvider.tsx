import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import type { Theme } from "@/types/api";

const STORAGE_KEY = "myspace-theme";

interface ThemeContextValue {
  theme: Theme;
  resolved: "light" | "dark";
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    // Private browsing or blocked storage: fall back to the system setting.
  }
  return "system";
}

function systemPrefersDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);
  const [resolved, setResolved] = useState<"light" | "dark">(() =>
    readStoredTheme() === "system"
      ? systemPrefersDark()
        ? "dark"
        : "light"
      : (readStoredTheme() as "light" | "dark"),
  );

  const apply = useCallback((next: Theme) => {
    const dark = next === "dark" || (next === "system" && systemPrefersDark());
    document.documentElement.classList.toggle("dark", dark);
    setResolved(dark ? "dark" : "light");
  }, []);

  useEffect(() => {
    apply(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Preference is cosmetic; the account's stored theme is the source of truth.
    }
  }, [theme, apply]);

  // Follow the OS while the preference is "system".
  useEffect(() => {
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => apply("system");
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, [theme, apply]);

  const value = useMemo(
    () => ({ theme, resolved, setTheme: setThemeState }),
    [theme, resolved],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}
