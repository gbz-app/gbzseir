import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

export type DemoDataBannerProps = {
  /** Optional bold lead-in, shown inline before the text. */
  title?: string;
  /** The notice itself (one short sentence). */
  children: React.ReactNode;
  compact?: boolean;
  className?: string;
};

/**
 * One calm line for data people must not rely on (e.g. a sample on-duty pharmacy list, with the official link).
 * No "Örnek" label and no dashed frame: a soft amber tint and an info icon. Server-safe.
 */
export function DemoDataBanner({ title, children, compact, className }: DemoDataBannerProps) {
  return (
    <p
      role="note"
      className={cn(
        "flex items-start gap-2 rounded-card bg-highlight-soft leading-snug text-highlight-foreground dark:text-foreground",
        compact ? "px-3 py-2 text-xs" : "px-3.5 py-2.5 text-[13px]",
        className,
      )}
    >
      <Info className={cn("shrink-0 text-highlight", compact ? "size-3.5" : "mt-px size-4")} aria-hidden />
      <span className="min-w-0">
        {title ? <strong className="font-semibold">{title}: </strong> : null}
        {children}
      </span>
    </p>
  );
}
