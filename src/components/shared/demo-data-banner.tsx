import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

export type DemoDataBannerProps = {
  /** Optional bold lead-in, shown inline before the text. */
  title?: string;
  /** The notice itself (one short sentence). */
  children: React.ReactNode;
  compact?: boolean;
  /** "danger": a soft red tint, for the nöbetçi screens (which never use yellow). Default: soft amber. */
  tone?: "highlight" | "danger";
  className?: string;
};

const TONES = {
  highlight: { box: "bg-highlight-soft text-highlight-foreground dark:text-foreground", icon: "text-highlight" },
  danger: { box: "bg-red-50 text-red-800 dark:bg-red-500/10 dark:text-red-200", icon: "text-red-600 dark:text-red-400" },
} as const;

/**
 * One calm line for data people must not rely on (e.g. a sample on-duty pharmacy list, with the official link).
 * No "Örnek" label and no dashed frame: a soft tint and an info icon. Server-safe.
 */
export function DemoDataBanner({ title, children, compact, tone = "highlight", className }: DemoDataBannerProps) {
  const t = TONES[tone];
  return (
    <p role="note" className={cn("flex items-start gap-2 rounded-card leading-snug", t.box, compact ? "px-3 py-2 text-xs" : "px-3.5 py-2.5 text-[13px]", className)}>
      <Info className={cn("shrink-0", t.icon, compact ? "size-3.5" : "mt-px size-4")} aria-hidden />
      <span className="min-w-0">
        {title ? <strong className="font-semibold">{title}: </strong> : null}
        {children}
      </span>
    </p>
  );
}
