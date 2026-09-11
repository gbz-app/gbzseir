import { Suspense } from "react";
import Link from "next/link";
import { Briefcase, Bus, ChevronRight, Map as MapIcon, MoonStar, Store, Tag, type LucideIcon } from "lucide-react";
import { APP_DESCRIPTION, APP_NAME, SITE_URL } from "@/config/site";
import { routes } from "@/core/routes";
import { Skeleton } from "@/components/ui/skeleton";
import { JsonLd } from "@/components/seo/json-ld";
import { VERTICAL_INFO, type Vertical } from "@/features/business/lib/verticals";
import { HomeHero } from "@/features/home/components/home-hero";
import { HomePlaces } from "@/features/home/components/home-places";
import { HomeSearch } from "@/features/home/components/home-search";
import { HomeSlider } from "@/features/home/components/home-slider";
import { ImageTile } from "@/features/home/components/image-tile";
import { buildDutyView } from "@/features/nearby/lib/duty-view";
import { getDutyData, getPlaces, renderNow } from "@/features/nearby/server/queries";

export const revalidate = 300;

type Tile = { href: string; label: string; sub?: string; image?: string; icon?: LucideIcon; tone?: string; imageClassName?: string };

const vertical = (v: Vertical, label?: string): Tile => ({
  href: v === "etkinlik" ? routes.events.root() : routes.businesses.vertical(v),
  label: label ?? VERTICAL_INFO[v].label,
  icon: VERTICAL_INFO[v].icon,
  tone: VERTICAL_INFO[v].tone,
});

/** Kategoriler: picture cards with the name underneath (3 columns). */
const CATEGORIES: Tile[] = [
  { href: routes.search("taksi"), label: "Taksi", image: "/images/home/taksi.webp", imageClassName: "bg-card" },
  vertical("yemek"),
  vertical("restoran"),
  vertical("kafe"),
  vertical("otel"),
  vertical("hizmet", "Hizmetler"),
  vertical("etkinlik"),
  { href: routes.listings.root("ikinci-el"), label: "İkinci El", icon: Tag, tone: "bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300" },
  { href: routes.listings.root("is-ilanlari"), label: "İş İlanı", icon: Briefcase, tone: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300" },
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

/** C1 - Ana sayfa: başlık, arama, slider, Şehir Rehberi, Kategoriler, Gezilecek Yerler. */
export default async function HomePage() {
  const duty = await getDutyData().catch(() => null);
  const dutyCount = duty ? buildDutyView(duty.rows, renderNow()).current.length : 0;

  const guide: Tile[] = [
    {
      href: routes.nearby.dutyPharmacies(),
      label: "Nöbetçi Eczane",
      sub: dutyCount ? `Şu an ${dutyCount} açık` : "Bugün kim nöbette?",
      image: "/images/home/eczane.webp",
      imageClassName: "bg-card",
    },
    { href: routes.nearby.root("cami"), label: "Cami", sub: "Namaz vakitleri", icon: MoonStar, tone: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300" },
    { href: routes.nearby.root("durak"), label: "Durak", sub: "Duraklar ve hatlar", icon: Bus, tone: "bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300" },
    { href: routes.nearby.root(), label: "Harita", sub: "Yakınındakiler", icon: MapIcon, tone: "bg-brand-soft text-primary" },
    { href: routes.businesses.root(), label: "Firmalar", sub: "Onaylı işletmeler", icon: Store, tone: "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300" },
  ];

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
        <HomeSlider />
      </div>

      <section aria-labelledby="sehir-rehberi" className="-mt-2">
        <SectionHeader id="sehir-rehberi" title="Şehir Rehberi" href={routes.nearby.root()} />
        <ul className="no-scrollbar -mx-4 mt-2 flex snap-x gap-3 overflow-x-auto scroll-px-4 px-4 pb-1">
          {guide.map((g) => (
            <li key={g.label} className="w-[7.75rem] shrink-0 snap-start">
              <ImageTile href={g.href} label={g.label} sub={g.sub} image={g.image} icon={g.icon} tone={g.tone} imageClassName={g.imageClassName} sizes="124px" />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="kategoriler">
        <SectionHeader id="kategoriler" title="Kategoriler" />
        <ul className="mt-2 grid grid-cols-3 gap-x-3 gap-y-4">
          {CATEGORIES.map((c) => (
            <li key={c.label}>
              <ImageTile
                href={c.href}
                label={c.label}
                image={c.image}
                icon={c.icon}
                tone={c.tone}
                imageClassName={c.imageClassName}
                sizes="(max-width: 672px) 33vw, 220px"
              />
            </li>
          ))}
        </ul>
      </section>

      <Suspense fallback={<Skeleton className="h-[26rem] w-full rounded-3xl" />}>
        <PlacesSection />
      </Suspense>
    </div>
  );
}
