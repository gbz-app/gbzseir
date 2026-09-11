import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Banknote, CalendarDays, ChevronRight, Clock, ExternalLink, MapPin, PhoneOff, Ticket } from "lucide-react";
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
import { vocabIcon } from "@/features/business/lib/verticals";
import { eventDateLabel, eventPriceLabel, eventTimeLabel } from "@/features/events/format";
import { getEventBySlug } from "@/features/events/queries";
import { MiniMap } from "@/features/nearby/map/mini-map";

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

function InfoRow({ icon: Icon, title, text }: { icon: typeof MapPin; title: string; text?: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-primary">
        <Icon className="size-5" strokeWidth={1.75} aria-hidden />
      </span>
      <span className="min-w-0 pt-0.5">
        <span className="block font-semibold">{title}</span>
        {text ? <span className="block text-sm text-muted-foreground">{text}</span> : null}
      </span>
    </li>
  );
}

export default async function EventPage({ params }: Props) {
  const e = await getEventBySlug(normalizeSlug((await params).slug));
  if (!e) notFound();

  const cat = { label: e.category_label, icon: vocabIcon(e.category_icon, Ticket) };
  const hasLocation = typeof e.lat === "number" && typeof e.lng === "number";
  // A sample organizer's number is a placeholder, never the fallback.
  const phone = e.phone ?? (e.business && !e.business.is_demo ? e.business.phone : null);
  const url = `${SITE_URL}${routes.events.detail(e.slug)}`;
  const place = [e.venue_name, e.address].filter(Boolean);

  return (
    <>
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

      <DetailHero
        images={e.cover_url ? [e.cover_url] : []}
        alt={e.title}
        backHref={routes.events.root()}
        shareTitle={e.title}
        shareText={`${e.title} | ${APP_NAME}`}
        fallbackIcon={<Ticket className="size-16" strokeWidth={1.5} aria-hidden />}
      />

      <DetailSheet className="pb-36">
        <article className="flex flex-col gap-6">
          <header>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-brand-soft px-3 text-sm font-semibold text-primary">
                <cat.icon className="size-4" aria-hidden />
                {cat.label}
              </span>
              <span
                className={cn(
                  "inline-flex h-8 items-center rounded-full px-3 text-sm font-semibold",
                  e.is_free ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-muted",
                )}
              >
                {eventPriceLabel(e)}
              </span>
              {e.is_demo ? <DemoBadge /> : null}
            </div>
            <h1 className="mt-3 text-[1.625rem] leading-tight font-semibold tracking-tight text-balance">{e.title}</h1>
          </header>

          <ul className="flex flex-col gap-4">
            <InfoRow icon={CalendarDays} title={eventDateLabel(e.starts_at, e.ends_at)} />
            <InfoRow icon={Clock} title={eventTimeLabel(e.starts_at, e.ends_at)} />
            {place.length ? <InfoRow icon={MapPin} title={place[0]!} text={place[1]} /> : null}
            <InfoRow icon={Banknote} title={eventPriceLabel(e)} text={e.price_note ?? undefined} />
          </ul>

          {e.description ? (
            <section>
              <h2 className="mb-2 text-lg font-semibold">Etkinlik hakkında</h2>
              <p className="text-[15px] leading-relaxed whitespace-pre-line text-foreground/90">{e.description}</p>
            </section>
          ) : null}

          {e.business ? (
            <section>
              <h2 className="mb-2 text-lg font-semibold">Düzenleyen</h2>
              <Link
                href={routes.businesses.detail(e.business.slug)}
                className="flex items-center gap-3 rounded-3xl bg-card p-3 shadow-soft ring-1 ring-foreground/[0.05] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <BusinessLogo name={e.business.name} url={e.business.logo_url} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{e.business.name}</span>
                  <span className="text-sm text-muted-foreground">İşletme sayfasına git</span>
                </span>
                <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </section>
          ) : null}

          {hasLocation ? (
            <section>
              <h2 className="mb-2 text-lg font-semibold">Konum</h2>
              <MiniMap lat={e.lat!} lng={e.lng!} kind="place" name={e.venue_name ?? e.title} />
            </section>
          ) : null}

          <p className="text-xs leading-relaxed text-muted-foreground">
            Etkinlik bilgileri düzenleyen tarafından girilir. Gitmeden önce saat ve ücret bilgisini telefonla teyit etmeni öneririz.
          </p>
        </article>
      </DetailSheet>

      <DetailActions>
        {e.ticket_url ? (
          <Button asChild className={PRIMARY_CTA}>
            <a href={e.ticket_url} target="_blank" rel="noopener noreferrer">
              <ExternalLink /> Bilet al
            </a>
          </Button>
        ) : phone && e.is_demo ? (
          <p className="flex h-14 min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-muted px-4 text-[15px] font-semibold text-muted-foreground">
            <PhoneOff className="size-5 shrink-0" aria-hidden />
            <span className="truncate">Örnek kayıt - aranamaz</span>
          </p>
        ) : phone ? (
          <CallButton phone={phone} subjectType={e.business ? "business" : "poi"} subjectId={e.business?.id ?? e.id} label="Ara" variant="default" size="lg" className={PRIMARY_CTA} />
        ) : null}
        {hasLocation ? (
          <DirectionsButton
            lat={e.lat!}
            lng={e.lng!}
            name={e.venue_name ?? e.title}
            iconOnly={!!(e.ticket_url || phone)}
            variant="secondary"
            size="lg"
            className={e.ticket_url || phone ? SECONDARY_CTA : PRIMARY_CTA}
          />
        ) : null}
      </DetailActions>
    </>
  );
}
