import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

/** 4.5 -> "4,5" (always one decimal). */
export function formatRating(value: number): string {
  return value.toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** "⭐ 4,5 (12)" or "Henüz yorum yok". Server-safe. */
export function RatingInline({
  avg,
  count,
  className,
  showCountLabel,
}: {
  avg: number;
  count: number;
  className?: string;
  /** "(12 yorum)" instead of "(12)". */
  showCountLabel?: boolean;
}) {
  if (!count) {
    return <span className={cn("text-xs font-medium text-muted-foreground", className)}>Henüz yorum yok</span>;
  }
  return (
    <span
      className={cn("inline-flex items-center gap-1 text-sm font-semibold tabular-nums", className)}
      aria-label={`5 üzerinden ${formatRating(avg)} puan, ${count} yorum`}
    >
      <Star className="size-4 fill-highlight text-highlight" aria-hidden />
      {formatRating(avg)}
      <span className="font-medium text-muted-foreground">({showCountLabel ? `${count} yorum` : count})</span>
    </span>
  );
}

/** Five stars filled up to `value` (rounded to the nearest half is not needed: reviews are whole numbers). */
export function Stars({ value, className, size = "sm" }: { value: number; className?: string; size?: "sm" | "md" }) {
  const rounded = Math.round(value);
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} role="img" aria-label={`5 üzerinden ${rounded} yıldız`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          aria-hidden
          className={cn(size === "md" ? "size-5" : "size-4", i < rounded ? "fill-highlight text-highlight" : "fill-muted text-muted-foreground/40")}
        />
      ))}
    </span>
  );
}
