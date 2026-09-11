import Link from "next/link";
import { BookOpen, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { routes } from "@/core/routes";

/**
 * Compact "Şehir rehberi" card floating on the /yakinimda map, just under the chip row. Place it at z-20 (the chip
 * overlay's layer, above the map) and below the list sheet (z-30), so a fully opened sheet covers it. Server-safe.
 */
export function GuideEntryPill({ className }: { className?: string }) {
  return (
    <Link
      href={routes.guide.root()}
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-full bg-card pr-3 pl-1.5 text-sm font-semibold text-foreground outline-none transition-transform focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.98]",
        className,
      )}
    >
      <span className="flex size-7 items-center justify-center rounded-full bg-brand-soft text-primary">
        <BookOpen className="size-4" aria-hidden />
      </span>
      Şehir rehberi
      <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
    </Link>
  );
}
