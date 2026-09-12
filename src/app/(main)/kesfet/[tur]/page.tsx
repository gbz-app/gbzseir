import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ErrorState } from "@/components/shared/error-state";
import { getAppSettings } from "@/lib/app-settings";
import { JsonLd } from "@/components/seo/json-ld";
import { APP_NAME, CITY, SITE_URL } from "@/config/site";
import { routes } from "@/core/routes";
import { VerticalExplorer } from "@/features/business/components/vertical-explorer";
import { hasDoctors, type DirectoryDoctor } from "@/features/business/components/doctors/doctor-meta";
import { getDoctorBranches, listSaglikDoctors } from "@/features/business/components/doctors/queries";
import { listVerticalBusinesses } from "@/features/business/lib/vertical-queries";
import { getVocabularies } from "@/features/business/lib/vocabularies";
import { DISCOVER_VERTICALS, VERTICAL_INFO, VERTICAL_SUBCATEGORIES, parseVertical, type Vertical } from "@/features/business/lib/verticals";

export const revalidate = 300;
/** generateStaticParams lists every DISCOVER_VERTICALS value and listable() accepts nothing else, so any other tur is a real 404. */
export const dynamicParams = false;

export function generateStaticParams() {
  return DISCOVER_VERTICALS.map((tur) => ({ tur }));
}

type Props = { params: Promise<{ tur: string }> };

function listable(tur: string): Vertical | null {
  const v = parseVertical(tur);
  return v && DISCOVER_VERTICALS.includes(v) ? v : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const v = listable((await params).tur);
  if (!v) return { title: "Bulunamadı", robots: { index: false } };
  const info = VERTICAL_INFO[v];
  return {
    title: `${info.plural} - ${CITY.province}`,
    description: `${CITY.province}'deki${info.plural.toLocaleLowerCase("tr-TR")}: ${info.subtitle.toLocaleLowerCase("tr-TR")}. Puanlar, fotoğraflar, çalışma saatleri ve telefon ${APP_NAME}'de.`,
    alternates: { canonical: routes.businesses.vertical(v) },
  };
}

/** Keşfet: one vertical (yemek, restoran, kafe, otel, hizmet, mağaza) as big photo cards + map. */
export default async function VerticalPage({ params }: Props) {
  const v = listable((await params).tur);
  if (!v) notFound();
  // Sağlık also lists the clinics' doctors ("İşletmeler | Doktorlar").
  const withDoctors = hasDoctors(v);
  const [items, settings, vocab, doctors, doctorBranches] = await Promise.all([
    listVerticalBusinesses(v).catch(() => null),
    getAppSettings(),
    getVocabularies(),
    withDoctors ? listSaglikDoctors().catch(() => [] as DirectoryDoctor[]) : Promise.resolve(undefined),
    withDoctors ? getDoctorBranches() : Promise.resolve(undefined),
  ]);
  if (!items) {
    return (
      <div className="px-4 py-10">
        <ErrorState description="Liste şu an yüklenemedi. Biraz sonra tekrar dene." />
      </div>
    );
  }
  // Sample firms stay out of structured data.
  const listed = items.filter((b) => !b.is_demo).slice(0, 50);
  return (
    <>
      {listed.length ? (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: `${CITY.province} ${VERTICAL_INFO[v].plural}`,
            itemListElement: listed.map((b, i) => ({
              "@type": "ListItem",
              position: i + 1,
              url: `${SITE_URL}${routes.businesses.detail(b.slug)}`,
              name: b.name,
            })),
          }}
        />
      ) : null}
      <VerticalExplorer
        vertical={v}
        items={items}
        applicationsOpen={settings.businessApplications}
        // Spor chips are built in until spor becomes a database type (verticals.ts).
        subcategories={v === "spor" ? VERTICAL_SUBCATEGORIES.spor : (vocab.subcategories[v] ?? [])}
        doctors={doctors}
        doctorBranches={doctorBranches}
      />
    </>
  );
}
