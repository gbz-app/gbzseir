import { Droplets, Landmark, Megaphone, Zap, type LucideIcon } from "lucide-react";
import { formatDate, formatDateTime, formatTime } from "@/core/format";
import { istanbulDateKey, istanbulDayDiff } from "@/core/time";

export type AnnouncementKind = "su_kesintisi" | "elektrik_kesintisi" | "belediye" | "genel";

export type Announcement = {
  id: string;
  kind: AnnouncementKind;
  title: string;
  body: string | null;
  /** Affected neighbourhoods (empty = city wide / unspecified). */
  neighbourhoods: Array<{ id: string; name: string }>;
  sourceLabel: string | null;
  startsAt: string;
  endsAt: string | null;
  isDemo: boolean;
};

export type AnnouncementKindMeta = {
  label: string;
  /** Short chip label. */
  chip: string;
  icon: LucideIcon;
  /** Icon bubble colours. */
  tone: string;
  /** Outages get "Şu an sürüyor / başlangıç" status badges. */
  outage: boolean;
};

export const ANNOUNCEMENT_KIND_META: Record<AnnouncementKind, AnnouncementKindMeta> = {
  su_kesintisi: { label: "Su kesintisi", chip: "Su", icon: Droplets, tone: "bg-info-soft text-info", outage: true },
  elektrik_kesintisi: {
    label: "Elektrik kesintisi",
    chip: "Elektrik",
    icon: Zap,
    tone: "bg-highlight-soft text-highlight-foreground dark:text-highlight",
    outage: true,
  },
  belediye: { label: "Belediye duyurusu", chip: "Belediye", icon: Landmark, tone: "bg-brand-soft text-primary", outage: false },
  genel: {
    label: "Genel duyuru",
    chip: "Genel",
    icon: Megaphone,
    tone: "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300",
    outage: false,
  },
};

export const ANNOUNCEMENT_KIND_ORDER: AnnouncementKind[] = ["su_kesintisi", "elektrik_kesintisi", "belediye", "genel"];

export function toAnnouncementKind(kind: string): AnnouncementKind {
  return (Object.hasOwn(ANNOUNCEMENT_KIND_META, kind) ? kind : "genel") as AnnouncementKind;
}

export type AnnouncementPhase = "upcoming" | "ongoing" | "ended";

export function announcementPhase(a: Pick<Announcement, "startsAt" | "endsAt">, now: number): AnnouncementPhase {
  if (a.endsAt && Date.parse(a.endsAt) <= now) return "ended";
  return Date.parse(a.startsAt) > now ? "upcoming" : "ongoing";
}

/** Outages first (ongoing, then upcoming), then municipality and general notices; each group by start time. */
export function sortAnnouncements(items: Announcement[], now: number): Announcement[] {
  const group = (a: Announcement) => {
    if (ANNOUNCEMENT_KIND_META[a.kind].outage) return announcementPhase(a, now) === "ongoing" ? 0 : 1;
    return a.kind === "belediye" ? 2 : 3;
  };
  return [...items].sort((a, b) => group(a) - group(b) || Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

/** "11 Eyl, 09:00 - 17:00" · "10 Eyl - 9 Ara" · "11 Eyl 22:00 - 12 Eyl 06:00" · "12 Eyl 09:00 itibarıyla". */
export function formatAnnouncementWindow(startsAt: string, endsAt: string | null): string {
  const start = new Date(startsAt);
  if (!endsAt) return `${formatDateTime(start)} itibarıyla`;
  const end = new Date(endsAt);
  if (istanbulDateKey(start) === istanbulDateKey(end)) return `${formatDate(start)}, ${formatTime(start)} - ${formatTime(end)}`;
  if (istanbulDayDiff(start, end) >= 2) return `${formatDate(start)} - ${formatDate(end)}`;
  return `${formatDateTime(start)} - ${formatDateTime(end)}`;
}
