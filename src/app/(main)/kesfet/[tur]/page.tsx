import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ErrorState } from "@/components/shared/error-state";
import { JsonLd } from "@/components/seo/json-ld";
import { APP_NAME, CITY, SITE_URL } from "@/config/site";
import { routes } from "@/core/routes";
import { VerticalExplorer } from "@/features/business/components/vertical-explorer";
import { listVerticalBusinesses } from "@/features/business/lib/vertical-queries";
import { LISTABLE_VERTICALS, VERTICAL_INFO, parseVertical, type Vertical } from "@/features/business/lib/verticals";

export const revalidate = 300;

export function generateStaticParams() {
  return LISTABLE_VERTICALS.map((tur) => ({ tur }));
}

type Props = { params: Promise<{ tur: string }> };

function listable(tur: string): Vertical | null {
  const v = parseVertical(tur);
  return v && LISTABLE_VERTICALS.includes(v) ? v : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const v = listable((await params).tur);
  if (!v) return { title: "Bulunamadı", robots: { index: false } };
  const info = VERTICAL_INFO[v];
  return {
    title: `${info.plural} - ${CITY.name}`,
    description: `${CITY.name}'deki ${info.plural.toLocaleLowerCase("tr-TR")}: ${info.subtitle.toLocaleLowerCase("tr-TR")}. Puanlar, fotoğraflar, çalışma saatleri ve telefon ${APP_NAME}'de.`,
    alternates: { canonical: routes.businesses.vertical(v) },
  };
}

/** Keşfet: one vertical (yemek, restoran, kafe, otel, hizmet, mağaza) as big photo cards + map. */
export default async function VerticalPage({ params }: Props) {
  const v = listable((await params).tur);
  if (!v) notFound();
  const items = await listVerticalBusinesses(v).catch(() => null);
  if (!items) {
    return (
      <div className="px-4 py-10">
        <ErrorState description="Liste şu an yüklenemedi. Biraz sonra tekrar dene." />
      </div>
    );
  }
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: `${CITY.name} ${VERTICAL_INFO[v].plural}`,
          itemListElement: items.slice(0, 50).map((b, i) => ({
            "@type": "ListItem",
            position: i + 1,
            url: `${SITE_URL}${routes.businesses.detail(b.slug)}`,
            name: b.name,
          })),
        }}
      />
      <VerticalExplorer vertical={v} items={items} />
    </>
  );
}
