import { useEffect, useState } from "react";

export type ThemeMode = "light" | "system" | "dark";
export type ResolvedTheme = "light" | "dark";

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useTheme() {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem("synapse_theme_mode");
    if (saved === "light" || saved === "dark" || saved === "system") return saved;
    const legacy = localStorage.getItem("synapse_theme");
    if (legacy === "light" || legacy === "dark") return legacy;
    return "system";
  });

  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? "dark" : "light");
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const resolvedTheme: ResolvedTheme =
    themeMode === "system" ? systemTheme : themeMode;

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolvedTheme);
    localStorage.setItem("synapse_theme_mode", themeMode);
    localStorage.setItem("synapse_theme", resolvedTheme);
  }, [themeMode, resolvedTheme]);

  useEffect(() => {
    const handleGlobalToggle = () => {
      setThemeModeState((prev) => {
        const next: ThemeMode = prev === "dark" ? "light" : "dark";
        return next;
      });
    };
    const handleModeChange = (e: CustomEvent<ThemeMode>) => {
      if (e.detail) setThemeModeState(e.detail);
    };
    window.addEventListener("synapse:toggle-theme", handleGlobalToggle);
    window.addEventListener("synapse:set-theme-mode" as any, handleModeChange as any);
    return () => {
      window.removeEventListener("synapse:toggle-theme", handleGlobalToggle);
      window.removeEventListener("synapse:set-theme-mode" as any, handleModeChange as any);
    };
  }, []);

  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
    window.dispatchEvent(new CustomEvent("synapse:set-theme-mode", { detail: mode }));
  };

  const toggle = () => {
    setThemeMode(resolvedTheme === "dark" ? "light" : "dark");
  };

  return {
    theme: resolvedTheme,
    themeMode,
    setThemeMode,
    toggle,
  };
}

