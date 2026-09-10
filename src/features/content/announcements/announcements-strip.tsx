"use client";

import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { DemoBadge } from "@/components/shared/badges";
import { SectionHeader } from "@/components/shared/section-header";
import { routes } from "@/core/routes";
import { useNow } from "../use-now";
import { AnnouncementPhaseBadge, announcementAnchor } from "./announcement-card";
import { ANNOUNCEMENT_KIND_META, announcementPhase, formatAnnouncementWindow, sortAnnouncements, type Announcement } from "./meta";

/**
 * Home strip: horizontally scrolling announcement cards. Renders nothing when no announcement is active
 * (also re-checked on the device clock, since the home page may be served from cache).
 * Expects to sit inside a px-4 container (the row bleeds to the screen edges).
 */
export function AnnouncementsStripClient({ items, renderedAt, className }: { items: Announcement[]; renderedAt: number; className?: string }) {
  const now = useNow(renderedAt);
  const active = sortAnnouncements(
    items.filter((a) => announcementPhase(a, now) !== "ended"),
    now,
  );
  if (!active.length) return null;
  const single = active.length === 1;

  return (
    <section aria-label="Duyurular" className={className}>
      <SectionHeader title="Duyurular" href={routes.content.announcements()} />
      <ul className={cn("mt-2 flex gap-3", single ? "" : "no-scrollbar -mx-4 snap-x snap-mandatory scroll-px-4 overflow-x-auto px-4 pb-1")}>
        {active.map((a) => {
          const meta = ANNOUNCEMENT_KIND_META[a.kind];
          const Icon = meta.icon;
          return (
            <li key={a.id} className={cn("shrink-0 snap-start", single ? "w-full" : "w-[82%] max-w-80")}>
              <Link
                href={`${routes.content.announcements()}#${announcementAnchor(a.id)}`}
                className="flex h-full flex-col gap-2 rounded-2xl bg-card p-4 shadow-soft ring-1 ring-foreground/[0.06] outline-none transition-transform focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.99]"
              >
                <span className="flex items-center gap-2">
                  <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", meta.tone)}>
                    <Icon className="size-[18px]" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-muted-foreground">{meta.label}</span>
                  <AnnouncementPhaseBadge item={a} now={now} className="h-5 px-2" />
                </span>
                <span className="line-clamp-2 leading-snug font-bold">{a.title}</span>
                <span className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarClock className="size-3.5 shrink-0" aria-hidden />
                    {formatAnnouncementWindow(a.startsAt, a.endsAt)}
                  </span>
                  {a.isDemo ? <DemoBadge className="h-5 px-2" /> : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
