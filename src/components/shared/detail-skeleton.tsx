"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { canGoBack } from "@/lib/navigation-history";
import { Skeleton } from "@/components/ui/skeleton";
import { HideBottomNav } from "@/components/layout/nav-visibility";
import { PageHeader } from "./page-header";
import { DetailActions, DetailSheet } from "./detail-hero";

/*
 * loading.tsx skeletons that mirror the real first paint of the detail pages, so nothing flashes or jumps when the
 * page arrives: hero pages get no header, the same hero height, the same overlapping sheet and the same bottom bar
 * (DetailSheet / DetailActions are reused, so they cannot drift). The bottom nav itself is hidden during render by
 * BOTTOM_NAV_HIDDEN_DETAIL_PREFIXES (components/layout/nav-config.ts); the skeletons still mount HideBottomNav like
 * the pages do, so everything that reads useBottomNavHidden() (the install banner) docks to the bottom edge too.
 */

/** Hero heights of the real pages. Keep each in sync with the source named next to it. */
const HERO = {
  /** DetailHero default (detail-hero.tsx), /etkinlik/[slug]. */
  photo: "h-[min(52vh,26rem)] min-h-72",
  /** HERO_HEIGHT in app/(main)/firma/[slug]/page.tsx. */
  firm: "h-[calc(min(52vh,26rem)_-_100px)] min-h-[188px]",
  /** ListingGallery (features/listings/components/gallery.tsx), /ilan/[id]. */
  listing: "h-[min(56vh,27rem)] min-h-80",
  /** JobHeroBand (features/listings/components/job-detail-parts.tsx), /is-ilani/[id]. */
  band: "h-[calc(env(safe-area-inset-top,0px)+9.5rem)]",
} as const;

/** Same look as the round translucent hero buttons (OVERLAY_BUTTON in detail-hero.tsx, HERO_BUTTON in hero-bar.tsx). */
const OVERLAY_BUTTON =
  "flex size-11 shrink-0 items-center justify-center rounded-full border-0 bg-white/35 text-foreground shadow-none backdrop-blur-md transition-colors outline-none hover:bg-white/50 focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-black/35 dark:text-white dark:hover:bg-black/50";

/** Skeleton block; stays still when the user prefers reduced motion. */
function Bone({ className }: { className?: string }) {
  return <Skeleton aria-hidden className={cn("motion-reduce:animate-none", className)} />;
}

/** Working back button (a slow first render can be left), identical to the one the page paints. */
function HeroBackButton({ backHref }: { backHref: string }) {
  const router = useRouter();
  return (
    <button type="button" aria-label="Geri" className={OVERLAY_BUTTON} onClick={() => (canGoBack() ? router.back() : router.push(backHref))}>
      <ArrowLeft className="size-5" strokeWidth={2} />
    </button>
  );
}

/** Photo slot (bg-muted like the real hero while its image decodes) or the purple job band, with the overlay buttons. */
function HeroSkeleton({ kind, backHref, buttons }: { kind: keyof typeof HERO; backHref: string; buttons: number }) {
  const band = kind === "band";
  return (
    <div className={cn("relative w-full overflow-hidden", band ? "bg-primary" : "bg-muted", HERO[kind])}>
      {band ? (
        <>
          <span aria-hidden className="absolute -top-28 -right-16 size-72 rounded-full bg-white/10" />
          <span aria-hidden className="absolute -bottom-20 left-1/3 size-44 rounded-full bg-white/[0.07]" />
        </>
      ) : (
        <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-linear-to-b from-black/35 to-transparent" />
      )}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 px-4 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)]">
        <HeroBackButton backHref={backHref} />
        <div className="flex items-center gap-2" aria-hidden>
          {Array.from({ length: buttons }, (_, i) => (
            <span key={i} className="size-11 shrink-0 rounded-full bg-white/35 backdrop-blur-md dark:bg-black/35" />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Three white stat tiles (puan / yorum / ..., durum / ilan tarihi / ...). */
function StatTiles() {
  return (
    <div className="grid grid-cols-3 gap-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex h-16 flex-col items-center justify-center gap-2 rounded-2xl bg-card">
          <Bone className="h-4 w-10" />
          <Bone className="h-3 w-12" />
        </div>
      ))}
    </div>
  );
}

const ROW_WIDTHS = ["w-3/5", "w-4/5", "w-1/2", "w-2/3"];

/** White card with icon + text rows (contact, hours, address). */
function RowsCard({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-card bg-card", className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex min-h-14 items-center gap-3 px-4 py-3">
          <Bone className="size-5 shrink-0 rounded-md" />
          <Bone className={cn("h-4", ROW_WIDTHS[i % ROW_WIDTHS.length])} />
        </div>
      ))}
    </div>
  );
}

/** Section heading + a few text lines. */
function TextBlock({ lines = ["w-full", "w-11/12", "w-2/3"] }: { lines?: string[] }) {
  return (
    <div>
      <Bone className="h-5 w-36" />
      <div className="mt-3 flex flex-col gap-2">
        {lines.map((w, i) => (
          <Bone key={i} className={cn("h-3.5", w)} />
        ))}
      </div>
    </div>
  );
}

function FirmSheet() {
  return (
    <DetailSheet className="pb-36">
      <div className="flex flex-col gap-6">
        <div>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1 pt-0.5">
              <Bone className="h-4 w-24" />
              <Bone className="mt-2.5 h-7 w-2/3" />
            </div>
            {/* Slot of the "⋯" menu, so the title keeps its width. */}
            <span className="size-11 shrink-0" aria-hidden />
          </div>
          <Bone className="mt-3 h-4 w-44" />
          <Bone className="mt-3 h-4 w-20" />
        </div>
        <StatTiles />
        <div>
          {/* FirmTabs pill row (same top padding as its sticky bar). */}
          <div className="flex gap-1.5 overflow-hidden pt-[calc(env(safe-area-inset-top,0px)+0.5rem)] pb-2">
            {["w-20", "w-24", "w-24", "w-28"].map((w, i) => (
              <Bone key={i} className={cn("h-10 shrink-0 rounded-full", w)} />
            ))}
          </div>
          <div className="flex flex-col gap-4 pt-5">
            <div className="rounded-card bg-card p-4">
              <TextBlock />
            </div>
            <RowsCard />
          </div>
        </div>
      </div>
    </DetailSheet>
  );
}

/** Category chip, title, then the icon rows (date, place, price, organizer) and the "Hakkında" text; no cards. */
function EventSheet() {
  return (
    <DetailSheet className="pb-36">
      <div className="flex flex-col gap-8">
        <div>
          <Bone className="h-7 w-24 rounded-full" />
          <Bone className="mt-3 h-8 w-3/4" />
        </div>
        <div className="flex flex-col gap-5">
          {[
            ["w-2/5", "w-1/4"],
            ["w-1/2", "w-2/3"],
            ["w-1/4", ""],
            ["w-1/3", "w-1/5"],
          ].map(([a, b], i) => (
            <div key={i} className="flex items-start gap-3.5">
              <Bone className="size-10 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 pt-1">
                <Bone className={cn("h-4", a)} />
                {b ? <Bone className={cn("mt-2 h-3.5", b)} /> : null}
              </div>
            </div>
          ))}
        </div>
        <TextBlock lines={["w-full", "w-11/12", "w-full", "w-3/5"]} />
      </div>
    </DetailSheet>
  );
}

function ClassifiedSheet() {
  return (
    <DetailSheet className="flex flex-col gap-6 pb-36">
      <div>
        <Bone className="h-4 w-24" />
        <Bone className="mt-2.5 h-7 w-3/4" />
        <Bone className="mt-3 h-8 w-32" />
        <Bone className="mt-3.5 h-4 w-48" />
      </div>
      <StatTiles />
      <div>
        <Bone className="h-5 w-28" />
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-4 rounded-card bg-card p-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i}>
              <Bone className="h-3 w-14" />
              <Bone className="mt-2 h-4 w-20" />
            </div>
          ))}
        </div>
      </div>
      <TextBlock />
    </DetailSheet>
  );
}

function JobSheet() {
  return (
    <DetailSheet className="flex flex-col gap-7 pb-36">
      <div>
        {/* Logo notch on the sheet edge (JobLogoNotch). */}
        <div className="relative -mt-[4.25rem] w-fit rounded-media bg-background p-1.5">
          <div className="size-20 rounded-card bg-card" />
        </div>
        <Bone className="mt-4 h-4 w-24" />
        <Bone className="mt-2.5 h-8 w-4/5" />
        <Bone className="mt-3 h-4 w-40" />
        <Bone className="mt-4 h-11 w-44 rounded-2xl" />
        <Bone className="mt-4 h-4 w-48" />
      </div>
      <div className="flex flex-wrap gap-2">
        {["w-28", "w-24", "w-32"].map((w, i) => (
          <Bone key={i} className={cn("h-9 rounded-full", w)} />
        ))}
      </div>
      <TextBlock lines={["w-full", "w-11/12", "w-full", "w-2/3"]} />
    </DetailSheet>
  );
}

type ActionsLayout = "cta-round" | "cta-round-round" | "info-cta" | "round-cta";

/** The fixed bottom bar with pill placeholders in the page's button layout. */
function ActionsSkeleton({ layout }: { layout: ActionsLayout }) {
  return (
    <DetailActions>
      {layout === "round-cta" ? <Bone className="size-14 shrink-0 rounded-full" /> : null}
      {layout === "info-cta" ? (
        <div className="shrink-0 pl-1">
          <Bone className="h-3 w-10" />
          <Bone className="mt-1.5 h-5 w-20" />
        </div>
      ) : null}
      <Bone className="h-14 min-w-0 flex-1 rounded-full" />
      {layout === "cta-round" || layout === "cta-round-round" ? <Bone className="size-14 shrink-0 rounded-full" /> : null}
      {layout === "cta-round-round" ? <Bone className="size-14 shrink-0 rounded-full" /> : null}
    </DetailActions>
  );
}

export type DetailSkeletonVariant = "firm" | "event" | "classified" | "job";

const VARIANTS: Record<DetailSkeletonVariant, { hero: keyof typeof HERO; buttons: number; actions: ActionsLayout; Sheet: () => React.ReactNode }> = {
  /** Share + heart; "Ara" + round directions. */
  firm: { hero: "firm", buttons: 2, actions: "cta-round", Sheet: FirmSheet },
  /** Menu + share; "Bilet al" / "Ara" + round "Takvime ekle" + round directions. */
  event: { hero: "photo", buttons: 2, actions: "cta-round-round", Sheet: EventSheet },
  /** Share + heart + menu; price + "Numarayı göster". */
  classified: { hero: "listing", buttons: 3, actions: "info-cta", Sheet: ClassifiedSheet },
  /** Share + menu; round heart + "Ara ve başvur". */
  job: { hero: "band", buttons: 2, actions: "round-cta", Sheet: JobSheet },
};

/** loading.tsx of the full-bleed hero detail pages (firma, etkinlik, 2. el ilan, iş ilanı). No header. */
export function DetailSkeleton({ variant, backHref }: { variant: DetailSkeletonVariant; backHref: string }) {
  const { hero, buttons, actions, Sheet } = VARIANTS[variant];
  return (
    <div className="flex flex-col" aria-busy="true">
      <HideBottomNav />
      <HeroSkeleton kind={hero} backHref={backHref} buttons={buttons} />
      <Sheet />
      <ActionsSkeleton layout={actions} />
      <p role="status" className="sr-only">
        Yükleniyor…
      </p>
    </div>
  );
}

/**
 * loading.tsx of the header-style detail pages (eczane, cami, durak, gezilecek yer): the same PageHeader, the info
 * card, info rows and the map. `footer` is the page's own bottom bar with skeleton buttons; `className` its spacing.
 */
export function HeaderDetailSkeleton({
  title,
  backHref,
  photo,
  className,
  footer,
}: {
  title: string;
  backHref: string;
  /** Photo gallery above the card (gezilecek yerler). */
  photo?: boolean;
  className?: string;
  footer?: React.ReactNode;
}) {
  return (
    <>
      <PageHeader title={title} backHref={backHref} hideBottomNav />
      <div className={cn("flex flex-col gap-5 px-4 pt-4", className)} aria-busy="true">
        {photo ? <Bone className="aspect-[4/3] w-full rounded-card sm:aspect-[16/10]" /> : null}
        <div className="rounded-card bg-card p-4">
          <div className="flex items-start gap-3.5">
            <Bone className="size-14 shrink-0 rounded-2xl" />
            <div className="min-w-0 flex-1">
              <Bone className="mt-0.5 h-3 w-1/3" />
              <Bone className="mt-2 h-6 w-3/4" />
              <Bone className="mt-3 h-4 w-24" />
            </div>
          </div>
        </div>
        <RowsCard rows={2} className="rounded-2xl" />
        <Bone className="aspect-[16/9] w-full rounded-2xl" />
        <p role="status" className="sr-only">
          Yükleniyor…
        </p>
      </div>
      {footer}
    </>
  );
}
