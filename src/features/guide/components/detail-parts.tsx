import type { LucideIcon } from "lucide-react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/config/site";
import { formatDate } from "@/core/format";
import { OSM_COPYRIGHT_URL } from "@/features/nearby/config";
import type { GuidePhoto } from "@/features/guide/lib/types";
import type { GuideEntry } from "./list-config";
import { GuideCard } from "./guide-card";

/**
 * Building blocks of the guide detail pages (/kurum/[slug], /gezilecek-yerler/[slug]) on the shared DetailHero +
 * DetailSheet layout: the no-photo hero art, info rows, sources and the "Yakındaki" list. Server-safe, no shadows.
 */

/** Hero without photos: the category icon on a gradient (purple by default), covering the whole hero box. */
export function GuideHeroArt({ icon: Icon, gradient = "from-violet-500 via-primary to-indigo-700" }: { icon: LucideIcon; gradient?: string }) {
  return (
    <span aria-hidden className={cn("absolute inset-0 overflow-hidden bg-linear-to-br", gradient)}>
      <span className="absolute -top-16 -left-14 size-56 rounded-full bg-white/10" />
      <span className="absolute -right-12 -bottom-24 size-72 rounded-full bg-black/10" />
      <Icon className="absolute right-2 bottom-10 size-40 -rotate-12 text-white/10" strokeWidth={1.25} />
      <span className="absolute inset-0 flex items-center justify-center pb-6">
        <span className="flex size-24 items-center justify-center rounded-[1.75rem] bg-white/15 text-white backdrop-blur-sm">
          <Icon className="size-12" strokeWidth={1.5} />
        </span>
      </span>
    </span>
  );
}

/** Section heading of a detail sheet. */
export function SheetSection({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={className}>
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/** White card of info rows (a plain list: the rows also hold an icon and an action, which a <dl> may not). */
export function InfoCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return <ul className={cn("divide-y divide-border/60 overflow-hidden rounded-3xl bg-card", className)}>{children}</ul>;
}

/** One row: icon, small label, value and an optional action (e.g. the black "Ara"). */
export function InfoItem({ icon: Icon, label, children, action }: { icon: LucideIcon; label: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <li className="flex min-h-16 items-center gap-3 px-4 py-3">
      <Icon className="size-5 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <div className="mt-0.5 text-[15px] leading-snug font-medium break-words">{children}</div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </li>
  );
}

/** Small chip in the sheet header (category, Devlet / Özel). */
export function HeaderChip({ icon: Icon, children, tone = "brand" }: { icon?: LucideIcon; children: React.ReactNode; tone?: "brand" | "muted" | "warm" }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-semibold",
        tone === "brand" && "bg-brand-soft text-primary",
        tone === "muted" && "bg-muted text-muted-foreground",
        tone === "warm" && "bg-highlight-soft text-highlight-foreground dark:text-highlight",
      )}
    >
      {Icon ? <Icon className="size-3.5" aria-hidden /> : null}
      {children}
    </span>
  );
}

const LINK = "font-semibold text-foreground underline underline-offset-2";

/**
 * "Kaynak: <domain> · Son kontrol: <date>" footnote, plus the OpenStreetMap (ODbL) and KBB (CC BY 4.0) credits and,
 * for places, the photo credits with licence links.
 */
export function GuideSources({
  links,
  verifiedAt,
  updatedAt,
  osm,
  kbb,
  photos = [],
  className,
}: {
  links: Array<{ domain: string; url: string }>;
  verifiedAt: string | null;
  updatedAt: string;
  osm: boolean;
  kbb: boolean;
  photos?: GuidePhoto[];
  className?: string;
}) {
  const credited = photos.filter((p) => p.author || p.credit);
  return (
    <div className={cn("rounded-2xl bg-muted/70 px-4 py-3 text-xs leading-relaxed text-muted-foreground", className)}>
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
        <Info className="size-3.5 shrink-0" aria-hidden />
        {links.length ? (
          <span>
            Kaynak:{" "}
            {links.map((s, i) => (
              <span key={s.url}>
                {i ? ", " : null}
                <a href={s.url} target="_blank" rel="noopener noreferrer" className={LINK}>
                  {s.domain}
                </a>
              </span>
            ))}
          </span>
        ) : (
          <span>Kaynak: {osm ? "OpenStreetMap" : kbb ? "Kocaeli Büyükşehir Belediyesi" : `${APP_NAME} şehir rehberi`}</span>
        )}
        <span aria-hidden>·</span>
        {verifiedAt ? (
          <span>
            Son kontrol: <span className="font-semibold text-foreground">{formatDate(verifiedAt, { month: "long", year: true })}</span>
          </span>
        ) : (
          <span>
            Son güncelleme: <span className="font-semibold text-foreground">{formatDate(updatedAt, { month: "long", year: true })}</span>
          </span>
        )}
      </p>
      {osm ? (
        <p className="mt-1.5">
          Harita verisi{" "}
          <a href={OSM_COPYRIGHT_URL} target="_blank" rel="noopener noreferrer" className={LINK}>
            © OpenStreetMap katkıcıları
          </a>{" "}
          (ODbL).
        </p>
      ) : null}
      {kbb ? <p className="mt-1.5">Kocaeli Büyükşehir Belediyesi Açık Veri (CC BY 4.0).</p> : null}
      {credited.length ? (
        <ul className="mt-1.5 flex flex-col gap-0.5">
          {credited.map((p, i) => (
            <li key={p.url}>
              {credited.length > 1 ? `Fotoğraf ${i + 1}: ` : "Fotoğraf: "}
              {p.author ?? p.credit}
              {p.licence ? (
                <>
                  ,{" "}
                  {p.licenceUrl ? (
                    <a href={p.licenceUrl} target="_blank" rel="noopener noreferrer license" className={LINK}>
                      {p.licence}
                    </a>
                  ) : (
                    p.licence
                  )}
                </>
              ) : null}
              ,{" "}
              {p.sourcePage ? (
                <a href={p.sourcePage} target="_blank" rel="noopener noreferrer" className={LINK}>
                  Wikimedia Commons
                </a>
              ) : (
                "Wikimedia Commons"
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** "Fotoğraf: <author>, <licence>, Wikimedia Commons" under the hero (one entry per author + licence). */
export function PhotoCreditLine({ photos, className }: { photos: GuidePhoto[]; className?: string }) {
  const seen = new Set<string>();
  const credits = photos.filter((p) => {
    const k = `${p.author ?? p.credit ?? ""}|${p.licence ?? ""}`;
    if (!(p.author || p.credit) || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (!credits.length) return null;
  return (
    <p className={cn("text-[11px] leading-snug text-muted-foreground", className)}>
      {credits.length > 1 ? "Fotoğraflar: " : "Fotoğraf: "}
      {credits.map((p, i) => (
        <span key={p.url}>
          {i ? " · " : null}
          {p.sourcePage ? (
            <a href={p.sourcePage} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              {p.author ?? p.credit}
            </a>
          ) : (
            (p.author ?? p.credit)
          )}
          {p.licence ? `, ${p.licence}` : ""}
        </span>
      ))}
      , Wikimedia Commons
    </p>
  );
}

/** "Yakındaki ..." cards (distance from the current record, measured on the server). */
export function NearbyGuideList({ title, items, className }: { title: string; items: Array<{ entry: GuideEntry; distanceM: number | null }>; className?: string }) {
  if (!items.length) return null;
  return (
    <SheetSection title={title} className={className}>
      <ul className="flex flex-col gap-2.5">
        {items.map(({ entry, distanceM }) => (
          <li key={entry.id}>
            <GuideCard entry={entry} distanceM={distanceM} />
          </li>
        ))}
      </ul>
    </SheetSection>
  );
}
