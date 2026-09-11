"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { notify } from "@/lib/notify";
import { canGoBack } from "@/lib/navigation-history";
import { HideBottomNav } from "@/components/layout/nav-visibility";
import { Button } from "@/components/ui/button";
import { FavoriteButton } from "@/components/shared/favorite-button";
import { ListingDetailMenu } from "./detail-actions";
import { logListingShare } from "./stats/log-share";

/** Round translucent (blurred) button on top of the hero, as on the firm page. */
export const HERO_BUTTON =
  "flex size-11 shrink-0 items-center justify-center rounded-full border-0 bg-white/35 text-foreground shadow-none backdrop-blur-md transition-colors outline-none hover:bg-white/50 focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-black/35 dark:text-white dark:hover:bg-black/50";

export type ListingHeroBarProps = {
  listingId: string;
  ownerId: string;
  /** Share title. */
  title: string;
  /** Where "Geri" goes without in-app history. */
  backHref: string;
  editHref: string | null;
  manageHref: string;
  /** Heart on the hero (default). Job ads opt out: their heart sits in the bottom bar. */
  favorite?: boolean;
};

/**
 * Native share sheet with a copy-link fallback (same behaviour as ShareButton). A completed share or copy is counted
 * in the owner's statistics (fire and forget); a cancelled share sheet is not.
 */
function ListingShareButton({ listingId, title }: { listingId: string; title: string }) {
  const onClick = async () => {
    const href = window.location.href;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url: href });
        logListingShare(listingId);
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(href);
      notify.success("Bağlantı kopyalandı");
      logListingShare(listingId);
    } catch {
      notify.info("Bağlantıyı kopyala", href);
    }
  };
  return (
    <Button type="button" variant="secondary" size="icon" aria-label="Paylaş" className={cn("rounded-full", HERO_BUTTON)} onClick={onClick}>
      <Share2 />
    </Button>
  );
}

/** Back · share · favorite · ⋯ (report, or the owner's links) on top of a listing hero. Hides the bottom nav. */
export function ListingHeroBar({ listingId, ownerId, title, backHref, editHref, manageHref, favorite = true }: ListingHeroBarProps) {
  const router = useRouter();
  return (
    <div className="flex items-center justify-between gap-2">
      <HideBottomNav />
      <button type="button" aria-label="Geri" className={HERO_BUTTON} onClick={() => (canGoBack() ? router.back() : router.push(backHref))}>
        <ArrowLeft className="size-5" strokeWidth={2} />
      </button>
      <div className="flex items-center gap-2">
        <ListingShareButton listingId={listingId} title={title} />
        {/* "ghost": its only background is a hover, which HERO_BUTTON overrides (overlay would keep a shadow). */}
        {favorite ? <FavoriteButton targetType="listing" targetId={listingId} variant="ghost" className={HERO_BUTTON} /> : null}
        <ListingDetailMenu listingId={listingId} ownerId={ownerId} editHref={editHref} manageHref={manageHref} className={HERO_BUTTON} />
      </div>
    </div>
  );
}
