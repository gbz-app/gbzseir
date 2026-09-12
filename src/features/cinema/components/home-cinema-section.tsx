import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { routes } from "@/core/routes";
import { filmsForTab } from "../lib/schedule";
import { getCinemaSchedule } from "../server/queries";
import type { CinemaFilm } from "../types";
import { HomeCinema } from "./home-cinema";

/** Only what the rail shows (no synopsis or cast in the page payload). */
const slim = (f: CinemaFilm): CinemaFilm => ({ ...f, synopsis: null, directors: [], actors: [] });

/**
 * Home "Vizyondaki filmler" (above Gezilecek Yerler). Hidden when the cinema has nothing this month, the source is
 * switched off (app_settings cinema_source.enabled) or the tables cannot be read.
 */
export async function HomeCinemaSection() {
  const schedule = await getCinemaSchedule().catch(() => null);
  if (!schedule?.venue.enabled) return null;
  const now = new Date();
  const month = filmsForTab(schedule.films, schedule.showtimes, "ay", now);
  if (!month.length) return null;
  const ids = new Set(month.map((e) => e.film.id));

  return (
    <section aria-labelledby="vizyondaki-filmler">
      {/* Same header as the other home sections (SectionHeader in app/(main)/page.tsx). */}
      <div className="flex items-center justify-between gap-3">
        <h2 id="vizyondaki-filmler" className="text-xl font-semibold">
          Vizyondaki filmler
        </h2>
        <Link href={routes.cinema.root()} className="inline-flex min-h-11 items-center gap-0.5 text-base font-medium text-muted-foreground transition-colors hover:text-foreground">
          Tümü <ChevronRight className="size-[18px]" aria-hidden />
        </Link>
      </div>
      <HomeCinema
        films={month.map((e) => slim(e.film))}
        showtimes={schedule.showtimes.filter((s) => ids.has(s.filmId))}
        venue={schedule.venue}
        serverNow={now.toISOString()}
      />
    </section>
  );
}
