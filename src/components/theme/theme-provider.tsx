"use client";

import * as React from "react";
import { STORAGE_KEYS } from "@/config/site";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

type ThemeContextValue = {
  /** Stored preference. */
  theme: ThemePreference;
  /** Effective theme after resolving 'system'. */
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemePreference) => void;
};

const ThemeContext = React.createContext<ThemeContextValue | null>(null);
const listeners = new Set<() => void>();

function readPreference(): ThemePreference {
  try {
    const v = window.localStorage.getItem(STORAGE_KEYS.theme);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function systemIsDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    mq.removeEventListener("change", cb);
    window.removeEventListener("storage", cb);
  };
}

const getSnapshot = () => `${readPreference()}|${systemIsDark() ? "dark" : "light"}`;
const getServerSnapshot = () => "system|light";

function applyTheme(resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
}

/** Provides theme state; the pre-paint class is set by <ThemeScript/>. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const snapshot = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [pref, system] = snapshot.split("|") as [ThemePreference, ResolvedTheme];
  const resolvedTheme: ResolvedTheme = pref === "system" ? system : pref;

  // Re-apply after hydration / dev strict-mode remount and on every change.
  React.useLayoutEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  const setTheme = React.useCallback((next: ThemePreference) => {
    try {
      if (next === "system") window.localStorage.removeItem(STORAGE_KEYS.theme);
      else window.localStorage.setItem(STORAGE_KEYS.theme, next);
    } catch {
      /* storage unavailable: still apply for this session */
    }
    applyTheme(next === "system" ? (systemIsDark() ? "dark" : "light") : next);
    listeners.forEach((l) => l());
  }, []);

  const value = React.useMemo(() => ({ theme: pref, resolvedTheme, setTheme }), [pref, resolvedTheme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Read/change the theme. `theme` is 'system' during SSR and the first client render. */
export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
