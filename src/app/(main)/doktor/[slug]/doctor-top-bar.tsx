"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { canGoBack } from "@/lib/navigation-history";
import { Button } from "@/components/ui/button";
import { HideBottomNav } from "@/components/layout/nav-visibility";
import { ShareButton } from "@/components/shared/share-button";

/** Same round translucent look as PageHeader's back button. */
const ROUND = "shrink-0 rounded-full bg-foreground/[0.06] backdrop-blur-md hover:bg-foreground/10";

/**
 * Sticky top bar of the doctor profile: back and share, no title (the doctor's name below is the page's only h1).
 * Hides the bottom nav: the page has its own bottom dock.
 */
export function DoctorTopBar({ backHref, share }: { backHref: string; share?: { title: string; text?: string } }) {
  const router = useRouter();
  return (
    <div className="sticky top-0 z-40 bg-background pt-safe">
      <HideBottomNav />
      <div className="flex h-(--topbar-h) items-center justify-between gap-2 px-2">
        <Button variant="ghost" size="icon" className={ROUND} aria-label="Geri" onClick={() => (canGoBack() ? router.back() : router.push(backHref))}>
          <ArrowLeft className="size-5" strokeWidth={2.2} />
        </Button>
        {share ? <ShareButton title={share.title} text={share.text} iconOnly variant="ghost" className={ROUND} /> : null}
      </div>
    </div>
  );
}
