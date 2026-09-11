import { Suspense } from "react";
import Link from "next/link";
import { Briefcase, Bus, ChevronRight, Map as MapIcon, Sparkles, Tag, type LucideIcon } from "lucide-react";
import { APP_DESCRIPTION, APP_NAME, SITE_URL } from "@/config/site";
import { routes } from "@/core/routes";
import { Skeleton } from "@/components/ui/skeleton";
import { TopBar } from "@/components/layout/top-bar";
import { JsonLd } from "@/components/seo/json-ld";
import { getVocabularies } from "@/features/business/lib/vocabularies";
import { VERTICAL_INFO, type Vertical } from "@/features/business/lib/verticals";
import { HomeCinemaSection } from "@/features/cinema/components/home-cinema-section";
import { listPublishedArticles } from "@/features/content/articles/queries";
import { getNews } from "@/features/content/news/get-news";
import { EventsRail } from "@/features/events/components/events-rail";
import { listUpcomingEvents } from "@/features/events/queries";
import { HomeHero } from "@/features/home/components/home-hero";
import { HomeNews } from "@/features/home/components/home-news";
import { HomePlaces } from "@/features/home/components/home-places";
import { HomeSearch } from "@/features/home/components/home-search";
import { ImageTile } from "@/features/home/components/image-tile";
import { getPlaces } from "@/features/nearby/server/queries";

export const revalidate = 300;

type Tile = { href: string; label: string; image?: string; icon?: LucideIcon; tone?: string; imageClassName?: string };

const vertical = (v: Vertical, label?: string): Tile => ({
  href: v === "etkinlik" ? routes.events.root() : routes.businesses.vertical(v),
  label: label ?? VERTICAL_INFO[v].label,
  icon: VERTICAL_INFO[v].icon,
  tone: VERTICAL_INFO[v].tone,
});

/** Right of the AI card: 2 x 2 quick cards. */
const QUICK: Tile[] = [
  // Opens the map like the other pharmacies (Yakınımda > Nöbetçi).
  { href: routes.nearby.root("nobetci"), label: "Nöbetçi Eczane", image: "/images/home/eczane.webp", imageClassName: "bg-card" },
  { href: routes.nearby.root("durak"), label: "Durak", icon: Bus, tone: "bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300" },
  { href: routes.guide.root(), label: "Şehir Rehberi", icon: MapIcon, tone: "bg-brand-soft text-primary" },
  { href: routes.nearby.root("taksi"), label: "Taksi", image: "/images/home/taksi.webp", imageClassName: "bg-card" },
];

/** Category cards, 4 per row. */
const CATEGORIES: Tile[] = [
  { ...vertical("yemek"), image: "/images/home/yemek.webp", imageClassName: "bg-card" },
  vertical("restoran"),
  vertical("kafe"),
  vertical("hizmet", "Hizmetler"),
  vertical("otel"),
  { href: routes.listings.classifieds(), label: "İkinci El", icon: Tag, tone: "bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300" },
  { href: routes.listings.jobs(), label: "İş İlanı", icon: Briefcase, tone: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300" },
  vertical("saglik"),
  vertical("dugun"),
  vertical("egitim"),
  vertical("etkinlik"),
];

function SectionHeader({ id, title, href }: { id?: string; title: string; href?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 id={id} className="text-lg font-semibold">
        {title}
      </h2>
      {href ? (
        <Link href={href} className="inline-flex min-h-11 items-center gap-0.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
          Tümü <ChevronRight className="size-4" aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}

/** Wide GebzemAI card on the left of the quick cards: plain white, icon + name only (opens GebzemAI). */
function AiCard() {
  return (
    <Link
      href={routes.ai()}
      aria-label="GebzemAI"
      className="col-span-2 row-span-2 flex flex-col justify-between rounded-3xl bg-card p-4 outline-none transition-transform active:scale-[0.99] focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Sparkles className="size-8 text-primary" strokeWidth={1.75} aria-hidden />
      <span className="text-xl leading-tight font-bold">GebzemAI</span>
    </Link>
  );
}

/** Our own articles first (in-app pages), then the RSS headlines. */
async function NewsSection() {
  const [articles, items] = await Promise.all([
    listPublishedArticles(10).catch(() => []),
    getNews()
      .then((r) => r.items)
      .catch(() => []),
  ]);
  if (!articles.length && !items.length) return null;
  return (
    <section aria-labelledby="haberler">
      <SectionHeader id="haberler" title="Haberler" href={routes.content.news()} />
      <HomeNews articles={articles} items={items.slice(0, 40)} />
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

/** C1 - Ana sayfa: başlık, arama, yapay zeka + hızlı kartlar, kategoriler, yaklaşan etkinlikler, gezilecek yerler, haberler. */
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

      <section aria-label="Hızlı erişim" className="grid grid-cols-4 gap-x-3 gap-y-3">
        <AiCard />
        {QUICK.map((q) => (
          <ImageTile key={q.label} href={q.href} label={q.label} image={q.image} icon={q.icon} tone={q.tone} imageClassName={q.imageClassName} sizes="80px" />
        ))}
      </section>

      <section aria-label="Kategoriler">
        <ul className="grid grid-cols-4 gap-x-3 gap-y-3">
          {CATEGORIES.map((c) => (
            <li key={c.label}>
              <ImageTile href={c.href} label={c.label} image={c.image} icon={c.icon} tone={c.tone} imageClassName={c.imageClassName} sizes="80px" />
            </li>
          ))}
        </ul>
      </section>

      <Suspense fallback={null}>
        <EventsSection />
      </Suspense>

      <Suspense fallback={null}>
        <HomeCinemaSection />
      </Suspense>

      <Suspense fallback={<Skeleton className="h-[26rem] w-full rounded-3xl" />}>
        <PlacesSection />
      </Suspense>

      <Suspense fallback={<Skeleton className="h-[26rem] w-full rounded-3xl" />}>
        <NewsSection />
      </Suspense>
    </div>
    </>
  );
}
