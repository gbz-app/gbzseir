import type { Metadata } from "next";
import { routes } from "@/core/routes";
import { CinemaBrowser } from "@/features/cinema/components/cinema-browser";
import { DEFAULT_CINEMA_VENUE } from "@/features/cinema/config";
import { getCinemaSchedule } from "@/features/cinema/server/queries";
import type { CinemaFilm } from "@/features/cinema/types";

export const revalidate = 1800;

export const metadata: Metadata = {
  title: "Vizyondaki filmler: Gebze Center AVM sineması",
  description: "Gebze Center AVM sinemasında bugün, bu hafta ve bu ay vizyondaki filmler: seans saatleri, süre, tür ve yaş sınırı.",
  alternates: { canonical: routes.cinema.root() },
};

/** Only what the list shows (no synopsis or cast in the page payload). */
const slim = (f: CinemaFilm): CinemaFilm => ({ ...f, synopsis: null, directors: [], actors: [] });

/** Vizyondaki filmler: the Gebze Center AVM programme by day, week and month. */
export default async function CinemaPage() {
  const schedule = await getCinemaSchedule().catch(() => null);
  return (
    <CinemaBrowser
      films={(schedule?.films ?? []).map(slim)}
      showtimes={schedule?.showtimes ?? []}
      venue={schedule?.venue ?? DEFAULT_CINEMA_VENUE}
      updatedAt={schedule?.updatedAt ?? null}
      serverNow={new Date().toISOString()}
    />
  );
}
