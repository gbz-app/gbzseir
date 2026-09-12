"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { canGoBack } from "@/lib/navigation-history";
import type { FavoriteTargetType } from "@/lib/db-contract";
import { HideBottomNav } from "@/components/layout/nav-visibility";
import { BottomDock } from "./bottom-dock";
import { FavoriteButton } from "./favorite-button";
import { ShareButton } from "./share-button";

/** Round translucent (blurred) button on top of the hero photos. */
const OVERLAY_BUTTON =
  "flex size-11 shrink-0 items-center justify-center rounded-full border-0 bg-white/35 text-foreground shadow-none backdrop-blur-md transition-colors outline-none hover:bg-white/50 focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-black/35 dark:text-white dark:hover:bg-black/50";

export type DetailHeroProps = {
  /** Photos (cover first). Empty = gradient placeholder with `fallbackIcon`. */
  images: string[];
  alt: string;
  backHref?: string;
  shareTitle: string;
  shareText?: string;
  favorite?: { targetType: FavoriteTargetType; targetId: string };
  fallbackIcon?: React.ReactNode;
  /** Share button on the photo (default true; the news page puts it under the photo instead). */
  showShare?: boolean;
  /** Extra classes for the hero box (e.g. a different height). */
  className?: string;
};

/**
 * Full-bleed swipeable photo header of detail pages (firm, event) with back / share / favorite buttons on top.
 * The page content follows in a sheet that overlaps the bottom edge (`-mt-8 rounded-t-card`). Hides the bottom nav.
 */
export function DetailHero({ images, alt, backHref = "/", shareTitle, shareText, favorite, fallbackIcon, showShare = true, className }: DetailHeroProps) {
  const router = useRouter();
  const scroller = React.useRef<HTMLDivElement>(null);
  const [index, setIndex] = React.useState(0);

  const onScroll = () => {
    const el = scroller.current;
    if (!el || !el.clientWidth) return;
    setIndex(Math.round(el.scrollLeft / el.clientWidth));
  };

  return (
    <div className={cn("relative h-[min(52vh,26rem)] min-h-72 w-full overflow-hidden bg-muted", className)}>
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
          <ArrowLeft className="size-5" strokeWidth={2} />
        </button>
        <div className="flex items-center gap-2">
          {showShare ? <ShareButton title={shareTitle} text={shareText} iconOnly variant="secondary" label="Paylaş" className={OVERLAY_BUTTON} /> : null}
          {/* "ghost" (not "overlay"): its only background is hover:bg-muted, which OVERLAY_BUTTON overrides; overlay's shadow-soft would survive the merge. */}
          {favorite ? <FavoriteButton targetType={favorite.targetType} targetId={favorite.targetId} variant="ghost" className={OVERLAY_BUTTON} /> : null}
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
  return <div className={cn("relative z-10 -mt-8 rounded-t-card bg-background px-5 pt-6", className)}>{children}</div>;
}

/** Fixed bottom action area of detail pages (primary black CTA + secondary buttons) in the shared BottomDock. */
export function DetailActions({ children }: { children: React.ReactNode }) {
  return (
    <BottomDock>
      <div className="flex items-center gap-2">{children}</div>
    </BottomDock>
  );
}

/** Class for the big black primary CTA ("Ara"). */
export const PRIMARY_CTA = "h-14 flex-1 rounded-full bg-foreground text-base font-semibold text-background hover:bg-foreground/90 [&_svg]:size-5";
/** Class for round secondary buttons next to the CTA. */
export const SECONDARY_CTA = "size-14 shrink-0 rounded-full";
