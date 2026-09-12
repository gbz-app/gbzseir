import { Suspense } from "react";
import Link from "next/link";
import { Briefcase, Castle, ChevronRight, Hospital, Landmark, Mail, Scale, School, Siren, Sparkles, Stamp, Tag, Trees, type LucideIcon } from "lucide-react";
import { APP_DESCRIPTION, APP_NAME, SITE_URL } from "@/config/site";
import { routes } from "@/core/routes";
import { Skeleton } from "@/components/ui/skeleton";
import { TopBar } from "@/components/layout/top-bar";
import { JsonLd } from "@/components/seo/json-ld";
import { getVocabularies } from "@/features/business/lib/vocabularies";
import { VERTICAL_INFO, type Vertical } from "@/features/business/lib/verticals";
import { HomeCinemaSection } from "@/features/cinema/components/home-cinema-section";
import { listPublishedArticles } from "@/features/content/articles/queries";
import { EventsRail } from "@/features/events/components/events-rail";
import { listUpcomingEvents } from "@/features/events/queries";
import { HomeHero } from "@/features/home/components/home-hero";
import { HomeNearby } from "@/features/home/components/home-nearby";
import { HomeNews } from "@/features/home/components/home-news";
import { HomeOutages } from "@/features/home/components/home-outages";
import { HomePlaces } from "@/features/home/components/home-places";
import { HomeSearch } from "@/features/home/components/home-search";
import { ImageTile } from "@/features/home/components/image-tile";
import { KIND_META, type KindMeta } from "@/features/nearby/config";
import { getPrayerDays } from "@/features/nearby/server/external";
import { getDutyMode, getPlaces } from "@/features/nearby/server/queries";

export const revalidate = 300;

/**
 * Yakınımda strip: the duty mode (cached app setting) decides the pharmacy card and today's / tomorrow's prayer times
 * feed the cami card; everything else happens on the device.
 */
async function NearbyStrip() {
  const [dutyMode, prayerDays] = await Promise.all([getDutyMode().catch(() => "off" as const), getPrayerDays().catch(() => [])]);
  return <HomeNearby dutyMode={dutyMode} prayerDays={prayerDays} />;
}

type Tile = { href: string; label: string; image?: string; icon?: LucideIcon; tone?: string; imageClassName?: string };

const vertical = (v: Vertical, label?: string): Tile => ({
  href: v === "etkinlik" ? routes.events.root() : routes.businesses.vertical(v),
  label: label ?? VERTICAL_INFO[v].label,
  icon: VERTICAL_INFO[v].icon,
  tone: VERTICAL_INFO[v].tone,
});

/** Icon and colour of a map pin kind (same as the Keşfet list and the Şehir Rehberi hub). */
const kind = (k: KindMeta): Pick<Tile, "icon" | "tone"> => ({ icon: k.icon, tone: k.tone });

/** Tones of the Şehir Rehberi hub rows without a pin kind of their own (rehber/page.tsx). */
const TONE = {
  slate: "bg-slate-200 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300",
  rose: "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300",
  indigo: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
  red: "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300",
  sky: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  yellow: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  lime: "bg-lime-100 text-lime-700 dark:bg-lime-500/15 dark:text-lime-300",
} as const;

const guide = routes.guide.category;

/** Şehir Rehberi (one row, scrolls sideways), most needed first. Same destinations as the rows of the /rehber hub. */
const GUIDE: Tile[] = [
  // Opens Keşfet on the Eczane tab with "Nöbetçi" already selected.
  { href: routes.nearby.root("nobetci"), label: "Nöbetçi Eczane", ...kind(KIND_META.duty) },
  { href: guide("saglik"), label: "Hastane", icon: Hospital, tone: TONE.rose },
  { href: routes.nearby.root("taksi"), label: "Taksi", ...kind(KIND_META.taxi) },
  { href: routes.nearby.root("durak"), label: "Durak", ...kind(KIND_META.bus_stop) },
  { href: guide("guvenlik"), label: "Emniyet", icon: Siren, tone: TONE.red },
  { href: guide("kamu"), label: "Belediye", icon: Landmark, tone: TONE.indigo },
  { href: guide("atm"), label: "ATM", ...kind(KIND_META.atm) },
  { href: guide("banka"), label: "Banka", ...kind(KIND_META.bank) },
  { href: guide("noter"), label: "Noter", icon: Stamp, tone: TONE.slate },
  { href: guide("sarj"), label: "Şarj", ...kind(KIND_META.ev_charge) },
  { href: guide("adalet"), label: "Adliye", icon: Scale, tone: TONE.slate },
  { href: guide("ptt"), label: "PTT", icon: Mail, tone: TONE.yellow },
  { href: guide("okullar"), label: "Okul", icon: School, tone: TONE.sky },
  { href: guide("parklar-ve-doga"), label: "Park", icon: Trees, tone: TONE.lime },
  { href: guide("tarihi"), label: "Tarihi Yer", icon: Castle, tone: TONE.amber },
];

/** Category cards, 4 per row; GebzemAI leads them. Icons only (no photos). */
const CATEGORIES: Tile[] = [
  { href: routes.ai(), label: "GebzemAI", icon: Sparkles, tone: "bg-brand-soft text-primary" },
  vertical("yemek"),
  vertical("restoran"),
  vertical("kafe"),
  vertical("hizmet", "Hizmetler"),
  vertical("otel"),
  { href: routes.listings.classifieds(), label: "İkinci El", icon: Tag, tone: "bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300" },
  { href: routes.listings.jobs(), label: "İş İlanı", icon: Briefcase, tone: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300" },
  vertical("saglik"),
  vertical("dugun"),
  vertical("egitim"),
  vertical("spor"),
  vertical("etkinlik"),
];

function SectionHeader({ id, title, href }: { id?: string; title: string; href?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 id={id} className="text-xl font-semibold">
        {title}
      </h2>
      {href ? (
        <Link href={href} className="inline-flex min-h-11 items-center gap-0.5 text-base font-medium text-muted-foreground transition-colors hover:text-foreground">
          Tümü <ChevronRight className="size-[18px]" aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}

/** "Haberler": only the stories our team publishes (in-app pages, no RSS); hidden while there are none. */
async function NewsSection() {
  const articles = await listPublishedArticles(10).catch(() => []);
  if (!articles.length) return null;
  return (
    <section aria-labelledby="haberler">
      <SectionHeader id="haberler" title="Haberler" href={routes.content.news()} />
      <HomeNews articles={articles} />
    </section>
  );
}

async function PlacesSection() {
  const [places, { placeCategories }] = await Promise.all([getPlaces().catch(() => []), getVocabularies()]);
  if (!places.length) return null;
  return (
    <section aria-labelledby="gezilecek">
      <SectionHeader id="gezilecek" title="Gezilecek Yerler" href={routes.nearby.places()} />
      <HomePlaces places={places.slice(0, 20)} categories={placeCategories} />
    </section>
  );
}

/** "Yaklaşan etkinlikler": shown only when there are upcoming events. */
async function EventsSection() {
  const events = await listUpcomingEvents().catch(() => []);
  if (!events.length) return null;
  return (
    <section aria-labelledby="etkinlikler">
      <SectionHeader id="etkinlikler" title="Yaklaşan etkinlikler" href={routes.events.root()} />
      <EventsRail events={events.slice(0, 10)} />
    </section>
  );
}

/**
 * C1 - Ana sayfa: başlık, arama, Yakınımda (Nöbetçi Eczane, durak, cami, taksi, şarj, akaryakıt kartları), Şehir
 * Rehberi (tek satır, yana kayan), kategoriler (başta GebzemAI), kesintiler ve afet, yaklaşan etkinlikler, sinema,
 * gezilecek yerler, haberler.
 */
export default function HomePage() {
  return (
    <>
    <TopBar />
    <div className="flex flex-col gap-6 px-4 pt-2 pb-8">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: APP_NAME,
          url: SITE_URL,
          description: APP_DESCRIPTION,
          inLanguage: "tr-TR",
          potentialAction: {
            "@type": "SearchAction",
            target: `${SITE_URL}${routes.search()}?q={search_term_string}`,
            "query-input": "required name=search_term_string",
          },
        }}
      />

      <div className="flex flex-col gap-4">
        <HomeHero />
        <HomeSearch />
      </div>

      <section aria-labelledby="yakinimda">
        {/* "Tümü": the Keşfet map with every kind nearby, the list grouped by kind. */}
        <SectionHeader id="yakinimda" title="Yakınımda" href={routes.nearby.root("hepsi")} />
        <div className="mt-1">
          <Suspense fallback={<div className="h-[8.5rem]" />}>
            <NearbyStrip />
          </Suspense>
        </div>
      </section>

      {/* @container: tiles are 15% narrower than a category tile, 0.85 x (width - 3 gaps) / 4; one row, scrolls sideways. */}
      <section aria-labelledby="sehir-rehberi" className="@container">
        <SectionHeader id="sehir-rehberi" title="Şehir Rehberi" href={routes.guide.root()} />
        <ul className="no-scrollbar -mx-4 mt-1 flex gap-3 overflow-x-auto px-4">
          {GUIDE.map((t) => (
            <li key={t.href} className="w-[calc((100cqw-2.25rem)*0.2125)] shrink-0">
              <ImageTile href={t.href} label={t.label} icon={t.icon} tone={t.tone} size="sm" />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="kategoriler">
        <SectionHeader id="kategoriler" title="Kategoriler" />
        <ul className="mt-3 grid grid-cols-4 gap-x-3 gap-y-3">
          {CATEGORIES.map((c) => (
            <li key={c.label}>
              <ImageTile href={c.href} label={c.label} image={c.image} icon={c.icon} tone={c.tone} imageClassName={c.imageClassName} sizes="80px" />
            </li>
          ))}
        </ul>
      </section>

      <HomeOutages />

      <Suspense fallback={null}>
        <EventsSection />
      </Suspense>

      <Suspense fallback={null}>
        <HomeCinemaSection />
      </Suspense>

      <Suspense fallback={<Skeleton className="h-[26rem] w-full rounded-3xl" />}>
        <PlacesSection />
      </Suspense>

      {/* No skeleton: the section is hidden while there are no published stories. */}
      <Suspense fallback={null}>
        <NewsSection />
      </Suspense>
    </div>
    </>
  );
}
