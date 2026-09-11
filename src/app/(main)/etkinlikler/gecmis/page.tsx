import type { Metadata } from "next";
import { History } from "lucide-react";
import { ErrorState } from "@/components/shared/error-state";
import { ExploreHeader } from "@/components/shared/explore-header";
import { CITY } from "@/config/site";
import { routes } from "@/core/routes";
import { EventCard } from "@/features/events/components/event-card";
import { listPastEvents } from "@/features/events/queries";

export const revalidate = 1800;

export const metadata: Metadata = {
  title: `Geçmiş etkinlikler - ${CITY.province}`,
  description: `${CITY.province}'de son 3 ayda yapılan etkinlikler.`,
  alternates: { canonical: routes.events.past() },
  robots: { index: false, follow: true },
};

/** /etkinlikler/gecmis: published events that ended in the last 90 days, newest first. */
export default async function PastEventsPage() {
  const events = await listPastEvents().catch(() => null);
  return (
    <div className="flex flex-col gap-4 px-4 pb-10">
      <ExploreHeader title="Geçmiş etkinlikler" subtitle="Son 3 ayda yapılan etkinlikler" backHref={routes.events.root()} />
      {!events ? (
        <ErrorState description="Geçmiş etkinlikler şu an yüklenemedi. Biraz sonra tekrar dene." />
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center rounded-3xl bg-card px-6 py-10 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-soft text-primary">
            <History className="size-7" strokeWidth={1.75} aria-hidden />
          </span>
          <p className="mt-4 font-semibold">Henüz geçmiş etkinlik yok</p>
          <p className="mt-1 text-sm text-muted-foreground">Sona eren etkinlikler burada listelenir.</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{events.length} etkinlik</p>
          <ul className="flex flex-col gap-4">
            {events.map((e, i) => (
              <li key={e.id}>
                <EventCard event={e} eager={i < 2} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
