import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  AtSign,
  Briefcase,
  CalendarDays,
  ChevronRight,
  Globe,
  Handshake,
  Images,
  MapPin,
  MessageSquareReply,
  Phone,
  QrCode,
  ShieldCheck,
  Sparkles,
  Star,
  Tag,
  TreePalm,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { VerifiedBadge } from "@/components/shared/badges";
import { CallButton } from "@/components/shared/call-button";
import { DirectionsButton } from "@/components/shared/directions-button";
import { DetailActions, DetailHero, DetailSheet, PRIMARY_CTA, SECONDARY_CTA } from "@/components/shared/detail-hero";
import { PriceText } from "@/components/shared/price-text";
import { ReportSheet } from "@/components/shared/report-sheet";
import { JsonLd } from "@/components/seo/json-ld";
import { APP_NAME, CITY, SITE_URL } from "@/config/site";
import { formatDate, formatNumber, formatPrice, truncate } from "@/core/format";
import { routes } from "@/core/routes";
import { trCompare } from "@/core/tr";
import { AddressDirections } from "@/features/business/components/firm/address-directions";
import { FirmTabs, type FirmTab } from "@/features/business/components/firm/firm-tabs";
import { ReviewComposer } from "@/features/business/components/firm/review-composer";
import { DoctorGrid } from "@/features/business/components/doctors/doctor-grid";
import { hasDoctors, type Doctor, type DoctorBranch } from "@/features/business/components/doctors/doctor-meta";
import { getBusinessDoctors, getDoctorBranches } from "@/features/business/components/doctors/queries";
import { RoomList } from "@/features/business/components/firm/room-list";
import { FirmGallery } from "@/features/business/components/firm-gallery";
import { FirmMoreMenu } from "@/features/business/components/firm-more-menu";
import { MenuSections, menuItemCount } from "@/features/business/components/menu-view";
import { OpenNowStatus, WorkingHoursTable } from "@/features/business/components/open-now";
import { Stars, formatRating } from "@/features/business/components/rating";
import {
  DAY_KEYS,
  hasAnyHours,
  isOnVacation,
  openingHoursSpecification,
  parseWorkingHours,
  vacationReturnLabel,
  type WorkingHours,
} from "@/features/business/lib/hours";
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
import { getVocabularies } from "@/features/business/lib/vocabularies";
import { getBusinessMenu, getBusinessRooms, getBusinessServices, type BusinessService, type MenuSection, type Room } from "@/features/business/lib/vertical-queries";
import { ServiceList } from "@/features/business/components/service-list";
import { LISTABLE_VERTICALS, VERTICAL_INFO, amenityList, hasMenu, hasRooms, priceLevelInfo, resolveVertical, type Vertical } from "@/features/business/lib/verticals";
import { EventCard } from "@/features/events/components/event-card";
import { listBusinessEvents, type EventItem } from "@/features/events/queries";
import { MapPreviewCard } from "@/components/maps/map-preview-card";

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

const SCHEMA_TYPE: Partial<Record<Vertical, string>> = { yemek: "Restaurant", restoran: "Restaurant", kafe: "CafeOrCoffeeShop", otel: "Hotel", magaza: "Store" };

/** Hero photo height: 100 px shorter than the shared DetailHero default. */
const HERO_HEIGHT = "h-[calc(min(52vh,26rem)_-_100px)] min-h-[188px]";

async function neighbourhoodTotal(): Promise<number> {
  const { count } = await createPublicClient().from("neighbourhoods").select("id", { count: "exact", head: true });
  return count ?? 0;
}

function isAlwaysOpen(hours: WorkingHours): boolean {
  return DAY_KEYS.every((k) => hours[k]?.open === "00:00" && hours[k]?.close === "23:59");
}

/** "@handle" or a full URL -> { href, label }. */
function instagramLink(value: string | null): { href: string; label: string } | null {
  const v = value?.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return { href: v, label: v.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "") };
  const handle = v.replace(/^@/, "");
  return { href: `https://instagram.com/${encodeURIComponent(handle)}`, label: `@${handle}` };
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
  const image = b.cover_url ?? b.photos[0]?.url ?? b.logo_url;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "website", locale: "tr_TR", siteName: APP_NAME, title, description, url, images: [{ url: image ?? "/icons/og-image.png", alt: b.name }] },
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

function Section({ title, icon: Icon, children, action }: { title: string; icon?: typeof Star; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          {Icon ? <Icon className="size-5 text-primary" aria-hidden /> : null}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Heading of a single-content tab panel (the tab already shows it visually). */
function PanelTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="sr-only">{children}</h2>;
}

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col items-center justify-center rounded-2xl bg-card px-2 py-3 text-center">
      <div className="max-w-full truncate text-[17px] leading-tight font-semibold tabular-nums">{children}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

const TILE_LINK = "rounded-2xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
const CARD_ROW = "flex min-h-14 items-center gap-3 px-4 py-3 text-[15px] outline-none hover:bg-muted/40 focus-visible:bg-muted/60";

function ReviewItem({ r, businessName }: { r: PublicReview; businessName: string }) {
  return (
    <li className="rounded-3xl bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold">{r.author_name ?? `${APP_NAME} kullanıcısı`}</p>
        <time dateTime={r.created_at} className="text-xs text-muted-foreground">
          {formatDate(r.created_at, { month: "long" })}
        </time>
      </div>
      <Stars value={r.rating} className="mt-1" />
      {r.comment ? <p className="mt-2 text-[15px] leading-relaxed whitespace-pre-line">{r.comment}</p> : null}
      {r.reply ? (
        <div className="mt-3 rounded-2xl bg-muted/70 px-3.5 py-3 text-sm">
          <p className="flex items-center gap-1.5 text-xs font-bold text-primary">
            <MessageSquareReply className="size-3.5" aria-hidden /> {businessName} yanıtladı
          </p>
          <p className="mt-1 leading-relaxed whitespace-pre-line">{r.reply}</p>
        </div>
      ) : null}
      <div className="mt-1 -mb-2 flex justify-end">
        <ReportSheet targetType="review" targetId={r.id} className="-mr-2" />
      </div>
    </li>
  );
}

function ListingItem({ l }: { l: BusinessListing }) {
  const isJob = l.type === "job";
  return (
    <li>
      <Link
        href={isJob ? routes.listings.job(l.id) : routes.listings.classified(l.id)}
        className="flex items-center gap-3 rounded-3xl bg-card p-3 outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {l.thumb_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={l.thumb_url} alt="" loading="lazy" className="size-14 shrink-0 rounded-2xl object-cover" />
        ) : (
          <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
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

  const vertical = resolveVertical(b.vertical, b.kinds);
  const info = VERTICAL_INFO[vertical];
  const offersServices = b.kinds.includes("service") || vertical === "hizmet";
  const withDoctors = hasDoctors(vertical);
  const [reviews, listings, allCategories, totalNeighbourhoods, menu, rooms, events, services, vocab, doctors, doctorBranches] = await Promise.all([
    getBusinessReviews(b.id).catch(() => [] as PublicReview[]),
    getBusinessActiveListings(b.id).catch(() => [] as BusinessListing[]),
    getServiceCategories().catch(() => [] as ServiceCategoryLite[]),
    neighbourhoodTotal().catch(() => 0),
    hasMenu(vertical) ? getBusinessMenu(b.id).catch(() => [] as MenuSection[]) : Promise.resolve([] as MenuSection[]),
    hasRooms(vertical) ? getBusinessRooms(b.id).catch(() => [] as Room[]) : Promise.resolve([] as Room[]),
    listBusinessEvents(b.id).catch(() => [] as EventItem[]),
    offersServices ? getBusinessServices(b.id).catch(() => [] as BusinessService[]) : Promise.resolve([] as BusinessService[]),
    getVocabularies(),
    withDoctors ? getBusinessDoctors(b.id).catch(() => [] as Doctor[]) : Promise.resolve([] as Doctor[]),
    withDoctors ? getDoctorBranches() : Promise.resolve(undefined as readonly DoctorBranch[] | undefined),
  ]);

  const url = `${SITE_URL}${routes.businesses.detail(b.slug)}`;
  const hours = parseWorkingHours(b.working_hours);
  const showHours = hasAnyHours(hours);
  const alwaysOpen = showHours && isAlwaysOpen(hours);
  // Tatil modu (only these two fields go to the client status). The server check is as fresh as this ISR render;
  // the header status re-checks on the client.
  const vacation = { vacation_mode: b.vacation_mode, vacation_until: b.vacation_until };
  const onVacation = isOnVacation(vacation);
  const vacationBack = onVacation ? vacationReturnLabel(b.vacation_until) : null;
  const isService = offersServices;
  const verified = b.verification_level >= 1;
  const hasLocation = typeof b.lat === "number" && typeof b.lng === "number";
  const groups = groupCategories(b.categories, allCategories);
  const coversAll = totalNeighbourhoods > 0 && b.areas.length >= totalNeighbourhoods;
  const jobs = listings.filter((l) => l.type === "job");
  const classifieds = listings.filter((l) => l.type !== "job");
  const memberSince = b.approved_at ?? b.created_at;
  const amenities = amenityList(b.amenities, vocab.amenities);
  const priceLevel = priceLevelInfo(b.price_level);
  const itemCount = menuItemCount(menu);
  const availableRooms = rooms.filter((r) => r.is_available && r.price_try != null);
  const minRoomPrice = availableRooms.length ? Math.min(...availableRooms.map((r) => r.price_try!)) : null;
  const heroImages = [...new Set([b.cover_url, ...b.photos.map((p) => p.url)].filter((u): u is string => !!u))];
  const backHref = LISTABLE_VERTICALS.includes(vertical) ? routes.businesses.vertical(vertical) : routes.businesses.root();
  const areaLine = `${b.neighbourhood_name ? `${b.neighbourhood_name} Mah., ` : ""}${CITY.name}`;
  const instagram = instagramLink(b.instagram);
  // Sample firm: shown like a real one, but its number is a placeholder: no call buttons at all (only directions)
  // and no LocalBusiness/review JSON-LD.
  const isDemo = b.is_demo;
  const callPhone = isDemo ? null : b.phone;

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": SCHEMA_TYPE[vertical] ?? "LocalBusiness",
    "@id": url,
    name: b.name,
    url,
    description: b.description ?? undefined,
    // Sample firms are not callable: their number never goes into the page (JSON-LD included).
    telephone: isDemo ? undefined : (b.phone ?? undefined),
    image: heroImages.slice(0, 4),
    logo: b.logo_url ?? undefined,
    priceRange: priceLevel?.symbol,
    starRating: b.star_rating ? { "@type": "Rating", ratingValue: b.star_rating } : undefined,
    // schema.org hasMenu belongs to FoodEstablishment; a hotel's menu stays on the page but not in its Hotel JSON-LD.
    hasMenu: itemCount && vertical !== "otel" ? `${SITE_URL}${routes.businesses.menu(b.slug)}` : undefined,
    address: { "@type": "PostalAddress", streetAddress: b.address ?? undefined, addressLocality: CITY.name, addressRegion: CITY.province, addressCountry: "TR" },
    geo: hasLocation ? { "@type": "GeoCoordinates", latitude: b.lat, longitude: b.lng } : undefined,
    areaServed: isService
      ? coversAll || b.areas.length === 0
        ? { "@type": "City", name: CITY.name }
        : b.areas.map((a) => ({ "@type": "Place", name: `${a.name}, ${CITY.name}` }))
      : undefined,
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
      { "@type": "ListItem", position: 2, name: info.plural, item: `${SITE_URL}${backHref}` },
      { "@type": "ListItem", position: 3, name: b.name, item: url },
    ],
  };

  // Third stat tile depends on the vertical.
  let thirdTile: { label: string; value: React.ReactNode; href?: string } | null = null;
  if (vertical === "otel" && minRoomPrice != null) thirdTile = { label: "gecelik, en düşük", value: formatPrice(minRoomPrice), href: "#odalar" };
  else if (priceLevel) thirdTile = { label: priceLevel.label, value: priceLevel.symbol };
  else if (isService) thirdTile = { label: "yanıtlanan talep", value: formatNumber(b.leads_accepted_count) };
  else thirdTile = { label: "üyelik", value: <span className="capitalize">{monthYear.format(new Date(memberSince)).split(" ")[1]}</span> };

  // ---------------------------------------------------------------------------
  // Tab panels (all server-rendered; FirmTabs only toggles `hidden`)
  // ---------------------------------------------------------------------------
  const generalPanel = (
    <div className="flex flex-col gap-7">
      {b.description ? (
        <Section title="Hakkında">
          <p className="text-[15px] leading-relaxed whitespace-pre-line text-foreground/90">{b.description}</p>
        </Section>
      ) : null}

      {amenities.length ? (
        <Section title="Olanaklar" icon={Sparkles}>
          <ul className="flex flex-wrap gap-2">
            {amenities.map((a) => (
              <li key={a.key} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-card px-3 text-sm font-medium">
                <a.icon className="size-4 text-primary" aria-hidden />
                {a.label}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {showHours && !alwaysOpen ? (
        <Section title="Çalışma saatleri" icon={CalendarDays}>
          {onVacation ? (
            <p className="mb-2 flex items-center gap-2 px-1 text-sm font-semibold text-highlight-foreground dark:text-highlight">
              <TreePalm className="size-4 shrink-0" aria-hidden />
              İşletme şu an tatilde{vacationBack ? ` · Dönüş: ${vacationBack}` : ""}
            </p>
          ) : null}
          <WorkingHoursTable hours={hours} />
        </Section>
      ) : null}

      {b.address || hasLocation ? (
        <Section title="Konum" icon={MapPin}>
          <AddressDirections
            businessId={b.id}
            name={b.name}
            address={b.address ?? areaLine}
            lat={b.lat}
            lng={b.lng}
            query={[b.address, b.neighbourhood_name ? `${b.neighbourhood_name} Mah.` : null, CITY.name, CITY.province].filter(Boolean).join(", ")}
          />
          {hasLocation ? (
            <div className="mt-3">
              <MapPreviewCard lat={b.lat!} lng={b.lng!} kind="business" name={b.name} />
            </div>
          ) : null}
        </Section>
      ) : null}

      {callPhone || b.website || instagram ? (
        <Section title="İletişim" icon={Phone}>
          <div className="divide-y overflow-hidden rounded-3xl bg-card">
            {callPhone ? (
              <CallButton
                phone={callPhone}
                subjectType="business"
                subjectId={b.id}
                showNumber
                variant="ghost"
                className="h-14 w-full justify-start gap-3 rounded-none px-4 text-[15px] font-medium [&_svg]:text-primary"
              />
            ) : null}
            {b.website ? (
              <a href={b.website} target="_blank" rel="noopener noreferrer nofollow" className={CARD_ROW}>
                <Globe className="size-5 shrink-0 text-primary" aria-hidden />
                <span className="min-w-0 flex-1 truncate font-medium">{b.website.replace(/^https?:\/\//, "")}</span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </a>
            ) : null}
            {instagram ? (
              <a href={instagram.href} target="_blank" rel="noopener noreferrer nofollow" className={CARD_ROW}>
                <AtSign className="size-5 shrink-0 text-primary" aria-hidden />
                <span className="min-w-0 flex-1 truncate font-medium">{instagram.label}</span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </a>
            ) : null}
          </div>
        </Section>
      ) : null}

      {b.photos.length > 0 ? (
        <Section title={`Galeri (${b.photos.length})`} icon={Images}>
          <FirmGallery photos={b.photos} name={b.name} layout="grid" />
        </Section>
      ) : null}

      <Section title="Güven bilgileri" icon={ShieldCheck}>
        <dl className="grid grid-cols-2 gap-2.5">
          <div className="rounded-2xl bg-card p-3.5">
            <dt className="text-xs font-semibold text-muted-foreground">Üyelik tarihi</dt>
            <dd className="mt-1 font-semibold capitalize">{monthYear.format(new Date(memberSince))}</dd>
          </div>
          <div className="rounded-2xl bg-card p-3.5">
            <dt className="text-xs font-semibold text-muted-foreground">{isService ? "Yanıtladığı talep" : "Fotoğraf"}</dt>
            <dd className="mt-1 font-semibold tabular-nums">{formatNumber(isService ? b.leads_accepted_count : b.photos.length)}</dd>
          </div>
          {verified ? (
            <div className="col-span-2 flex items-start gap-2.5 rounded-2xl bg-brand-soft p-3.5 text-sm">
              <Sparkles className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
              <p>
                <strong className="text-primary">Onaylı işletme.</strong> Bilgileri {APP_NAME} ekibi tarafından incelendi.
              </p>
            </div>
          ) : null}
        </dl>
      </Section>
    </div>
  );

  const menuPanel = itemCount ? (
    <div className="flex flex-col gap-5">
      <PanelTitle>Menü</PanelTitle>
      <Link
        href={routes.businesses.menu(b.slug)}
        className="flex items-center gap-3 rounded-3xl bg-foreground p-4 text-background outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-background/15">
          <QrCode className="size-6" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Menüyü incele</span>
          <span className="text-sm text-background/75">
            {menu.length} bölüm · {itemCount} ürün · QR menü
          </span>
        </span>
        <ChevronRight className="size-5 shrink-0" aria-hidden />
      </Link>
      <MenuSections sections={menu.slice(0, 4)} itemLimit={3} />
      <Button asChild variant="outline" size="lg" className="w-full">
        <Link href={routes.businesses.menu(b.slug)}>Menünün tamamını gör ({itemCount} ürün)</Link>
      </Button>
    </div>
  ) : null;

  const roomsPanel = rooms.length ? (
    <div>
      <PanelTitle>Odalar</PanelTitle>
      <RoomList rooms={rooms} businessId={b.id} businessName={b.name} phone={isDemo ? null : b.phone} amenities={vocab.roomAmenities} />
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        {isDemo ? "Fiyatlar işletme tarafından girilir." : "Fiyatlar işletme tarafından girilir; müsaitlik ve rezervasyon için oteli ara."}
      </p>
    </div>
  ) : null;

  // Sağlık: doctors of the clinic; calls always go to the clinic's phone.
  const doctorsPanel = doctors.length ? (
    <div>
      <PanelTitle>Doktorlar</PanelTitle>
      <DoctorGrid doctors={doctors} branches={doctorBranches} businessId={b.id} businessName={b.name} phone={isDemo ? null : b.phone} isDemo={isDemo} />
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        {isDemo ? "Bilgiler klinik tarafından girilir." : "Bilgiler klinik tarafından girilir. Randevu için kliniği ara."}
      </p>
    </div>
  ) : null;

  const hasServiceInfo = isService && (services.length > 0 || groups.length > 0 || b.areas.length > 0);
  const servicesPanel = hasServiceInfo ? (
    <div className="flex flex-col gap-7">
      {services.length ? (
        <Section title="Hizmetler ve fiyatlar" icon={Wrench}>
          <ServiceList services={services} />
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {isDemo ? "Fiyatlar firma tarafından girilir." : "Fiyatlar firma tarafından girilir; kesin fiyat için firmayı ara."}
          </p>
        </Section>
      ) : null}

      {groups.length > 0 ? (
        <Section title={services.length ? "Hizmet kategorileri" : "Hizmetler"} icon={Wrench}>
          <div className="flex flex-col gap-3">
            {groups.map((g) => (
              <div key={g.name}>
                <p className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{g.name}</p>
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
            className="mt-4 flex items-center gap-3 rounded-3xl bg-card p-4 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Handshake className="size-6 shrink-0 text-primary" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">Ücretsiz teklif al</span>
              <span className="text-muted-foreground">Talebini oluştur; bu firma dahil uygun firmalar seni arasın.</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        </Section>
      ) : null}

      {b.areas.length > 0 ? (
        <Section title="Hizmet verdiği mahalleler" icon={MapPin}>
          {coversAll ? (
            <p className="rounded-2xl bg-brand-soft px-4 py-3 text-sm font-semibold text-primary">{CITY.name}&apos;nin tüm mahallelerine hizmet veriyor.</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {b.areas.map((a) => (
                <li key={a.id} className="rounded-full bg-card px-3 py-1.5 text-sm font-medium">
                  {a.name}
                </li>
              ))}
            </ul>
          )}
        </Section>
      ) : null}
    </div>
  ) : null;

  const reviewsPanel = (
    <div className="flex flex-col gap-3">
      <PanelTitle>Yorumlar</PanelTitle>
      {b.rating_count > 0 ? (
        <div className="flex items-center gap-4 rounded-3xl bg-card p-4">
          <p className="text-4xl font-semibold tabular-nums">{formatRating(b.rating_avg)}</p>
          <div>
            <Stars value={b.rating_avg} size="md" />
            <p className="mt-1 text-sm text-muted-foreground">{b.rating_count} değerlendirme</p>
          </div>
        </div>
      ) : null}
      <ReviewComposer businessId={b.id} businessName={b.name} />
      {reviews.length > 0 ? (
        <ul className="flex flex-col gap-2.5">
          {reviews.map((r) => (
            <ReviewItem key={r.id} r={r} businessName={b.name} />
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl bg-muted/60 px-4 py-4 text-sm text-muted-foreground">Henüz yorum yok. İlk yorumu sen yaz.</p>
      )}
    </div>
  );

  const eventsPanel = events.length ? (
    <div>
      <PanelTitle>Etkinlikler</PanelTitle>
      <ul className="flex flex-col gap-3">
        {events.map((e) => (
          <li key={e.id}>
            <EventCard event={e} />
          </li>
        ))}
      </ul>
    </div>
  ) : null;

  const listingsPanel = listings.length ? (
    <div className="flex flex-col gap-7">
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
    </div>
  ) : null;

  const tabs: FirmTab[] = [{ id: "genel", label: "Genel", content: generalPanel }];
  if (doctorsPanel) tabs.push({ id: "doktorlar", label: "Doktorlar", count: doctors.length, content: doctorsPanel });
  const menuTab: FirmTab | null = menuPanel ? { id: "menu", label: "Menü", content: menuPanel } : null;
  const roomsTab: FirmTab | null = roomsPanel ? { id: "odalar", label: "Odalar", count: rooms.length, content: roomsPanel } : null;
  // Hotels lead with their rooms; their menu (restaurant, room service) comes next.
  for (const t of vertical === "otel" ? [roomsTab, menuTab] : [menuTab, roomsTab]) if (t) tabs.push(t);
  if (servicesPanel) tabs.push({ id: "hizmetler", label: "Hizmetler", count: services.length || undefined, content: servicesPanel });
  tabs.push({ id: "yorumlar", label: "Yorumlar", count: b.rating_count, content: reviewsPanel });
  if (eventsPanel) tabs.push({ id: "etkinlikler", label: "Etkinlikler", count: events.length, content: eventsPanel });
  if (listingsPanel) tabs.push({ id: "ilanlar", label: jobs.length ? "İş ilanları" : "İlanlar", count: listings.length, content: listingsPanel });

  return (
    <>
      <JsonLd data={isDemo ? [breadcrumb] : [jsonLd, breadcrumb]} />

      <DetailHero
        images={heroImages}
        alt={`${b.name} fotoğrafı`}
        backHref={backHref}
        shareTitle={b.name}
        shareText={`${b.name} | ${APP_NAME}`}
        favorite={{ targetType: "business", targetId: b.id }}
        fallbackIcon={<info.icon className="size-16" strokeWidth={1.5} aria-hidden />}
        className={HERO_HEIGHT}
      />

      <DetailSheet className="pb-36">
        <article className="flex flex-col gap-6">
          <header>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-primary">{b.category_label ?? info.label}</p>
                <h1 className="mt-1 text-[1.625rem] leading-tight font-semibold tracking-tight text-balance">{b.name}</h1>
              </div>
              <FirmMoreMenu businessId={b.id} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-4" aria-hidden />
                {areaLine}
              </span>
              {verified ? <VerifiedBadge /> : null}
              {b.star_rating ? (
                <span className="inline-flex items-center gap-0.5 font-medium text-foreground" aria-label={`${b.star_rating} yıldızlı otel`}>
                  {Array.from({ length: b.star_rating }, (_, i) => (
                    <Star key={i} className="size-3.5 fill-highlight text-highlight" aria-hidden />
                  ))}
                </span>
              ) : null}
            </div>
            <div className="mt-2">{showHours || b.vacation_mode ? <OpenNowStatus hours={hours} alwaysOpen={alwaysOpen} vacation={vacation} /> : null}</div>
          </header>

          <div className="grid grid-cols-3 gap-2">
            <a href="#yorumlar" className={TILE_LINK}>
              <Tile label={b.rating_count ? "puan" : "henüz puan yok"}>
                <span className="inline-flex items-center gap-1">
                  <Star className="size-4 fill-highlight text-highlight" aria-hidden />
                  {b.rating_count ? formatRating(b.rating_avg) : "-"}
                </span>
              </Tile>
            </a>
            <a href="#yorumlar" className={TILE_LINK}>
              <Tile label="yorum">{formatNumber(b.rating_count)}</Tile>
            </a>
            {thirdTile.href ? (
              <a href={thirdTile.href} className={TILE_LINK}>
                <Tile label={thirdTile.label}>{thirdTile.value}</Tile>
              </a>
            ) : (
              <Tile label={thirdTile.label}>{thirdTile.value}</Tile>
            )}
          </div>

          {onVacation ? (
            <div role="note" className="flex items-start gap-3 rounded-2xl bg-highlight-soft px-4 py-3 text-sm text-highlight-foreground dark:text-foreground">
              <TreePalm className="mt-0.5 size-5 shrink-0 text-highlight" aria-hidden />
              <p>
                <strong className="block">Bu işletme şu an tatilde.</strong>
                {vacationBack ? `Dönüş tarihi: ${vacationBack}. ` : null}
                {isService
                  ? `Yeni talepleri geçici olarak almıyor.${b.phone && !isDemo ? " Acil bir durum için arayabilirsin." : ""}`
                  : b.phone && !isDemo
                    ? "Gitmeden önce aramanı öneririz."
                    : null}
              </p>
            </div>
          ) : null}

          <FirmTabs tabs={tabs} />
        </article>
      </DetailSheet>

      {/* Sample firms have no call button: directions becomes the big CTA. Nothing to show = no empty dock band. */}
      {callPhone || hasLocation ? (
        <DetailActions>
          {callPhone ? (
            <CallButton phone={callPhone} subjectType="business" subjectId={b.id} label="Ara" variant="default" size="lg" className={PRIMARY_CTA} />
          ) : null}
          {hasLocation ? (
            <DirectionsButton
              lat={b.lat!}
              lng={b.lng!}
              name={b.name}
              iconOnly={!!callPhone}
              variant="secondary"
              size="lg"
              subjectType="business"
              subjectId={b.id}
              className={callPhone ? SECONDARY_CTA : PRIMARY_CTA}
            />
          ) : null}
        </DetailActions>
      ) : null}
    </>
  );
}
