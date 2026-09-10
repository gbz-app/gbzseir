import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Briefcase, CalendarDays, ChevronRight, Handshake, MapPin, MessageSquareReply, ShieldCheck, Star, Tag, TreePalm, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/page-header";
import { VerifiedBadge } from "@/components/shared/badges";
import { FavoriteButton } from "@/components/shared/favorite-button";
import { DirectionsButton } from "@/components/shared/directions-button";
import { PriceText } from "@/components/shared/price-text";
import { JsonLd } from "@/components/seo/json-ld";
import { APP_NAME, CITY, SITE_URL } from "@/config/site";
import { formatDate, formatNumber, truncate } from "@/core/format";
import { routes } from "@/core/routes";
import { trCompare } from "@/core/tr";
import { BusinessLogo } from "@/features/business/components/business-logo";
import { FirmActionBar } from "@/features/business/components/firm-action-bar";
import { FirmGallery } from "@/features/business/components/firm-gallery";
import { FirmMoreMenu } from "@/features/business/components/firm-more-menu";
import { OpenNowStatus, WorkingHoursTable } from "@/features/business/components/open-now";
import { RatingInline, Stars, formatRating } from "@/features/business/components/rating";
import { hasAnyHours, openingHoursSpecification, parseWorkingHours } from "@/features/business/lib/hours";
import { KIND_SHORT_LABELS } from "@/features/business/lib/kinds";
import {
  getBusinessActiveListings,
  getBusinessReviews,
  getPublicBusinessBySlug,
  getServiceCategories,
  type BusinessListing,
  type PublicReview,
  type ServiceCategoryLite,
} from "@/features/business/lib/queries";
import { createPublicClient } from "@/features/business/lib/public-client";

export const revalidate = 300;

/** No paths at build time; every approved firm page is rendered on first visit and cached (ISR). */
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

const monthYear = new Intl.DateTimeFormat("tr-TR", { month: "long", year: "numeric", timeZone: "Europe/Istanbul" });

const WORK_TYPE_LABELS: Record<string, string> = {
  tam_zamanli: "Tam zamanlı",
  yari_zamanli: "Yarı zamanlı",
  vardiyali: "Vardiyalı",
  stajyer: "Stajyer",
  gunluk: "Günlük",
};

async function neighbourhoodTotal(): Promise<number> {
  const { count } = await createPublicClient().from("neighbourhoods").select("id", { count: "exact", head: true });
  return count ?? 0;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const b = await getPublicBusinessBySlug(normalizeSlug(slug)).catch(() => null);
  if (!b) return { title: "Firma bulunamadı", robots: { index: false } };
  const title = b.category_label ? `${b.name} - ${b.category_label}, ${CITY.name}` : `${b.name}, ${CITY.name}`;
  const description = truncate(
    b.description?.trim() ||
      `${b.name}: ${CITY.name}'de ${b.category_label ?? "işletme"}. Çalışma saatleri, müşteri yorumları, telefon ve yol tarifi ${APP_NAME}'de.`,
    160,
  );
  const url = routes.businesses.detail(b.slug);
  const image = b.cover_url ?? b.logo_url;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      locale: "tr_TR",
      siteName: APP_NAME,
      title,
      description,
      url,
      images: [{ url: image ?? "/icons/og-image.png", alt: b.name }],
    },
  };
}

function groupCategories(subs: ServiceCategoryLite[], all: ServiceCategoryLite[]): Array<{ name: string; items: ServiceCategoryLite[] }> {
  const byId = new Map(all.map((c) => [c.id, c]));
  const groups = new Map<string, { name: string; sort: number; items: ServiceCategoryLite[] }>();
  for (const c of subs) {
    const parent = c.parent_id ? byId.get(c.parent_id) : null;
    const key = parent?.id ?? c.id;
    const g = groups.get(key) ?? { name: parent?.name ?? c.name, sort: parent?.sort ?? c.sort, items: [] };
    g.items.push(c);
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => a.sort - b.sort || trCompare(a.name, b.name));
}

function Section({ id, title, icon: Icon, children, action }: { id?: string; title: string; icon?: typeof Star; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20" aria-labelledby={id ? `${id}-baslik` : undefined}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 id={id ? `${id}-baslik` : undefined} className="flex items-center gap-2 text-lg font-bold">
          {Icon ? <Icon className="size-5 text-primary" aria-hidden /> : null}
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function ReviewItem({ r, businessName }: { r: PublicReview; businessName: string }) {
  return (
    <li className="rounded-2xl bg-card p-4 shadow-soft ring-1 ring-foreground/[0.06]">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold">{r.author_name ?? "Gebzem kullanıcısı"}</p>
        <time dateTime={r.created_at} className="text-xs text-muted-foreground">
          {formatDate(r.created_at, { month: "long" })}
        </time>
      </div>
      <Stars value={r.rating} className="mt-1" />
      {r.comment ? <p className="mt-2 text-[15px] leading-relaxed whitespace-pre-line">{r.comment}</p> : null}
      {r.reply ? (
        <div className="mt-3 rounded-xl bg-muted/70 px-3.5 py-3 text-sm">
          <p className="flex items-center gap-1.5 text-xs font-bold text-primary">
            <MessageSquareReply className="size-3.5" aria-hidden /> {businessName} yanıtladı
          </p>
          <p className="mt-1 leading-relaxed whitespace-pre-line">{r.reply}</p>
        </div>
      ) : null}
    </li>
  );
}

function ListingItem({ l }: { l: BusinessListing }) {
  const isJob = l.type === "job";
  return (
    <li>
      <Link
        href={isJob ? routes.listings.job(l.id) : routes.listings.classified(l.id)}
        className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-soft ring-1 ring-foreground/[0.06] outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {l.thumb_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={l.thumb_url} alt="" loading="lazy" className="size-14 shrink-0 rounded-xl object-cover" />
        ) : (
          <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            {isJob ? <Briefcase className="size-6" aria-hidden /> : <Tag className="size-6" aria-hidden />}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-[15px] leading-snug font-semibold">{l.title}</span>
          <span className="mt-0.5 block text-sm">
            {isJob ? (
              l.job_salary_hidden || (l.job_salary_min == null && l.job_salary_max == null) ? (
                <span className="text-muted-foreground">{[WORK_TYPE_LABELS[l.job_work_type ?? ""], "Maaş görüşülür"].filter(Boolean).join(" · ")}</span>
              ) : (
                <>
                  <PriceText min={l.job_salary_min} max={l.job_salary_max} />
                  {l.job_work_type ? <span className="text-muted-foreground"> · {WORK_TYPE_LABELS[l.job_work_type] ?? ""}</span> : null}
                </>
              )
            ) : (
              <PriceText amount={l.price_try} />
            )}
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </li>
  );
}

export default async function FirmPage({ params }: Props) {
  const { slug } = await params;
  const b = await getPublicBusinessBySlug(normalizeSlug(slug));
  if (!b) notFound();

  const [reviews, listings, allCategories, totalNeighbourhoods] = await Promise.all([
    getBusinessReviews(b.id).catch(() => [] as PublicReview[]),
    getBusinessActiveListings(b.id).catch(() => [] as BusinessListing[]),
    getServiceCategories().catch(() => [] as ServiceCategoryLite[]),
    neighbourhoodTotal().catch(() => 0),
  ]);

  const url = `${SITE_URL}${routes.businesses.detail(b.slug)}`;
  const hours = parseWorkingHours(b.working_hours);
  const showHours = hasAnyHours(hours);
  const isService = b.kinds.includes("service");
  const verified = b.verification_level >= 1;
  const hasLocation = typeof b.lat === "number" && typeof b.lng === "number";
  const groups = groupCategories(b.categories, allCategories);
  const coversAll = totalNeighbourhoods > 0 && b.areas.length >= totalNeighbourhoods;
  const jobs = listings.filter((l) => l.type === "job");
  const classifieds = listings.filter((l) => l.type !== "job");
  const memberSince = b.approved_at ?? b.created_at;

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": url,
    name: b.name,
    url,
    description: b.description ?? undefined,
    telephone: b.phone ?? undefined,
    image: [b.cover_url, b.logo_url, ...b.photos.slice(0, 3).map((p) => p.url)].filter(Boolean),
    logo: b.logo_url ?? undefined,
    address: {
      "@type": "PostalAddress",
      streetAddress: b.address ?? undefined,
      addressLocality: CITY.name,
      addressRegion: CITY.province,
      addressCountry: "TR",
    },
    geo: hasLocation ? { "@type": "GeoCoordinates", latitude: b.lat, longitude: b.lng } : undefined,
    areaServed: coversAll || b.areas.length === 0 ? { "@type": "City", name: CITY.name } : b.areas.map((a) => ({ "@type": "Place", name: `${a.name}, ${CITY.name}` })),
    openingHoursSpecification: showHours ? openingHoursSpecification(hours) : undefined,
    aggregateRating:
      b.rating_count > 0
        ? { "@type": "AggregateRating", ratingValue: Number(b.rating_avg.toFixed(2)), reviewCount: b.rating_count, bestRating: 5, worstRating: 1 }
        : undefined,
    review: reviews
      .filter((r) => r.comment)
      .slice(0, 5)
      .map((r) => ({
        "@type": "Review",
        reviewRating: { "@type": "Rating", ratingValue: r.rating, bestRating: 5, worstRating: 1 },
        author: { "@type": "Person", name: r.author_name ?? `${APP_NAME} kullanıcısı` },
        datePublished: r.created_at.slice(0, 10),
        reviewBody: r.comment,
      })),
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Ana sayfa", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Firmalar", item: `${SITE_URL}${routes.businesses.root()}` },
      { "@type": "ListItem", position: 3, name: b.name, item: url },
    ],
  };

  return (
    <>
      <JsonLd data={[jsonLd, breadcrumb]} />
      <PageHeader
        title={b.name}
        subtitle={b.category_label ?? undefined}
        backHref={routes.businesses.root()}
        hideBottomNav
        actions={
          <>
            <FavoriteButton targetType="business" targetId={b.id} />
            <FirmMoreMenu businessId={b.id} />
          </>
        }
      />

      <article className="flex flex-col gap-7 px-4 pt-4 pb-32">
        <div>
          <div className="relative">
            <div className="aspect-[16/7] overflow-hidden rounded-3xl bg-linear-to-br from-brand-soft via-muted to-highlight-soft ring-1 ring-foreground/[0.06]">
              {b.cover_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={b.cover_url} alt={`${b.name} kapak fotoğrafı`} className="size-full object-cover" fetchPriority="high" />
              ) : null}
            </div>
            <BusinessLogo name={b.name} url={b.logo_url} size="xl" className="absolute -bottom-10 left-4 shadow-card ring-4 ring-background" />
          </div>

          <div className="mt-12">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl leading-tight font-extrabold text-balance">{b.name}</h2>
              {verified ? <VerifiedBadge /> : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {[b.category_label, b.neighbourhood_name ? `${b.neighbourhood_name} Mah.` : null, CITY.name].filter(Boolean).join(" · ")}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              {b.rating_count > 0 ? (
                <a href="#yorumlar" className="rounded-lg outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
                  <RatingInline avg={b.rating_avg} count={b.rating_count} showCountLabel />
                </a>
              ) : (
                <RatingInline avg={0} count={0} />
              )}
              {showHours ? <OpenNowStatus hours={hours} /> : null}
            </div>
            {b.kinds.length ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {b.kinds.map((k) => (
                  <Badge key={k} variant="secondary" className="h-6 px-2.5">
                    {KIND_SHORT_LABELS[k]}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {b.vacation_mode ? (
          <div role="note" className="flex items-start gap-3 rounded-2xl bg-highlight-soft px-4 py-3 text-sm text-highlight-foreground dark:text-foreground">
            <TreePalm className="mt-0.5 size-5 shrink-0 text-highlight" aria-hidden />
            <p>
              <strong className="block">Bu işletme şu an tatilde.</strong>
              Yeni hizmet taleplerini geçici olarak almıyor. Acil bir durum için arayabilirsin.
            </p>
          </div>
        ) : null}

        {b.description ? (
          <Section title="Hakkında">
            <p className="text-[15px] leading-relaxed whitespace-pre-line">{b.description}</p>
          </Section>
        ) : null}

        {isService && groups.length > 0 ? (
          <Section id="hizmetler" title="Hizmetler" icon={Wrench}>
            <div className="flex flex-col gap-3">
              {groups.map((g) => (
                <div key={g.name}>
                  <p className="mb-1.5 text-xs font-bold tracking-wide text-muted-foreground uppercase">{g.name}</p>
                  <ul className="flex flex-wrap gap-1.5">
                    {g.items.map((c) => (
                      <li key={c.id} className="rounded-full bg-brand-soft px-3 py-1.5 text-sm font-semibold text-primary">
                        {c.name}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <Link
              href={routes.services.root()}
              className="mt-4 flex items-center gap-3 rounded-2xl bg-info-soft p-4 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Handshake className="size-6 shrink-0 text-info" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block font-bold">Ücretsiz teklif al</span>
                <span className="text-muted-foreground">Talebini oluştur; bu firma dahil uygun firmalar seni arasın.</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          </Section>
        ) : null}

        {isService && b.areas.length > 0 ? (
          <Section title="Hizmet verdiği mahalleler" icon={MapPin}>
            {coversAll ? (
              <p className="rounded-2xl bg-brand-soft px-4 py-3 text-sm font-semibold text-primary">Gebze&apos;nin tüm mahallelerine hizmet veriyor.</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {b.areas.map((a) => (
                  <li key={a.id} className="rounded-full border bg-card px-3 py-1.5 text-sm font-medium">
                    {a.name}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        ) : null}

        {b.photos.length > 0 ? (
          <Section title="İş fotoğrafları">
            <FirmGallery photos={b.photos} name={b.name} />
          </Section>
        ) : null}

        {showHours ? (
          <Section title="Çalışma saatleri" icon={CalendarDays}>
            <WorkingHoursTable hours={hours} />
          </Section>
        ) : null}

        {b.address || hasLocation ? (
          <Section title="Adres" icon={MapPin}>
            <div className="flex items-center gap-3 rounded-2xl bg-card p-4 shadow-soft ring-1 ring-foreground/[0.06]">
              <p className="min-w-0 flex-1 text-[15px] leading-relaxed">
                {b.address ?? `${b.neighbourhood_name ? `${b.neighbourhood_name} Mah., ` : ""}${CITY.name}`}
                {b.address && b.neighbourhood_name ? <span className="block text-sm text-muted-foreground">{b.neighbourhood_name} Mah., {CITY.name}</span> : null}
              </p>
              {hasLocation ? <DirectionsButton lat={b.lat!} lng={b.lng!} name={b.name} size="sm" subjectType="business" subjectId={b.id} /> : null}
            </div>
          </Section>
        ) : null}

        <Section title="Güven bilgileri" icon={ShieldCheck}>
          <dl className="grid grid-cols-2 gap-2.5">
            <div className="rounded-2xl bg-card p-3.5 shadow-soft ring-1 ring-foreground/[0.06]">
              <dt className="text-xs font-semibold text-muted-foreground">Üyelik tarihi</dt>
              <dd className="mt-1 font-bold capitalize">{monthYear.format(new Date(memberSince))}</dd>
            </div>
            <div className="rounded-2xl bg-card p-3.5 shadow-soft ring-1 ring-foreground/[0.06]">
              <dt className="text-xs font-semibold text-muted-foreground">Yanıtladığı talep</dt>
              <dd className="mt-1 font-bold tabular-nums">{formatNumber(b.leads_accepted_count)}</dd>
            </div>
            {verified ? (
              <div className="col-span-2 flex items-start gap-2.5 rounded-2xl bg-brand-soft p-3.5 text-sm">
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                <p>
                  <strong className="text-primary">Onaylı işletme.</strong> Başvurusu {APP_NAME} ekibi tarafından incelendi ve onaylandı.
                </p>
              </div>
            ) : null}
          </dl>
        </Section>

        <Section id="yorumlar" title={b.rating_count > 0 ? `Yorumlar (${b.rating_count})` : "Yorumlar"} icon={Star}>
          {b.rating_count > 0 ? (
            <div className="mb-3 flex items-center gap-4 rounded-2xl bg-card p-4 shadow-soft ring-1 ring-foreground/[0.06]">
              <p className="text-4xl font-extrabold tabular-nums">{formatRating(b.rating_avg)}</p>
              <div>
                <Stars value={b.rating_avg} size="md" />
                <p className="mt-1 text-sm text-muted-foreground">{b.rating_count} değerlendirme</p>
              </div>
            </div>
          ) : null}
          {reviews.length > 0 ? (
            <ul className="flex flex-col gap-2.5">
              {reviews.map((r) => (
                <ReviewItem key={r.id} r={r} businessName={b.name} />
              ))}
            </ul>
          ) : (
            <p className="rounded-2xl bg-muted/60 px-4 py-4 text-sm text-muted-foreground">Henüz yorum yok.</p>
          )}
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Yorumları yalnızca bu firmayla {APP_NAME} üzerinden çalışan müşteriler yazabilir.
          </p>
        </Section>

        {jobs.length > 0 ? (
          <Section title="İş ilanları" icon={Briefcase}>
            <ul className="flex flex-col gap-2.5">
              {jobs.map((l) => (
                <ListingItem key={l.id} l={l} />
              ))}
            </ul>
          </Section>
        ) : null}

        {classifieds.length > 0 ? (
          <Section title="İlanları" icon={Tag}>
            <ul className="flex flex-col gap-2.5">
              {classifieds.map((l) => (
                <ListingItem key={l.id} l={l} />
              ))}
            </ul>
          </Section>
        ) : null}
      </article>

      <FirmActionBar businessId={b.id} name={b.name} phone={b.phone} lat={b.lat} lng={b.lng} />
    </>
  );
}
