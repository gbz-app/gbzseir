"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { canGoBack } from "@/lib/navigation-history";
import type { FavoriteTargetType } from "@/lib/db-contract";
import { HideBottomNav } from "@/components/layout/nav-visibility";
import { FavoriteButton } from "./favorite-button";
import { ShareButton } from "./share-button";

const OVERLAY_BUTTON =
  "flex size-11 shrink-0 items-center justify-center rounded-full bg-white/90 text-foreground shadow-soft backdrop-blur transition-colors outline-none hover:bg-white focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-black/60 dark:text-white dark:hover:bg-black/70";

export type DetailHeroProps = {
  /** Photos (cover first). Empty = gradient placeholder with `fallbackIcon`. */
  images: string[];
  alt: string;
  backHref?: string;
  shareTitle: string;
  shareText?: string;
  favorite?: { targetType: FavoriteTargetType; targetId: string };
  fallbackIcon?: React.ReactNode;
};

/**
 * Full-bleed swipeable photo header of detail pages (firm, event) with back / share / favorite buttons on top.
 * The page content follows in a sheet that overlaps the bottom edge (`-mt-8 rounded-t-[2rem]`). Hides the bottom nav.
 */
export function DetailHero({ images, alt, backHref = "/", shareTitle, shareText, favorite, fallbackIcon }: DetailHeroProps) {
  const router = useRouter();
  const scroller = React.useRef<HTMLDivElement>(null);
  const [index, setIndex] = React.useState(0);

  const onScroll = () => {
    const el = scroller.current;
    if (!el || !el.clientWidth) return;
    setIndex(Math.round(el.scrollLeft / el.clientWidth));
  };

  return (
    <div className="relative h-[min(52vh,26rem)] min-h-72 w-full overflow-hidden bg-muted">
      <HideBottomNav />
      {images.length ? (
        <div ref={scroller} onScroll={onScroll} className="no-scrollbar flex h-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain">
          {images.map((src, i) => (
            <div key={src + i} className="relative h-full w-full shrink-0 snap-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={i === 0 ? alt : `${alt} fotoğraf ${i + 1}`}
                loading={i === 0 ? "eager" : "lazy"}
                fetchPriority={i === 0 ? "high" : undefined}
                decoding="async"
                className="size-full object-cover"
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex h-full items-center justify-center bg-linear-to-br from-brand-soft via-muted to-highlight-soft text-primary/40">
          {fallbackIcon ?? <ImageIcon className="size-16" strokeWidth={1.5} aria-hidden />}
        </div>
      )}

      <span className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-linear-to-b from-black/35 to-transparent" aria-hidden />

      <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 px-4 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)]">
        <button type="button" aria-label="Geri" className={OVERLAY_BUTTON} onClick={() => (canGoBack() ? router.back() : router.push(backHref))}>
          <ChevronLeft className="size-6" strokeWidth={1.75} />
        </button>
        <div className="flex items-center gap-2">
          <ShareButton title={shareTitle} text={shareText} iconOnly variant="secondary" label="Paylaş" className={cn(OVERLAY_BUTTON, "border-0")} />
          {favorite ? <FavoriteButton targetType={favorite.targetType} targetId={favorite.targetId} variant="overlay" /> : null}
        </div>
      </div>

      {images.length > 1 ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-12 flex justify-center gap-1.5" aria-hidden>
          {images.map((src, i) => (
            <span key={src + i} className={cn("h-1.5 rounded-full bg-white/70 transition-all", i === index ? "w-5 bg-white" : "w-1.5")} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** White sheet that overlaps the hero. */
export function DetailSheet({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("relative z-10 -mt-8 rounded-t-[2rem] bg-background px-5 pt-6", className)}>{children}</div>;
}

/** Fixed bottom action area of detail pages (primary black CTA + secondary buttons). */
export function DetailActions({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-2xl bg-linear-to-t from-background via-background/95 to-background/0 px-4 pt-6 pb-[calc(0.9rem+env(safe-area-inset-bottom,0px))]">
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

/** Class for the big black primary CTA ("Ara"). */
export const PRIMARY_CTA = "h-14 flex-1 rounded-full bg-foreground text-base font-semibold text-background hover:bg-foreground/90 [&_svg]:size-5";
/** Class for round secondary buttons next to the CTA. */
export const SECONDARY_CTA = "size-14 shrink-0 rounded-full";
