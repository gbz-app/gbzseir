"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useTheme, type ThemePreference } from "./theme-provider";

const OPTIONS: Array<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
  { value: "light", label: "Açık", icon: Sun },
  { value: "dark", label: "Koyu", icon: Moon },
  { value: "system", label: "Sistem", icon: Monitor },
];

/**
 * Theme switch stored in localStorage ('gebzem.theme').
 * variant 'segmented' (settings page) or 'icon' (cycles light -> dark -> system).
 */
export function ThemeToggle({ variant = "segmented", className }: { variant?: "segmented" | "icon"; className?: string }) {
  const { theme, resolvedTheme, setTheme } = useTheme();

  if (variant === "icon") {
    const next: ThemePreference = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
    const Icon = theme === "system" ? Monitor : resolvedTheme === "dark" ? Moon : Sun;
    return (
      <Button variant="ghost" size="icon" className={cn("rounded-full", className)} onClick={() => setTheme(next)} aria-label="Temayı değiştir">
        <Icon />
      </Button>
    );
  }

  return (
    <div role="radiogroup" aria-label="Tema" className={cn("grid grid-cols-3 gap-1 rounded-2xl bg-muted p-1", className)}>
      {OPTIONS.map((o) => {
        const active = theme === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(o.value)}
            className={cn(
              "flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              active ? "bg-card text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <o.icon className="size-4" aria-hidden />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
