"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { canGoBack } from "@/lib/navigation-history";
import { HideBottomNav } from "@/components/layout/nav-visibility";
import { FavoriteButton } from "@/components/shared/favorite-button";
import { ShareButton } from "@/components/shared/share-button";
import { ListingDetailMenu } from "./detail-actions";

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
};

/** Back · share · favorite · ⋯ (report, or the owner's links) on top of a listing hero. Hides the bottom nav. */
export function ListingHeroBar({ listingId, ownerId, title, backHref, editHref, manageHref }: ListingHeroBarProps) {
  const router = useRouter();
  return (
    <div className="flex items-center justify-between gap-2">
      <HideBottomNav />
      <button type="button" aria-label="Geri" className={HERO_BUTTON} onClick={() => (canGoBack() ? router.back() : router.push(backHref))}>
        <ArrowLeft className="size-5" strokeWidth={2} />
      </button>
      <div className="flex items-center gap-2">
        <ShareButton title={title} iconOnly variant="secondary" label="Paylaş" className={HERO_BUTTON} />
        {/* "ghost": its only background is a hover, which HERO_BUTTON overrides (overlay would keep a shadow). */}
        <FavoriteButton targetType="listing" targetId={listingId} variant="ghost" className={HERO_BUTTON} />
        <ListingDetailMenu listingId={listingId} ownerId={ownerId} editHref={editHref} manageHref={manageHref} className={HERO_BUTTON} />
      </div>
    </div>
  );
}
