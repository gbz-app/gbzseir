import type { Metadata } from "next";
import { ErrorState } from "@/components/shared/error-state";
import { JsonLd } from "@/components/seo/json-ld";
import { APP_NAME, CITY, SITE_URL } from "@/config/site";
import { routes } from "@/core/routes";
import { getVocabularies } from "@/features/business/lib/vocabularies";
import { EventsExplorer } from "@/features/events/components/events-explorer";
import { listUpcomingEvents } from "@/features/events/queries";

export const revalidate = 300;

export const metadata: Metadata = {
  title: `Etkinlikler - ${CITY.name}`,
  description: `${CITY.name}'de yaklaşan konser, tiyatro, atölye, spor ve festival etkinlikleri. Tarih, yer ve ücret bilgileri ${APP_NAME}'de.`,
  alternates: { canonical: routes.events.root() },
};

export default async function EventsPage() {
  const [events, vocab] = await Promise.all([listUpcomingEvents().catch(() => null), getVocabularies()]);
  if (!events) {
    return (
      <div className="px-4 py-10">
        <ErrorState description="Etkinlikler şu an yüklenemedi. Biraz sonra tekrar dene." />
      </div>
    );
  }
  // Sample events stay out of structured data.
  const listed = events.filter((e) => !e.is_demo).slice(0, 50);
  return (
    <>
      {listed.length ? (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: `${CITY.name} etkinlikleri`,
            itemListElement: listed.map((e, i) => ({
              "@type": "ListItem",
              position: i + 1,
              url: `${SITE_URL}${routes.events.detail(e.slug)}`,
              name: e.title,
            })),
          }}
        />
      ) : null}
      <EventsExplorer events={events} categories={vocab.eventCategories} />
    </>
  );
}
