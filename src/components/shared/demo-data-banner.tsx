import { FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";

export type DemoDataBannerProps = {
  title?: string;
  /** Explanation (default: prototype sample data notice). */
  children?: React.ReactNode;
  compact?: boolean;
  className?: string;
};

/** Clearly labelled amber banner for demo / sample data ("Örnek veri"). Server-safe. */
export function DemoDataBanner({ title = "Örnek veri", children, compact, className }: DemoDataBannerProps) {
  return (
    <div
      role="note"
      className={cn(
        "flex items-start gap-3 rounded-2xl border border-dashed border-highlight/60 bg-highlight-soft text-highlight-foreground dark:text-foreground",
        compact ? "px-3 py-2 text-xs" : "px-4 py-3 text-sm",
        className,
      )}
    >
      <FlaskConical className={cn("mt-0.5 shrink-0 text-highlight", compact ? "size-4" : "size-5")} aria-hidden />
      <div className="min-w-0">
        <p className="font-bold">{title}</p>
        <p className="mt-0.5 leading-relaxed opacity-90">
          {children ?? "Bu bölümdeki bilgiler prototip için hazırlanmış örnek verilerdir, gerçek değildir."}
        </p>
      </div>
    </div>
  );
}
