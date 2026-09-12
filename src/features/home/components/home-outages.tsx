"use client";

import * as React from "react";
import { Activity, Clock3, Droplets, Flame, Navigation, Phone, Siren, Wifi, Zap, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";

/** `live`: going on right now; the home card lists these. */
type Notice = { title: string; place: string; time: string; status: string; live?: boolean };
type Topic = {
  key: string;
  label: string;
  icon: LucideIcon;
  tone: string;
  title: string;
  text: string;
  notices: readonly Notice[];
};

/**
 * MOCKUP (owner's request, 12.09): the notices below are made up to show the layout, shown without a preview note
 * (owner's decision). Replace them with the real feeds (SEDAŞ, İSU, AFAD / Kandilli, operators, İZGAZ).
 */
const TOPICS: readonly Topic[] = [
  {
    key: "elektrik",
    label: "Elektrik",
    icon: Zap,
    tone: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300",
    title: "Elektrik kesintileri",
    text: "Planlı bakım ve arıza kesintileri",
    notices: [
      { title: "Arıza", place: "Körfez · Merkez", time: "Bugün 11:20'den beri", status: "Devam ediyor", live: true },
      { title: "Planlı bakım", place: "Darıca · Sahil yolu çevresi", time: "Yarın 09:00 - 15:00", status: "Planlı" },
    ],
  },
  {
    key: "su",
    label: "Su",
    icon: Droplets,
    tone: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
    title: "Su kesintileri",
    text: "Planlı çalışmalar ve arızalar",
    notices: [
      { title: "Arıza onarımı", place: "İzmit · Kent merkezi", time: "Bugün 09:30 - 13:00", status: "Devam ediyor", live: true },
      { title: "Planlı çalışma", place: "Gebze · İstanbul Caddesi çevresi", time: "Bugün 10:00 - 16:00", status: "Planlı" },
    ],
  },
  {
    key: "afet",
    label: "Afet",
    icon: Siren,
    tone: "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300",
    title: "Afet ve acil durum",
    text: "Uyarılar ve toplanma alanları",
    notices: [{ title: "Kuvvetli rüzgâr", place: "Kocaeli geneli", time: "Bugün 18:00'e kadar", status: "Sarı uyarı", live: true }],
  },
  {
    key: "deprem",
    label: "Deprem",
    icon: Activity,
    tone: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
    title: "Son depremler",
    text: "Kocaeli ve çevresinde hissedilen depremler",
    notices: [
      { title: "Büyüklük 2,4", place: "Marmara Denizi, Gölcük açıkları", time: "Bugün 06:12 · 7 km derinlik", status: "Hafif" },
      { title: "Büyüklük 1,8", place: "Kartepe", time: "Dün 22:40 · 9 km derinlik", status: "Hafif" },
    ],
  },
  {
    key: "internet",
    label: "İnternet",
    icon: Wifi,
    tone: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
    title: "İnternet kesintileri",
    text: "Altyapı çalışmaları ve arıza bildirimleri",
    notices: [{ title: "Altyapı çalışması", place: "Çayırova · Merkez", time: "Bugün 01:00 - 05:00", status: "Planlı" }],
  },
  {
    key: "dogalgaz",
    label: "Doğalgaz",
    icon: Flame,
    tone: "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300",
    title: "Doğalgaz kesintileri",
    text: "Hat çalışmaları ve planlı kesintiler",
    notices: [{ title: "Hat çalışması", place: "Başiskele · Sahil çevresi", time: "Yarın 10:00 - 14:00", status: "Planlı" }],
  },
];

const STATUS_TONE: Record<string, string> = {
  "Devam ediyor": "bg-red-100 text-red-700",
  "Sarı uyarı": "bg-amber-100 text-amber-800",
  Planlı: "bg-sky-100 text-sky-700",
  Hafif: "bg-emerald-100 text-emerald-700",
};

function StatusPill({ status }: { status: string }) {
  return (
    <span className={cn("inline-flex h-7 shrink-0 items-center rounded-full px-2.5 text-xs font-bold whitespace-nowrap", STATUS_TONE[status] ?? "bg-muted text-muted-foreground")}>
      {status}
    </span>
  );
}

function TopicIcon({ topic, size = "md" }: { topic: Topic; size?: "sm" | "md" | "lg" }) {
  const box = size === "lg" ? "size-12 rounded-2xl" : size === "sm" ? "size-7 rounded-lg" : "size-10 rounded-xl";
  const ico = size === "lg" ? "size-6" : size === "sm" ? "size-4" : "size-5";
  return (
    <span className={cn("flex shrink-0 items-center justify-center", box, topic.tone)} aria-hidden>
      <topic.icon className={ico} strokeWidth={2} />
    </span>
  );
}

/** One topic: white notice cards on the sheet's lavender ground, each with its status, place and time. */
function OutageSheet({ topic, onClose }: { topic: Topic | null; onClose: () => void }) {
  return (
    <Drawer open={!!topic} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent className="mx-auto max-w-2xl border-0 bg-background data-[vaul-drawer-direction=bottom]:rounded-t-[1.75rem]">
        {topic ? (
          <div className="px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
            <div className="flex items-center gap-3 px-1">
              <TopicIcon topic={topic} size="lg" />
              <div className="min-w-0 flex-1">
                <DrawerTitle className="text-xl leading-tight font-semibold">{topic.title}</DrawerTitle>
                <DrawerDescription className="mt-0.5 text-sm text-muted-foreground">{topic.text}</DrawerDescription>
              </div>
            </div>

            <ul className="mt-4 flex flex-col gap-2">
              {topic.notices.map((n) => (
                <li key={`${n.title}-${n.place}`} className="rounded-[1.25rem] bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 text-base leading-snug font-semibold">{n.title}</p>
                    <StatusPill status={n.status} />
                  </div>
                  <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                    <Navigation className="size-4 shrink-0" aria-hidden />
                    <span className="truncate">{n.place}</span>
                  </p>
                  <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock3 className="size-4 shrink-0" aria-hidden />
                    <span className="truncate">{n.time}</span>
                  </p>
                </li>
              ))}
            </ul>

            {topic.key === "afet" ? (
              <a
                href="tel:112"
                className="mt-4 flex h-12 items-center justify-center gap-2 rounded-2xl bg-red-600 text-base font-semibold text-white outline-none focus-visible:ring-3 focus-visible:ring-red-600/40"
              >
                <Phone className="size-5" aria-hidden /> 112&apos;yi ara
              </a>
            ) : null}
            <DrawerClose asChild>
              <button
                type="button"
                className="mt-3 h-12 w-full rounded-2xl bg-card text-base font-semibold outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                Kapat
              </button>
            </DrawerClose>
          </div>
        ) : null}
      </DrawerContent>
    </Drawer>
  );
}

/**
 * Home "Kesintiler ve afet": what is going on right now (live notices, each with its status and an "N aktif" badge)
 * and a row of topic chips (elektrik, su, afet, deprem, internet, doğalgaz); a tap opens that topic's sheet.
 */
export function HomeOutages() {
  const [openKey, setOpenKey] = React.useState<string | null>(null);
  const topic = TOPICS.find((t) => t.key === openKey) ?? null;
  const live = TOPICS.flatMap((t) => t.notices.filter((n) => n.live).map((n) => ({ topic: t, notice: n })));

  return (
    <section aria-labelledby="kesintiler" className="rounded-[1.75rem] bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="kesintiler" className="text-xl leading-tight font-semibold">
            Kesintiler ve afet
          </h2>
          <p className="mt-0.5 text-[15px] text-muted-foreground">Kocaeli&apos;de şu an</p>
        </div>
        {live.length ? (
          <span className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-red-50 px-2.5 text-xs font-bold text-red-700">
            <span className="size-1.5 animate-pulse rounded-full bg-red-600 motion-reduce:animate-none" aria-hidden />
            {live.length} aktif
          </span>
        ) : null}
      </div>

      <ul className="mt-3 flex flex-col gap-2">
        {live.map(({ topic: t, notice: n }) => (
          <li key={`${t.key}-${n.title}`}>
            <button
              type="button"
              onClick={() => setOpenKey(t.key)}
              aria-haspopup="dialog"
              className="flex w-full items-center gap-3 rounded-[1.25rem] bg-muted/60 p-3 text-left outline-none transition-transform active:scale-[0.98] focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <TopicIcon topic={t} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold">
                  {t.label} · {n.title}
                </span>
                <span className="block truncate text-[13px] text-muted-foreground">{n.place}</span>
              </span>
              <StatusPill status={n.status} />
            </button>
          </li>
        ))}
      </ul>

      <div role="group" aria-label="Kesinti türleri" className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
        {TOPICS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setOpenKey(t.key)}
            aria-haspopup="dialog"
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-2xl bg-muted/60 pr-3.5 pl-2 text-sm font-semibold outline-none transition-transform active:scale-[0.97] focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <TopicIcon topic={t} size="sm" />
            {t.label}
          </button>
        ))}
      </div>

      <OutageSheet topic={topic} onClose={() => setOpenKey(null)} />
    </section>
  );
}
