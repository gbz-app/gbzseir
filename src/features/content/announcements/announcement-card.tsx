import { CalendarClock, Info, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { DemoBadge } from "@/components/shared/badges";
import { formatDayLabel, formatTime } from "@/core/format";
import { ANNOUNCEMENT_KIND_META, announcementPhase, formatAnnouncementWindow, type Announcement } from "./meta";

/** Anchor id used by /duyurular#duyuru-<id> links. */
export function announcementAnchor(id: string): string {
  return `duyuru-${id}`;
}

/** Outage status: "Şu an sürüyor" or the start ("Yarın 09:00"). Nothing for other kinds. */
export function AnnouncementPhaseBadge({ item, now, className }: { item: Announcement; now: number; className?: string }) {
  if (!ANNOUNCEMENT_KIND_META[item.kind].outage) return null;
  const phase = announcementPhase(item, now);
  if (phase === "ongoing") {
    return (
      <Badge variant="success" className={cn("h-6 px-2.5", className)}>
        <span className="size-1.5 animate-pulse rounded-full bg-success" aria-hidden />
        Şu an sürüyor
      </Badge>
    );
  }
  if (phase === "upcoming") {
    return (
      <Badge variant="secondary" className={cn("h-6 px-2.5", className)}>
        {formatDayLabel(item.startsAt, now)} {formatTime(item.startsAt)}
      </Badge>
    );
  }
  return null;
}

export function AnnouncementCard({ item, now, mine }: { item: Announcement; now: number; mine?: boolean }) {
  const meta = ANNOUNCEMENT_KIND_META[item.kind];
  const Icon = meta.icon;
  const anchor = announcementAnchor(item.id);
  const showSource = !!item.sourceLabel && !(item.isDemo && item.sourceLabel.trim().toLocaleLowerCase("tr-TR") === "örnek veri");

  return (
    <article
      id={anchor}
      aria-labelledby={`${anchor}-baslik`}
      className={cn(
        "scroll-mt-24 rounded-2xl bg-card p-4 shadow-soft ring-1 ring-foreground/[0.06] target:ring-2 target:ring-primary/50",
        mine && "ring-2 ring-info/40",
      )}
    >
      <div className="flex items-start gap-3">
        <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-2xl", meta.tone)}>
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-0.5 text-xs font-semibold text-muted-foreground">{meta.label}</span>
            <AnnouncementPhaseBadge item={item} now={now} />
            {mine ? (
              <Badge variant="info" className="h-6 px-2.5">
                <MapPin aria-hidden />
                İlçende
              </Badge>
            ) : null}
            {item.isDemo ? <DemoBadge /> : null}
          </div>
          <h2 id={`${anchor}-baslik`} className="mt-1.5 text-base leading-snug font-bold text-balance">
            {item.title}
          </h2>
        </div>
      </div>

      {item.body ? <p className="mt-3 text-sm leading-relaxed whitespace-pre-line text-foreground/85">{item.body}</p> : null}

      <dl className="mt-3 flex flex-col gap-2.5 border-t pt-3 text-sm">
        <div className="flex items-start gap-2.5">
          <dt className="shrink-0">
            <CalendarClock className="mt-0.5 size-4 text-muted-foreground" aria-hidden />
            <span className="sr-only">Tarih ve saat</span>
          </dt>
          <dd className="font-semibold">{formatAnnouncementWindow(item.startsAt, item.endsAt)}</dd>
        </div>
        {item.districts.length ? (
          <div className="flex items-start gap-2.5">
            <dt className="shrink-0">
              <MapPin className="mt-1 size-4 text-muted-foreground" aria-hidden />
              <span className="sr-only">Etkilenen ilçeler</span>
            </dt>
            <dd className="min-w-0">
              <ul className="flex flex-wrap gap-1.5" aria-label="Etkilenen ilçeler">
                {item.districts.map((d) => (
                  <li key={d.id} className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">
                    {d.name}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        ) : !meta.outage ? (
          <div className="flex items-start gap-2.5">
            <dt className="shrink-0">
              <MapPin className="mt-0.5 size-4 text-muted-foreground" aria-hidden />
              <span className="sr-only">Kapsam</span>
            </dt>
            <dd className="text-muted-foreground">Tüm Kocaeli</dd>
          </div>
        ) : null}
        {showSource ? (
          <div className="flex items-start gap-2.5">
            <dt className="shrink-0">
              <Info className="mt-0.5 size-4 text-muted-foreground" aria-hidden />
              <span className="sr-only">Kaynak</span>
            </dt>
            <dd className="text-muted-foreground">Kaynak: {item.sourceLabel}</dd>
          </div>
        ) : null}
      </dl>
    </article>
  );
}
