import { useState, useEffect, useCallback } from "react";

export type ThemeMode = "system" | "dark" | "light";

export function useTheme(
  initialTheme: string = "system",
  onSave?: (theme: string) => void
) {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const queryTheme = params.get("theme") as ThemeMode | null;
      if (queryTheme && ["system", "dark", "light"].includes(queryTheme)) {
        return queryTheme;
      }
      const saved = localStorage.getItem("openlearn_theme") as ThemeMode | null;
      if (saved && ["system", "dark", "light"].includes(saved)) {
        return saved;
      }
    }
    return (initialTheme as ThemeMode) || "system";
  });

  const [resolvedTheme, setResolvedTheme] = useState<"dark" | "light">("dark");

  const applyTheme = useCallback((mode: ThemeMode) => {
    if (typeof window === "undefined") return;
    const isDark =
      mode === "dark" ||
      (mode === "system" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);

    if (isDark) {
      document.documentElement.classList.add("dark");
      setResolvedTheme("dark");
    } else {
      document.documentElement.classList.remove("dark");
      setResolvedTheme("light");
    }
  }, []);

  useEffect(() => {
    applyTheme(theme);
    if (typeof window !== "undefined") {
      localStorage.setItem("openlearn_theme", theme);
    }

    if (theme === "system" && typeof window !== "undefined") {
      const media = window.matchMedia("(prefers-color-scheme: dark)");
      const listener = () => applyTheme("system");
      media.addEventListener("change", listener);
      return () => media.removeEventListener("change", listener);
    }
  }, [theme, applyTheme]);

  const setTheme = useCallback(
    (mode: ThemeMode) => {
      setThemeState(mode);
      applyTheme(mode);
      onSave?.(mode);
    },
    [applyTheme, onSave]
  );

  const toggleTheme = useCallback(() => {
    // If currently dark, switch to light; otherwise dark
    const next: ThemeMode = resolvedTheme === "dark" ? "light" : "dark";
    setTheme(next);
  }, [resolvedTheme, setTheme]);

  return {
    theme,
    resolvedTheme,
    setTheme,
    toggleTheme,
  };
}
