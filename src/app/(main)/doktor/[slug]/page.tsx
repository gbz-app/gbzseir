import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { BadgeCheck, CalendarDays, ChevronRight, Clock, MapPin, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { BOTTOM_DOCK_SPACE } from "@/components/shared/bottom-dock";
import { CallButton } from "@/components/shared/call-button";
import { DirectionsButton } from "@/components/shared/directions-button";
import { DetailActions, PRIMARY_CTA, SECONDARY_CTA } from "@/components/shared/detail-hero";
import { JsonLd } from "@/components/seo/json-ld";
import { districtName } from "@/config/districts";
import { APP_NAME, CITY, SITE_URL } from "@/config/site";
import { truncate } from "@/core/format";
import { routes } from "@/core/routes";
import { DoctorAvatar, branchInfo } from "@/features/business/components/doctors/doctor-card";
import { DEFAULT_DOCTOR_BRANCH, doctorDisplayName } from "@/features/business/components/doctors/doctor-meta";
import { getDoctorBranches, getDoctorBySlug } from "@/features/business/components/doctors/queries";
import { DAY_KEYS, DAY_LABELS, DAY_SHORT_LABELS } from "@/features/business/lib/hours";
import { VERTICAL_INFO } from "@/features/business/lib/verticals";
import { DoctorTopBar } from "./doctor-top-bar";

export const revalidate = 300;

/** No paths at build time; every doctor page is rendered on first visit and cached (ISR), like the firm pages. */
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

/** schema.org MedicalSpecialty of the built-in branches (branches added later by admins have none). */
const SPECIALTY: Record<string, string[]> = {
  dis_hekimi: ["Dentistry"],
  kadin_dogum: ["Gynecologic", "Obstetric"],
  cocuk: ["Pediatric"],
  kardiyoloji: ["Cardiovascular"],
  ortopedi: ["Musculoskeletal"],
  fizik_tedavi: ["Physiotherapy"],
  dermatoloji: ["Dermatology"],
  kbb: ["Otolaryngologic"],
  noroloji: ["Neurologic"],
  psikiyatri: ["Psychiatric"],
  diyetisyen: ["DietNutrition"],
  pratisyen: ["PrimaryCare"],
};

const CARD = "rounded-3xl bg-card p-4";
const CARD_TITLE = "flex items-center gap-2 text-[15px] font-semibold";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [d, branches] = await Promise.all([getDoctorBySlug(normalizeSlug(slug)).catch(() => null), getDoctorBranches()]);
  if (!d) return { title: "Doktor bulunamadı", robots: { index: false } };
  const name = doctorDisplayName(d);
  const hasBranch = d.branch !== DEFAULT_DOCTOR_BRANCH;
  const branch = branchInfo(d.branch, branches).label;
  const district = districtName(d.clinic.district_id);
  const title = hasBranch ? `${name} - ${branch}, ${district}` : `${name} - ${d.clinic.name}, ${district}`;
  const description = truncate(
    d.bio?.trim() || `${name}${hasBranch ? `, ${branch}` : ""}: ${d.clinic.name}, ${district}. Çalışma günleri, klinik telefonu ve yol tarifi ${APP_NAME}'de.`,
    160,
  );
  const url = routes.doctors.detail(d.slug);
  return {
    title,
    description,
    alternates: { canonical: url },
    // Sample people are not real doctors: never indexed.
    robots: d.is_demo || d.clinic.is_demo ? { index: false } : undefined,
    openGraph: {
      type: "profile",
      locale: "tr_TR",
      siteName: APP_NAME,
      title,
      description,
      url,
      images: [{ url: d.photo_url ?? d.clinic.logo_url ?? "/icons/og-image.png", alt: name }],
    },
  };
}

/** Doctor profile: photo, title and name, branch, the clinic (link), working days, short bio; calls go to the clinic. */
export default async function DoctorPage({ params }: Props) {
  const { slug } = await params;
  const [d, branches] = await Promise.all([getDoctorBySlug(normalizeSlug(slug)), getDoctorBranches()]);
  if (!d) notFound();

  const { clinic } = d;
  const name = doctorDisplayName(d);
  const { label: branch, Icon: BranchIcon } = branchInfo(d.branch, branches);
  const district = districtName(clinic.district_id);
  const clinicHref = routes.businesses.detail(clinic.slug);
  const url = `${SITE_URL}${routes.doctors.detail(d.slug)}`;
  const clinicUrl = `${SITE_URL}${clinicHref}`;
  // Sample clinics' numbers are placeholders: no call button and no structured data.
  const isDemo = d.is_demo || clinic.is_demo;
  const canCall = !!clinic.phone && !clinic.is_demo;
  const hasLocation = typeof clinic.lat === "number" && typeof clinic.lng === "number";
  const hasDock = canCall || hasLocation;
  const worked = new Set(d.days);
  const ClinicIcon = VERTICAL_INFO.saglik.icon;

  const address = {
    "@type": "PostalAddress",
    streetAddress: clinic.address ?? undefined,
    addressLocality: district,
    addressRegion: CITY.province,
    addressCountry: "TR",
  };
  const specialty = SPECIALTY[d.branch]?.map((s) => `https://schema.org/${s}`);
  // IndividualPhysician (a Physician): schema.org links the person to the clinic with practicesAt (worksFor is a
  // Person property and is not defined on the Physician types).
  const physician: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "IndividualPhysician",
    "@id": url,
    name,
    url,
    image: d.photo_url ?? undefined,
    description: d.bio ?? undefined,
    medicalSpecialty: specialty && specialty.length === 1 ? specialty[0] : specialty,
    address,
    geo: hasLocation ? { "@type": "GeoCoordinates", latitude: clinic.lat, longitude: clinic.lng } : undefined,
    practicesAt: {
      "@type": "MedicalClinic",
      "@id": clinicUrl,
      name: clinic.name,
      url: clinicUrl,
      logo: clinic.logo_url ?? undefined,
      telephone: clinic.phone ?? undefined,
      address,
    },
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Ana sayfa", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: VERTICAL_INFO.saglik.plural, item: `${SITE_URL}${routes.businesses.vertical("saglik")}` },
      { "@type": "ListItem", position: 3, name: clinic.name, item: clinicUrl },
      { "@type": "ListItem", position: 4, name, item: url },
    ],
  };

  return (
    <>
      <JsonLd data={isDemo ? [breadcrumb] : [physician, breadcrumb]} />
      <DoctorTopBar backHref={clinicHref} share={{ title: name, text: `${name} | ${APP_NAME}` }} />

      <article className={cn("mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pt-2", hasDock ? BOTTOM_DOCK_SPACE : "pb-10")}>
        <header className="flex flex-col items-center px-2 pb-2 text-center">
          <DoctorAvatar doctor={d} priority className="size-32" textClassName="text-4xl" />
          <h1 className="mt-4 text-2xl leading-tight font-semibold tracking-tight text-balance">{name}</h1>
          <p className="mt-3 inline-flex max-w-full items-center gap-1.5 rounded-full bg-brand-soft px-3.5 py-1.5 text-sm font-semibold text-primary">
            <BranchIcon className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{branch}</span>
          </p>
        </header>

        <Link
          href={clinicHref}
          className="flex items-center gap-3 rounded-3xl bg-card p-3 pr-4 outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {clinic.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={clinic.logo_url} alt="" loading="lazy" decoding="async" className="size-12 shrink-0 rounded-2xl bg-muted object-cover" />
          ) : (
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-primary">
              <ClinicIcon className="size-6" aria-hidden />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-1">
              <span className="truncate font-semibold">{clinic.name}</span>
              {clinic.verified ? (
                <>
                  <BadgeCheck className="size-4 shrink-0 text-primary" aria-hidden />
                  <span className="sr-only">(onaylı işletme)</span>
                </>
              ) : null}
            </span>
            <span className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{district}</span>
            </span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </Link>

        <section aria-labelledby="doktor-gunler" className={CARD}>
          <h2 id="doktor-gunler" className={CARD_TITLE}>
            <CalendarDays className="size-[18px] shrink-0 text-primary" aria-hidden />
            Çalışma günleri
          </h2>
          {d.days.length ? (
            <ul className="mt-3 grid grid-cols-7 gap-1.5" aria-label="Hafta">
              {DAY_KEYS.map((k) => {
                const on = worked.has(k);
                return (
                  <li
                    key={k}
                    className={cn(
                      "flex h-10 items-center justify-center rounded-full text-[13px] font-semibold",
                      on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground/70",
                    )}
                  >
                    <span aria-hidden>{DAY_SHORT_LABELS[k]}</span>
                    <span className="sr-only">{`${DAY_LABELS[k]}: ${on ? "çalışıyor" : "çalışmıyor"}`}</span>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {d.hours_note ? (
            <p className="mt-3 flex items-center gap-2 text-sm font-medium">
              <Clock className="size-4 shrink-0 text-primary" aria-hidden />
              <span className="min-w-0 break-words">{d.hours_note}</span>
            </p>
          ) : null}
          {!d.days.length && !d.hours_note ? <p className="mt-2 text-sm text-muted-foreground">Günleri ve saatleri klinikten öğrenebilirsin.</p> : null}
        </section>

        {d.bio ? (
          <section aria-labelledby="doktor-hakkinda" className={CARD}>
            <h2 id="doktor-hakkinda" className={CARD_TITLE}>
              <UserRound className="size-[18px] shrink-0 text-primary" aria-hidden />
              Hakkında
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed whitespace-pre-line text-foreground/90">{d.bio}</p>
          </section>
        ) : null}

        <p className="px-1 text-xs leading-relaxed text-muted-foreground">
          {canCall ? "Bilgiler klinik tarafından girilir. Randevu için kliniği ara." : "Bilgiler klinik tarafından girilir."}
        </p>
      </article>

      {hasDock ? (
        <DetailActions>
          {canCall ? (
            <CallButton phone={clinic.phone!} subjectType="business" subjectId={clinic.id} label="Kliniği ara" variant="default" size="lg" className={PRIMARY_CTA} />
          ) : null}
          {hasLocation ? (
            <DirectionsButton
              lat={clinic.lat!}
              lng={clinic.lng!}
              name={clinic.name}
              iconOnly={canCall}
              variant="secondary"
              size="lg"
              subjectType="business"
              subjectId={clinic.id}
              className={canCall ? SECONDARY_CTA : PRIMARY_CTA}
            />
          ) : null}
        </DetailActions>
      ) : null}
    </>
  );
}
