import { Suspense } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { tr } from "date-fns/locale";
import {
  Briefcase,
  Bus,
  ChefHat,
  ChevronRight,
  Coffee,
  Cross,
  ExternalLink,
  Map as MapIcon,
  MoonStar,
  Store,
  Tag,
  UtensilsCrossed,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_DESCRIPTION, APP_NAME, SITE_URL } from "@/config/site";
import { routes } from "@/core/routes";
import { Skeleton } from "@/components/ui/skeleton";
import { JsonLd } from "@/components/seo/json-ld";
import { FeaturedBusinessesRail } from "@/features/business/home-widgets";
import { getNews } from "@/features/content/news/get-news";
import type { NewsItem } from "@/features/content/news/parse";
import { HomeHero } from "@/features/home/components/home-hero";
import { HomeSearch } from "@/features/home/components/home-search";
import { PlaceCard } from "@/features/nearby/components/place-card";
import { buildDutyView } from "@/features/nearby/lib/duty-view";
import { getDutyData, getPlaces, renderNow } from "@/features/nearby/server/queries";

export const revalidate = 300;

/** Card surface used across the home page. */
const CARD = "rounded-3xl bg-card shadow-soft ring-1 ring-foreground/[0.05]";
/** Horizontal scroller (full-bleed inside the page padding, no visible scrollbar). */
const RAIL = "no-scrollbar -mx-4 mt-3 flex snap-x gap-3 overflow-x-auto scroll-px-4 px-4 pt-1 pb-3";

type Tile = { href: string; label: string; text: string; icon: LucideIcon; tone: string };

const MAIN_CARDS: Tile[] = [
  {
    href: routes.businesses.root({ kategori: "yemek" }),
    label: "Yemek",
    text: "Lokanta ve ev yemekleri",
    icon: UtensilsCrossed,
    tone: "bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300",
  },
  {
    href: routes.businesses.root({ kategori: "restoran" }),
    label: "Restoran",
    text: "Gebze'nin restoranları",
    icon: ChefHat,
    tone: "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300",
  },
  {
    href: routes.businesses.root({ kategori: "kafe" }),
    label: "Kafe",
    text: "Kafe ve pastaneler",
    icon: Coffee,
    tone: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  },
  { href: routes.services.root(), label: "Hizmetler", text: "Usta ve hizmet al", icon: Wrench, tone: "bg-brand-soft text-primary" },
  {
    href: routes.listings.root("ikinci-el"),
    label: "İkinci El",
    text: "Al, sat, doğrudan ara",
    icon: Tag,
    tone: "bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300",
  },
  {
    href: routes.listings.root("is-ilanlari"),
    label: "İş İlanı",
    text: "Gebze ve OSB'ler",
    icon: Briefcase,
    tone: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
  },
];

function ago(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : formatDistanceToNow(d, { addSuffix: true, locale: tr });
}

function SectionHeader({ title, href }: { title: string; href?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {href ? (
        <Link href={href} className="inline-flex min-h-11 items-center gap-0.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
          Tümü <ChevronRight className="size-4" aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}

function RailSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden">
      <Skeleton className="h-44 w-64 shrink-0 rounded-3xl" />
      <Skeleton className="h-44 w-64 shrink-0 rounded-3xl" />
    </div>
  );
}

async function NewsCards() {
  const items: NewsItem[] = await getNews()
    .then((r) => r.items)
    .catch(() => []);
  const top = items.slice(0, 8);
  if (!top.length) return null;
  return (
    <section>
      <SectionHeader title="Gebze Gündemi" href={routes.content.news()} />
      <ul className={RAIL}>
        {top.map((n) => (
          <li key={n.id} className="w-[17rem] shrink-0 snap-start">
            <a
              href={n.url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(CARD, "flex h-full flex-col p-4 outline-none transition-transform active:scale-[0.98] focus-visible:ring-3 focus-visible:ring-ring/50")}
            >
              <span className="inline-flex w-fit max-w-full truncate rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold text-primary">{n.sourceName}</span>
              <span className="mt-3 line-clamp-3 text-[15px] leading-snug font-semibold">{n.title}</span>
              {n.summary ? <span className="mt-1.5 line-clamp-2 text-sm leading-snug text-muted-foreground">{n.summary}</span> : null}
              <span className="mt-auto flex items-center justify-between gap-2 pt-3 text-xs text-muted-foreground">
                <span className="truncate">{ago(n.publishedAt)}</span>
                <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-primary">
                  Kaynağa git <ExternalLink className="size-3.5" aria-hidden />
                </span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

async function PlacesCards() {
  const places = await getPlaces().catch(() => []);
  const top = places.slice(0, 8);
  if (!top.length) return null;
  return (
    <section>
      <SectionHeader title="Gezilecek Yerler" href={routes.nearby.places()} />
      <ul className={RAIL}>
        {top.map((p) => (
          <li key={p.id} className="w-[16rem] shrink-0 snap-start">
            <PlaceCard place={p} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** C1 - Ana sayfa: başlık, arama, Şehir Rehberi, ana kartlar, Gebze Gündemi, Gezilecek Yerler. */
export default async function HomePage() {
  const duty = await getDutyData().catch(() => null);
  const dutyCount = duty ? buildDutyView(duty.rows, renderNow()).current.length : 0;

  const guide: Tile[] = [
    {
      href: routes.nearby.dutyPharmacies(),
      label: "Nöbetçi Eczane",
      text: dutyCount ? `Şu an ${dutyCount} eczane açık` : "Bugün kim nöbette?",
      icon: Cross,
      tone: "bg-highlight-soft text-highlight-foreground dark:text-highlight",
    },
    {
      href: routes.nearby.root("cami"),
      label: "Camiler",
      text: "Namaz vakitleri ve yol tarifi",
      icon: MoonStar,
      tone: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
    },
    {
      href: routes.nearby.root("durak"),
      label: "Duraklar",
      text: "Yakındaki duraklar ve hatlar",
      icon: Bus,
      tone: "bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300",
    },
    { href: routes.nearby.root(), label: "Harita", text: "Yakınındakileri keşfet", icon: MapIcon, tone: "bg-brand-soft text-primary" },
    {
      href: routes.businesses.root(),
      label: "Firmalar",
      text: "Onaylı işletmeler",
      icon: Store,
      tone: "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300",
    },
  ];

  return (
    <div className="flex flex-col gap-6 px-4 pt-1 pb-8">
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

      <section>
        <SectionHeader title="Şehir Rehberi" href={routes.nearby.root()} />
        <ul className={RAIL}>
          {guide.map((g) => (
            <li key={g.label} className="shrink-0 snap-start">
              <Link
                href={g.href}
                className={cn(CARD, "flex w-[16.5rem] items-center gap-3 p-3 outline-none transition-transform active:scale-[0.98] focus-visible:ring-3 focus-visible:ring-ring/50")}
              >
                <span className={cn("flex size-16 shrink-0 items-center justify-center rounded-2xl", g.tone)}>
                  <g.icon className="size-7" strokeWidth={1.75} aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-semibold">{g.label}</span>
                  <span className="mt-0.5 line-clamp-2 block text-xs leading-snug text-muted-foreground">{g.text}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Kategoriler">
        <ul className="grid grid-cols-2 gap-3">
          {MAIN_CARDS.map((m) => (
            <li key={m.label}>
              <Link
                href={m.href}
                className={cn(CARD, "flex h-full flex-col gap-3 p-4 outline-none transition-transform active:scale-[0.98] focus-visible:ring-3 focus-visible:ring-ring/50")}
              >
                <span className={cn("flex size-12 items-center justify-center rounded-2xl", m.tone)}>
                  <m.icon className="size-6" strokeWidth={1.75} aria-hidden />
                </span>
                <span>
                  <span className="block text-base font-semibold">{m.label}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{m.text}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <Suspense fallback={<RailSkeleton />}>
        <NewsCards />
      </Suspense>

      <Suspense fallback={<RailSkeleton />}>
        <PlacesCards />
      </Suspense>

      <Suspense fallback={<Skeleton className="h-40 w-full rounded-3xl" />}>
        <FeaturedBusinessesRail />
      </Suspense>
    </div>
  );
}
