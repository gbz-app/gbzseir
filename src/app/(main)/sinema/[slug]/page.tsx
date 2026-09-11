import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Play, Ticket } from "lucide-react";
import { DataSourceNote } from "@/components/shared/data-source-note";
import { PageHeader } from "@/components/shared/page-header";
import { truncate } from "@/core/format";
import { routes } from "@/core/routes";
import { FilmPoster } from "@/features/cinema/components/film-poster";
import { FilmSchedule } from "@/features/cinema/components/film-schedule";
import { VenueCard } from "@/features/cinema/components/venue-card";
import { branchDayUrl } from "@/features/cinema/config";
import { durationLabel, releaseLabel } from "@/features/cinema/lib/format";
import { cinemaDayKey } from "@/features/cinema/lib/schedule";
import { getCinemaFilm } from "@/features/cinema/server/queries";

export const revalidate = 1800;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getCinemaFilm(slug).catch(() => null);
  if (!data) return { title: "Film bulunamadı", robots: { index: false } };
  const { film, venue } = data;
  return {
    title: `${film.title} seansları: ${venue.venue}`,
    description: truncate(`${film.title}: ${venue.venue} sinemasında seans saatleri, süre, tür ve yaş sınırı.`, 160),
    alternates: { canonical: routes.cinema.film(film.slug) },
  };
}

const PILL_CTA = "inline-flex h-12 items-center justify-center gap-2 rounded-full text-[15px] font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/** One film: poster and facts, ticket + trailer links, sessions by day, plot, cast, the venue and the source. */
export default async function CinemaFilmPage({ params }: Props) {
  const { slug } = await params;
  const data = await getCinemaFilm(slug);
  if (!data) notFound();
  const { film, showtimes, venue, updatedAt } = data;

  const now = new Date();
  const next = showtimes.find((s) => Date.parse(s.startsAt) >= now.getTime()) ?? null;
  const facts = [durationLabel(film.durationMin), film.ageRating, ...film.genres].filter((x): x is string => !!x);
  const people = [
    { label: film.directors.length > 1 ? "Yönetmenler" : "Yönetmen", value: film.directors.join(", ") },
    { label: "Oyuncular", value: film.actors.join(", ") },
  ].filter((p) => p.value);

  return (
    <>
      <PageHeader title={film.title} subtitle={venue.venue} backHref={routes.cinema.root()} />
      <div className="flex flex-col gap-3 px-4 pt-2 pb-8">
        <section className="flex gap-4 rounded-3xl bg-card p-4">
          <div className="w-28 shrink-0">
            <FilmPoster url={film.posterUrl} width={342} eager className="rounded-[1.1rem]" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl leading-tight font-bold">{film.title}</h2>
            {film.originalTitle ? <p className="mt-1 text-sm text-muted-foreground">{film.originalTitle}</p> : null}
            {facts.length ? (
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {facts.map((f) => (
                  <li key={f} className="inline-flex h-7 items-center rounded-full bg-muted px-2.5 text-xs font-semibold">
                    {f}
                  </li>
                ))}
              </ul>
            ) : null}
            {film.releaseDate ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Vizyon tarihi: <span className="font-semibold text-foreground">{releaseLabel(film.releaseDate)}</span>
              </p>
            ) : null}
          </div>
        </section>

        {next || film.sourceUrl ? (
        <div className="flex gap-2">
          {next ? (
            <a
              href={branchDayUrl(venue.url, cinemaDayKey(next.startsAt))}
              target="_blank"
              rel="noopener noreferrer"
              className={`${PILL_CTA} flex-1 bg-foreground text-background hover:bg-foreground/90`}
            >
              <Ticket className="size-5" aria-hidden /> Bilet al
            </a>
          ) : null}
          {film.sourceUrl ? (
            <a
              href={film.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={next ? `${PILL_CTA} bg-card px-5 hover:bg-muted` : `${PILL_CTA} flex-1 bg-foreground text-background hover:bg-foreground/90`}
            >
              <Play className="size-5" aria-hidden /> {next ? "Fragman" : "Fragmanı izle"}
            </a>
          ) : null}
        </div>
        ) : null}

        <section aria-labelledby="seanslar" className="rounded-3xl bg-card p-4">
          <h2 id="seanslar" className="text-base font-semibold">
            Seanslar
          </h2>
          <FilmSchedule showtimes={showtimes} venueUrl={venue.url} releaseDate={film.releaseDate} serverNow={now.toISOString()} />
        </section>

        {film.synopsis ? (
          <section aria-labelledby="konusu" className="rounded-3xl bg-card p-4">
            <h2 id="konusu" className="text-base font-semibold">
              Konusu
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed">{film.synopsis}</p>
          </section>
        ) : null}

        {people.length ? (
          <section className="rounded-3xl bg-card p-4">
            <dl className="flex flex-col gap-2.5 text-sm">
              {people.map((p) => (
                <div key={p.label}>
                  <dt className="text-xs text-muted-foreground">{p.label}</dt>
                  <dd className="mt-0.5 font-medium">{p.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        <VenueCard venue={venue} />
        <DataSourceNote source={venue.cinema} sourceUrl={film.sourceUrl ?? venue.url} updatedAt={updatedAt} note="Seans saatleri değişebilir; bileti alırken kontrol et." />
      </div>
    </>
  );
}
