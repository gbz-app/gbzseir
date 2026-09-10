import { Suspense } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { tr } from "date-fns/locale";
import {
  Briefcase,
  Bus,
  Castle,
  Cross,
  MapPin,
  MoonStar,
  Newspaper,
  Plus,
  Search,
  Store,
  Tag,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_DESCRIPTION, APP_NAME, CITY, SITE_URL } from "@/config/site";
import { routes } from "@/core/routes";
import { Skeleton } from "@/components/ui/skeleton";
import { JsonLd } from "@/components/seo/json-ld";
import { FeaturedBusinessesRail } from "@/features/business/home-widgets";
import { AnnouncementsStrip, LatestNewsList } from "@/features/content/home-widgets";
import { HomeHero } from "@/features/home/components/home-hero";
import { PrayerProgress } from "@/features/home/components/prayer-progress";
import { listingPriceText, salaryText } from "@/features/listings/format";
import { getLatestListings } from "@/features/listings/server/queries";
import type { ListingCardData } from "@/features/listings/types";
import { buildDutyView } from "@/features/nearby/lib/duty-view";
import { describeWeather } from "@/features/nearby/lib/weather";
import { getCurrentWeather, getPrayerDays } from "@/features/nearby/server/external";
import { getDutyData, renderNow } from "@/features/nearby/server/queries";
import { PopularServicesRail } from "@/features/services/home-widgets";

export const revalidate = 300;

/** Card surface used across the home page (white, soft violet shadow, large radius). */
const CARD = "rounded-3xl bg-card shadow-soft ring-1 ring-foreground/[0.05]";

const EXPLORE: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: routes.nearby.dutyPharmacies(), label: "Eczane", icon: Cross },
  { href: routes.nearby.root("cami"), label: "Cami", icon: MoonStar },
  { href: routes.nearby.root("durak"), label: "Durak", icon: Bus },
  { href: routes.nearby.places(), label: "Gezilecek", icon: Castle },
  { href: routes.listings.root("ikinci-el"), label: "2. El", icon: Tag },
  { href: routes.listings.root("is-ilanlari"), label: "İş İlanı", icon: Briefcase },
  { href: routes.businesses.root(), label: "Firmalar", icon: Store },
  { href: routes.content.news(), label: "Gündem", icon: Newspaper },
];

const timeFmt = new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });

function ago(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : formatDistanceToNow(d, { addSuffix: true, locale: tr });
}

function BlockSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn("h-32 w-full rounded-3xl", className)} />;
}

function SectionTitle({ title, href }: { title: string; href?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {href ? (
        <Link href={href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
          Tümünü gör
        </Link>
      ) : null}
    </div>
  );
}

function ListingRow({ item, job }: { item: ListingCardData; job?: boolean }) {
  const Fallback = job ? Briefcase : Tag;
  const sub = job
    ? [item.business?.name, item.locationLabel ?? item.neighbourhoodName].filter(Boolean).join(" · ")
    : [item.neighbourhoodName, ago(item.postedAt)].filter(Boolean).join(" · ");
  const image = job ? item.business?.logo_url : (item.cover?.thumbUrl ?? item.cover?.url);
  return (
    <li>
      <Link href={job ? routes.listings.job(item.id) : routes.listings.classified(item.id)} className="flex items-center gap-3 py-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-soft text-primary">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" loading="lazy" className="size-full object-cover" />
          ) : (
            <Fallback className="size-5" strokeWidth={1.75} aria-hidden />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium">{item.title}</span>
          <span className="block truncate text-xs text-muted-foreground">{sub}</span>
        </span>
        <span className="max-w-[40%] shrink-0 truncate text-right text-sm font-semibold tabular-nums">
          {job ? salaryText(item.salaryMin, item.salaryMax, item.salaryHidden).replace("Maaş: ", "") : listingPriceText(item.price)}
        </span>
      </Link>
    </li>
  );
}

async function RecentListings() {
  const [classifieds, jobs] = await Promise.all([getLatestListings("classified", 4).catch(() => []), getLatestListings("job", 3).catch(() => [])]);
  if (!classifieds.length && !jobs.length) return null;
  return (
    <>
      {classifieds.length ? (
        <section className={cn(CARD, "px-5 pt-4 pb-1")}>
          <SectionTitle title="Son ilanlar" href={routes.listings.root("ikinci-el")} />
          <ul className="mt-1 divide-y divide-border/70">
            {classifieds.map((i) => (
              <ListingRow key={i.id} item={i} />
            ))}
          </ul>
        </section>
      ) : null}
      {jobs.length ? (
        <section className={cn(CARD, "px-5 pt-4 pb-1")}>
          <SectionTitle title="Son iş ilanları" href={routes.listings.root("is-ilanlari")} />
          <ul className="mt-1 divide-y divide-border/70">
            {jobs.map((i) => (
              <ListingRow key={i.id} item={i} job />
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

/** C1 - Ana sayfa (Anchor-style: soft lavender, floating cards, pill buttons). */
export default async function HomePage() {
  const [duty, weather, days] = await Promise.all([getDutyData().catch(() => null), getCurrentWeather(), getPrayerDays().catch(() => [])]);
  const now = renderNow();
  const view = duty ? buildDutyView(duty.rows, now) : null;
  const dutyCount = view?.current.length ?? 0;
  const dutyUntil = view ? timeFmt.format(view.currentWindow.end) : "08:30";
  const w = weather ? describeWeather(weather.code, weather.isDay) : null;
  const WeatherIcon = w?.icon;
  const weatherBadge = weather && w ? `${Math.round(weather.temperature)}° ${w.label}` : null;

  return (
    <div className="flex flex-col gap-5 px-4 pt-1 pb-8">
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

      <HomeHero weatherBadge={weatherBadge} />

      <div className="flex items-center justify-center gap-2.5">
        <Link
          href={routes.listings.post()}
          className="inline-flex h-12 items-center gap-2 rounded-full bg-primary px-6 text-[15px] font-semibold text-primary-foreground shadow-[0_10px_24px_-10px_var(--primary)] transition-transform outline-none active:scale-[0.97] focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Plus className="size-[18px]" aria-hidden /> İlan Ver
        </Link>
        <Link
          href={routes.search()}
          aria-label="Ara"
          className="flex size-12 items-center justify-center rounded-full bg-card shadow-soft ring-1 ring-foreground/[0.06] transition-transform outline-none active:scale-[0.97] focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Search className="size-5" strokeWidth={1.75} aria-hidden />
        </Link>
        <Link
          href={routes.services.root()}
          className="inline-flex h-12 items-center gap-2 rounded-full bg-card px-6 text-[15px] font-semibold shadow-soft ring-1 ring-foreground/[0.06] transition-transform outline-none active:scale-[0.97] focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Wrench className="size-[18px]" strokeWidth={1.75} aria-hidden /> Hizmet Al
        </Link>
      </div>

      <Link
        href={routes.business.intro()}
        className={cn(CARD, "flex items-center gap-4 bg-gradient-to-r from-card via-card to-brand-soft p-5 transition-transform active:scale-[0.99]")}
      >
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold">İşletmen mi var?</p>
          <p className="mt-1 text-sm leading-snug text-muted-foreground">Ücretsiz işletme sayfanı aç, {CITY.name}lilere ulaş.</p>
        </div>
        <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <Store className="size-8" strokeWidth={1.75} aria-hidden />
        </span>
      </Link>

      <div className="grid grid-cols-2 gap-3">
        <Link href={routes.nearby.dutyPharmacies()} className={cn(CARD, "block p-4 transition-transform active:scale-[0.98]")}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[15px] font-medium">Nöbetçi</span>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
              <span className="size-1.5 rounded-full bg-success" aria-hidden /> Açık
            </span>
          </div>
          <p className="mt-3 text-[1.75rem] leading-none font-medium tabular-nums">
            {dutyCount} <span className="text-sm font-normal text-muted-foreground">eczane</span>
          </p>
          <p className="mt-2 text-xs text-muted-foreground">{dutyUntil}&apos;a kadar açık</p>
        </Link>
        {weather && w && WeatherIcon ? (
          <div className={cn(CARD, "p-4")}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[15px] font-medium">Hava</span>
              <WeatherIcon className="size-5 text-highlight" strokeWidth={1.75} aria-hidden />
            </div>
            <p className="mt-3 text-[1.75rem] leading-none font-medium tabular-nums">{Math.round(weather.temperature)}°</p>
            <p className="mt-2 truncate text-xs text-muted-foreground">
              {w.label} · {CITY.name}
            </p>
          </div>
        ) : (
          <Link href={routes.nearby.root()} className={cn(CARD, "block p-4 transition-transform active:scale-[0.98]")}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[15px] font-medium">Yakınımda</span>
              <MapPin className="size-5 text-primary" strokeWidth={1.75} aria-hidden />
            </div>
            <p className="mt-3 text-base leading-snug font-medium">Eczane, cami, durak</p>
            <p className="mt-2 text-xs text-muted-foreground">Haritada gör</p>
          </Link>
        )}
      </div>

      {days.length ? <PrayerProgress days={days} serverNow={now} /> : null}

      <section className={cn(CARD, "p-4")}>
        <h2 className="px-1 text-[15px] font-semibold">Keşfet</h2>
        <ul className="mt-3 grid grid-cols-4 gap-y-4">
          {EXPLORE.map((e) => (
            <li key={e.label}>
              <Link href={e.href} className="group flex flex-col items-center gap-1.5 rounded-2xl text-center outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                <span className="flex size-12 items-center justify-center rounded-full bg-brand-soft text-primary transition-transform group-active:scale-95">
                  <e.icon className="size-5" strokeWidth={1.75} aria-hidden />
                </span>
                <span className="text-xs font-medium">{e.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <Suspense fallback={null}>
        <AnnouncementsStrip />
      </Suspense>

      <Suspense fallback={<BlockSkeleton className="h-64" />}>
        <RecentListings />
      </Suspense>

      <Suspense fallback={<BlockSkeleton />}>
        <PopularServicesRail />
      </Suspense>

      <Suspense fallback={<BlockSkeleton className="h-48" />}>
        <LatestNewsList />
      </Suspense>

      <Suspense fallback={<BlockSkeleton className="h-40" />}>
        <FeaturedBusinessesRail />
      </Suspense>
    </div>
  );
}
