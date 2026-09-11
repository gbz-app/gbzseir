import { Suspense } from "react";
import Link from "next/link";
import { ArrowRight, Briefcase, Bus, ChevronRight, Map as MapIcon, MoonStar, Siren, Sparkles, Store, Tag, type LucideIcon } from "lucide-react";
import { APP_DESCRIPTION, APP_NAME, SITE_URL } from "@/config/site";
import { routes } from "@/core/routes";
import { Skeleton } from "@/components/ui/skeleton";
import { JsonLd } from "@/components/seo/json-ld";
import { VERTICAL_INFO, type Vertical } from "@/features/business/lib/verticals";
import { getNews } from "@/features/content/news/get-news";
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
  { href: routes.nearby.dutyPharmacies(), label: "Nöbetçi Eczane", image: "/images/home/eczane.webp", imageClassName: "bg-card" },
  { href: routes.nearby.root("durak"), label: "Durak", icon: Bus, tone: "bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300" },
  { href: routes.nearby.root(), label: "Şehir Rehberi", icon: MapIcon, tone: "bg-brand-soft text-primary" },
  { href: routes.content.emergency(), label: "Acil Durum", icon: Siren, tone: "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300" },
];

/** Category cards, 4 per row. */
const CATEGORIES: Tile[] = [
  { href: routes.search("taksi"), label: "Taksi", image: "/images/home/taksi.webp", imageClassName: "bg-card" },
  vertical("yemek"),
  vertical("restoran"),
  vertical("kafe"),
  vertical("otel"),
  vertical("hizmet", "Hizmetler"),
  vertical("etkinlik"),
  vertical("magaza"),
  { href: routes.listings.root("ikinci-el"), label: "İkinci El", icon: Tag, tone: "bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300" },
  { href: routes.listings.root("is-ilanlari"), label: "İş İlanı", icon: Briefcase, tone: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300" },
  { href: routes.nearby.root("cami"), label: "Cami", icon: MoonStar, tone: "bg-teal-100 text-teal-600 dark:bg-teal-500/15 dark:text-teal-300" },
  { href: routes.businesses.root(), label: "Firmalar", icon: Store, tone: "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300" },
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

/** Wide AI card on the left of the quick cards (search for now; the assistant comes later). */
function AiCard() {
  return (
    <Link
      href={routes.search()}
      className="relative col-span-2 row-span-2 flex flex-col justify-between overflow-hidden rounded-3xl bg-linear-to-br from-violet-500 via-primary to-fuchsia-500 p-4 text-white outline-none transition-transform active:scale-[0.99] focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="absolute -top-8 -right-8 size-28 rounded-full bg-white/15" aria-hidden />
      <span className="absolute -bottom-10 -left-6 size-24 rounded-full bg-black/10" aria-hidden />
      <span className="relative flex size-10 items-center justify-center rounded-2xl bg-white/20">
        <Sparkles className="size-5" aria-hidden />
      </span>
      <span className="relative mt-3 block">
        <span className="block text-[17px] leading-tight font-bold">Yapay zekaya sor</span>
        <span className="mt-1 block text-xs leading-snug text-white/85">Eczane, usta, etkinlik… ne arıyorsan yaz</span>
      </span>
      <span className="relative mt-3 inline-flex w-fit items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-primary">
        Sor <ArrowRight className="size-3.5" aria-hidden />
      </span>
    </Link>
  );
}

async function NewsSection() {
  const items = await getNews()
    .then((r) => r.items)
    .catch(() => []);
  if (!items.length) return null;
  return (
    <section aria-labelledby="haberler">
      <SectionHeader id="haberler" title="Haberler" href={routes.content.news()} />
      <HomeNews items={items.slice(0, 40)} />
    </section>
  );
}

async function PlacesSection() {
  const places = await getPlaces().catch(() => []);
  if (!places.length) return null;
  return (
    <section aria-labelledby="gezilecek">
      <SectionHeader id="gezilecek" title="Gezilecek Yerler" href={routes.nearby.places()} />
      <HomePlaces places={places.slice(0, 20)} />
    </section>
  );
}

/** C1 - Ana sayfa: başlık, arama, yapay zeka + hızlı kartlar, kategoriler, haberler, gezilecek yerler. */
export default function HomePage() {
  return (
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

      <Suspense fallback={<Skeleton className="h-[26rem] w-full rounded-3xl" />}>
        <NewsSection />
      </Suspense>

      <Suspense fallback={<Skeleton className="h-[26rem] w-full rounded-3xl" />}>
        <PlacesSection />
      </Suspense>
    </div>
  );
}
