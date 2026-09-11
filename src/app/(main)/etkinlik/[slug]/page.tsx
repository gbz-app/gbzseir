import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { BadgeCheck, Banknote, CalendarDays, CalendarPlus, ChevronRight, ExternalLink, MapPin, Ticket, UserRound, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DemoBadge } from "@/components/shared/badges";
import { CallButton } from "@/components/shared/call-button";
import { DirectionsButton } from "@/components/shared/directions-button";
import { DetailActions, DetailHero, DetailSheet, PRIMARY_CTA, SECONDARY_CTA } from "@/components/shared/detail-hero";
import { JsonLd } from "@/components/seo/json-ld";
import { APP_NAME, CITY, SITE_URL } from "@/config/site";
import { truncate } from "@/core/format";
import { routes } from "@/core/routes";
import { BusinessLogo } from "@/features/business/components/business-logo";
import { EventCategoryIcon, EventCoverFallback } from "@/features/events/components/event-card";
import { EventDateText, EventDescription, EventHeroMenu, EventOwnerLine, EventOwnerProvider, EventPlaceLink } from "@/features/events/components/event-detail-parts";
import { EventPhoneReveal } from "@/features/events/components/event-phone-reveal";
import { eventDateLabel, eventPriceLabel } from "@/features/events/format";
import { getEventBySlug, getVenueBusiness, type EventItem } from "@/features/events/queries";
import { isEventPast } from "@/features/events/status";
import { MapPreviewCard } from "@/components/maps/map-preview-card";

export const revalidate = 300;

export async function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ slug: string }> };

function normalizeSlug(raw: string): string {
  try {
    return decodeURIComponent(raw).trim().toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

/** Ended at render time (the page is ISR-cached for 5 minutes). */
function hasEnded(e: EventItem): boolean {
  return isEventPast(e, Date.now());
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const e = await getEventBySlug(normalizeSlug((await params).slug)).catch(() => null);
  if (!e) return { title: "Etkinlik bulunamadı", robots: { index: false } };
  const description = truncate(e.description?.trim() || `${e.title}: ${eventDateLabel(e.starts_at, e.ends_at)}, ${e.venue_name ?? CITY.name}.`, 160);
  return {
    title: e.title,
    description,
    alternates: { canonical: routes.events.detail(e.slug) },
    openGraph: { type: "website", locale: "tr_TR", siteName: APP_NAME, title: e.title, description, images: [{ url: e.cover_url ?? "/icons/og-image.png", alt: e.title }] },
  };
}

/** Round white icon + text lines, no card around it. */
function InfoRow({ icon: Icon, label, children, center }: { icon: LucideIcon; label: string; children: React.ReactNode; center?: boolean }) {
  return (
    <li className={cn("flex gap-3.5", center ? "items-center" : "items-start")}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-card text-primary">
        <Icon className="size-[1.15rem]" strokeWidth={1.9} aria-hidden />
      </span>
      <div className={cn("min-w-0 flex-1", !center && "pt-0.5")}>
        <span className="sr-only">{label}: </span>
        {children}
      </div>
    </li>
  );
}

const MAIN = "block text-[15px] leading-snug font-semibold";
const SUB = "block text-sm text-muted-foreground";
/** Black CTA without the Button's default shadow. */
const CTA = cn(PRIMARY_CTA, "shadow-none");
const ROUND = cn(SECONDARY_CTA, "shadow-none");

export default async function EventPage({ params }: Props) {
  const e = await getEventBySlug(normalizeSlug((await params).slug));
  if (!e) notFound();

  // The event takes place at another public business (e.g. a user's event at a café): link to it.
  const venue = e.venue_business_id && e.venue_business_id !== e.business?.id ? await getVenueBusiness(e.venue_business_id).catch(() => null) : null;
  const hasLocation = typeof e.lat === "number" && typeof e.lng === "number";
  // A sample organizer's number is a placeholder, never the fallback. A normal user's number is never public (reveal).
  const phone = e.phone ?? (e.business && !e.business.is_demo ? e.business.phone : null);
  const revealable = !e.business && e.has_contact_phone && !e.is_demo;
  const past = hasEnded(e);
  const ticket = !past && e.ticket_url ? e.ticket_url : null;
  const url = `${SITE_URL}${routes.events.detail(e.slug)}`;
  const calendarHref = routes.events.calendar(e.slug);
  const placeName = e.venue_name ?? venue?.name ?? null;
  const placeSub = e.address ?? (e.neighbourhood_name ? `${e.neighbourhood_name} Mah.` : null);
  const verified = (e.business?.verification_level ?? 0) >= 1;
  const organizerName = e.business ? null : (e.organizer_name ?? (revealable ? "Etkinlik sahibi" : null));

  // Bottom bar: the primary CTA depends on the event; "Takvime ekle" and "Yol tarifi" are round buttons next to it.
  // A sample (demo) event's number is a placeholder: no call control at all, the bar falls back to calendar / directions.
  const primary: "ticket" | "reveal" | "call" | "calendar" | "directions" | null = ticket
    ? "ticket"
    : revealable
      ? "reveal"
      : phone && !e.is_demo
        ? "call"
        : !past
          ? "calendar"
          : hasLocation
            ? "directions"
            : null;
  const roundCalendar = !past && primary !== "calendar";
  const roundDirections = hasLocation && primary !== "directions";

  const placeText = (
    <>
      <span className={MAIN}>{placeName ?? placeSub}</span>
      {placeName && placeSub ? <span className={SUB}>{placeSub}</span> : null}
    </>
  );

  return (
    <EventOwnerProvider eventId={e.id}>
      {/* Sample events stay out of structured data. */}
      {e.is_demo ? null : (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "Event",
            name: e.title,
            url,
            description: e.description ?? undefined,
            startDate: e.starts_at,
            endDate: e.ends_at ?? undefined,
            eventStatus: "https://schema.org/EventScheduled",
            eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
            image: e.cover_url ? [e.cover_url] : undefined,
            location: {
              "@type": "Place",
              name: e.venue_name ?? CITY.name,
              address: { "@type": "PostalAddress", streetAddress: e.address ?? undefined, addressLocality: CITY.name, addressRegion: CITY.province, addressCountry: "TR" },
              geo: hasLocation ? { "@type": "GeoCoordinates", latitude: e.lat, longitude: e.lng } : undefined,
            },
            offers: { "@type": "Offer", price: e.is_free ? 0 : (e.price_try ?? undefined), priceCurrency: "TRY", url: e.ticket_url ?? url },
            organizer: e.business ? { "@type": "Organization", name: e.business.name, url: `${SITE_URL}${routes.businesses.detail(e.business.slug)}` } : undefined,
          }}
        />
      )}

      <div className="relative">
        <DetailHero
          images={e.cover_url ? [e.cover_url] : []}
          alt={e.title}
          backHref={routes.events.root()}
          shareTitle={e.title}
          shareText={`${e.title} | ${APP_NAME}`}
          // No cover: the same purple gradient + category icon as the event cards (fills the whole hero).
          fallbackIcon={<EventCoverFallback icon={e.category_icon} iconClassName="size-16" />}
        />
        {/* "⋯" left of the hero's share button (1rem gutter + 2.75rem button + 0.5rem gap). */}
        <div className="absolute top-0 right-[4.25rem] pt-[calc(env(safe-area-inset-top,0px)+0.75rem)]">
          <EventHeroMenu eventId={e.id} title={e.title} />
        </div>
      </div>

      <DetailSheet className="pb-36">
        <article className="flex flex-col gap-8">
          <header>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-brand-soft px-2.5 text-[13px] font-semibold text-primary">
                <EventCategoryIcon icon={e.category_icon} className="size-3.5" aria-hidden />
                {e.category_label}
              </span>
              {e.is_demo ? <DemoBadge className="h-7" /> : null}
            </div>
            <h1 className="mt-3 text-[1.625rem] leading-tight font-semibold tracking-tight text-balance">{e.title}</h1>
            {past ? (
              <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                <span className="size-2 shrink-0 rounded-full bg-muted-foreground/60" aria-hidden />
                Bu etkinlik sona erdi
              </p>
            ) : null}
            <EventOwnerLine eventId={e.id} />
          </header>

          <ul className="flex flex-col gap-5">
            <InfoRow icon={CalendarDays} label="Tarih ve saat">
              <EventDateText starts={e.starts_at} ends={e.ends_at} />
            </InfoRow>

            {placeName || placeSub ? (
              <InfoRow icon={MapPin} label="Yer">
                {hasLocation ? (
                  <EventPlaceLink targetId="konum">{placeText}</EventPlaceLink>
                ) : (
                  placeText
                )}
                {venue ? (
                  <Link
                    href={routes.businesses.detail(venue.slug)}
                    className="mt-1 inline-flex items-center gap-0.5 rounded-md text-sm font-semibold text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {venue.name} sayfası <ChevronRight className="size-4" aria-hidden />
                  </Link>
                ) : null}
              </InfoRow>
            ) : null}

            <InfoRow icon={Banknote} label="Ücret">
              <span className={cn(MAIN, e.is_free && "text-emerald-700 dark:text-emerald-400")}>{eventPriceLabel(e)}</span>
              {e.price_note ? <span className={SUB}>{e.price_note}</span> : null}
              {ticket ? (
                <a
                  href={ticket}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 rounded-md text-sm font-semibold text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  Bilet al <ExternalLink className="size-3.5" aria-hidden />
                </a>
              ) : null}
            </InfoRow>

            {e.business ? (
              <li className="flex items-center gap-3.5">
                <Link
                  href={routes.businesses.detail(e.business.slug)}
                  className="flex min-w-0 flex-1 items-center gap-3.5 rounded-2xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <BusinessLogo name={e.business.name} url={e.business.logo_url} size="sm" className="rounded-full ring-0" />
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-1 text-[15px] leading-snug font-semibold">
                      <span className="truncate">{e.business.name}</span>
                      {verified ? (
                        <>
                          <BadgeCheck className="size-4 shrink-0 text-teal-600 dark:text-teal-400" aria-hidden />
                          <span className="sr-only">(Onaylı işletme)</span>
                        </>
                      ) : null}
                    </span>
                    <span className={SUB}>Düzenleyen</span>
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
                {/* With a ticket link the bar's CTA is "Bilet al"; the organizer's number stays one tap away here. */}
                {primary === "ticket" && phone && !e.is_demo ? (
                  <CallButton
                    phone={phone}
                    subjectType="business"
                    subjectId={e.business.id}
                    label="Ara"
                    iconOnly
                    variant="secondary"
                    className="bg-card shadow-none hover:bg-muted"
                  />
                ) : null}
              </li>
            ) : organizerName ? (
              <InfoRow icon={UserRound} label="Düzenleyen" center>
                <span className="flex items-center gap-3">
                  <span className="min-w-0 flex-1">
                    <span className={cn(MAIN, "truncate")}>{organizerName}</span>
                    <span className={SUB}>Düzenleyen</span>
                  </span>
                  {primary === "ticket" && revealable ? (
                    <EventPhoneReveal eventId={e.id} size="default" className="h-11 shrink-0 rounded-full bg-card px-4 text-sm text-foreground shadow-none hover:bg-muted" />
                  ) : null}
                </span>
              </InfoRow>
            ) : null}
          </ul>

          {e.description ? (
            <section>
              <h2 className="mb-2 text-base font-semibold">Hakkında</h2>
              <EventDescription text={e.description} />
            </section>
          ) : null}

          {hasLocation ? (
            <section id="konum" tabIndex={-1} className="scroll-mt-6 outline-none">
              <h2 className="mb-2 text-base font-semibold">Konum</h2>
              <MapPreviewCard lat={e.lat!} lng={e.lng!} kind="place" name={e.venue_name ?? e.title} />
              <div className="mt-3 flex items-center gap-3">
                <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{placeSub ?? placeName ?? CITY.name}</p>
                <DirectionsButton lat={e.lat!} lng={e.lng!} name={e.venue_name ?? e.title} size="sm" variant="secondary" className="shrink-0 bg-card shadow-none hover:bg-muted" />
              </div>
            </section>
          ) : null}

          <p className="text-xs leading-relaxed text-muted-foreground">Bilgileri düzenleyen girer. Gitmeden önce saat ve ücreti teyit etmeni öneririz.</p>
        </article>
      </DetailSheet>

      {primary || roundCalendar || roundDirections ? (
        <DetailActions>
          {primary === "ticket" ? (
            <Button asChild className={CTA}>
              <a href={ticket!} target="_blank" rel="noopener noreferrer">
                <Ticket /> Bilet al
              </a>
            </Button>
          ) : primary === "reveal" ? (
            <EventPhoneReveal eventId={e.id} className={CTA} />
          ) : primary === "call" ? (
            <CallButton
              phone={phone!}
              subjectType={e.business ? "business" : "event"}
              subjectId={e.business?.id ?? e.id}
              label="Ara"
              variant="default"
              size="lg"
              className={CTA}
            />
          ) : primary === "calendar" ? (
            <Button asChild className={CTA}>
              <a href={calendarHref} rel="nofollow">
                <CalendarPlus /> Takvime ekle
              </a>
            </Button>
          ) : primary === "directions" ? (
            <DirectionsButton lat={e.lat!} lng={e.lng!} name={e.venue_name ?? e.title} variant="default" size="lg" className={CTA} />
          ) : null}
          {roundCalendar ? (
            <Button asChild variant="secondary" size="icon" className={ROUND}>
              <a href={calendarHref} rel="nofollow" aria-label="Takvime ekle">
                <CalendarPlus />
              </a>
            </Button>
          ) : null}
          {roundDirections ? (
            <DirectionsButton lat={e.lat!} lng={e.lng!} name={e.venue_name ?? e.title} iconOnly variant="secondary" size="lg" className={ROUND} />
          ) : null}
        </DetailActions>
      ) : null}
    </EventOwnerProvider>
  );
}
