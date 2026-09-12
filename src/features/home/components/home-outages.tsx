"use client";

import * as React from "react";
import { Activity, Clock3, Droplets, Flame, Info, MapPin, Phone, Siren, Wifi, Zap, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";

type Notice = { title: string; place: string; time: string; status: string };
type Topic = {
  key: string;
  label: string;
  icon: LucideIcon;
  tone: string;
  title: string;
  text: string;
  /** Where the real data will come from. */
  source: string;
  notices: readonly Notice[];
};

/**
 * MOCKUP (owner's request, 12.09): the notices below are made-up samples to show the layout. They are shown under an
 * "Önizleme" note that says so; replace them with the real feeds (AFAD / Kandilli, İSU, SEDAŞ, operators, İZGAZ, AFAD).
 */
const TOPICS: readonly Topic[] = [
  {
    key: "deprem",
    label: "Deprem",
    icon: Activity,
    tone: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
    title: "Son depremler",
    text: "Kocaeli ve çevresinde hissedilen depremler",
    source: "AFAD ve Kandilli",
    notices: [
      { title: "Büyüklük 2,4", place: "Marmara Denizi, Gölcük açıkları", time: "Bugün 06:12 · 7 km derinlik", status: "Hafif" },
      { title: "Büyüklük 1,8", place: "Kartepe", time: "Dün 22:40 · 9 km derinlik", status: "Hafif" },
    ],
  },
  {
    key: "su",
    label: "Su",
    icon: Droplets,
    tone: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
    title: "Su kesintileri",
    text: "Planlı çalışmalar ve arızalar",
    source: "İSU",
    notices: [
      { title: "Planlı çalışma", place: "Gebze · İstanbul Caddesi çevresi", time: "Bugün 10:00 - 16:00", status: "Planlı" },
      { title: "Arıza onarımı", place: "İzmit · Kent merkezi", time: "Bugün 09:30 - 13:00", status: "Devam ediyor" },
    ],
  },
  {
    key: "elektrik",
    label: "Elektrik",
    icon: Zap,
    tone: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300",
    title: "Elektrik kesintileri",
    text: "Planlı bakım ve arıza kesintileri",
    source: "SEDAŞ",
    notices: [
      { title: "Planlı bakım", place: "Darıca · Sahil yolu çevresi", time: "Yarın 09:00 - 15:00", status: "Planlı" },
      { title: "Arıza", place: "Körfez · Merkez", time: "Bugün 11:20'den beri", status: "Devam ediyor" },
    ],
  },
  {
    key: "internet",
    label: "İnternet",
    icon: Wifi,
    tone: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
    title: "İnternet kesintileri",
    text: "Altyapı çalışmaları ve arıza bildirimleri",
    source: "servis sağlayıcılar",
    notices: [{ title: "Altyapı çalışması", place: "Çayırova · Merkez", time: "Bugün 01:00 - 05:00", status: "Planlı" }],
  },
  {
    key: "dogalgaz",
    label: "Doğalgaz",
    icon: Flame,
    tone: "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300",
    title: "Doğalgaz kesintileri",
    text: "Hat çalışmaları ve planlı kesintiler",
    source: "İZGAZ",
    notices: [{ title: "Hat çalışması", place: "Başiskele · Sahil çevresi", time: "Yarın 10:00 - 14:00", status: "Planlı" }],
  },
  {
    key: "afet",
    label: "Afet",
    icon: Siren,
    tone: "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300",
    title: "Afet ve acil durum",
    text: "Uyarılar ve toplanma alanları",
    source: "AFAD",
    notices: [{ title: "Meteorolojik uyarı", place: "Kocaeli geneli", time: "Bugün 18:00'e kadar · kuvvetli rüzgâr", status: "Sarı uyarı" }],
  },
];

function OutageSheet({ topic, onClose }: { topic: Topic | null; onClose: () => void }) {
  return (
    <Drawer open={!!topic} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent className="data-[vaul-drawer-direction=bottom]:rounded-t-[1.75rem]">
        {topic ? (
          <div className="px-5 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]">
            <div className="flex items-center gap-3">
              <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-2xl", topic.tone)} aria-hidden>
                <topic.icon className="size-6" strokeWidth={2} />
              </span>
              <div className="min-w-0">
                <DrawerTitle className="text-xl font-semibold">{topic.title}</DrawerTitle>
                <DrawerDescription className="text-[15px]">{topic.text}</DrawerDescription>
              </div>
            </div>

            <p className="mt-4 flex items-start gap-2 rounded-2xl bg-muted px-3.5 py-2.5 text-[13px] leading-snug text-muted-foreground">
              <Info className="mt-px size-4 shrink-0" aria-hidden />
              <span>
                <strong className="font-semibold text-foreground">Önizleme:</strong> bu bilgiler örnektir, gerçek değildir. {topic.source} verisi yakında bağlanacak.
              </span>
            </p>

            <ul className="mt-3 flex flex-col gap-2">
              {topic.notices.map((n) => (
                <li key={`${n.title}-${n.place}`} className="rounded-[1.25rem] bg-muted/60 p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-[15px] font-semibold">{n.title}</span>
                    <span className="shrink-0 rounded-full bg-card px-2.5 py-1 text-xs font-semibold text-muted-foreground">{n.status}</span>
                  </div>
                  <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted-foreground">
                    <MapPin className="size-3.5 shrink-0" aria-hidden />
                    <span className="truncate">{n.place}</span>
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted-foreground">
                    <Clock3 className="size-3.5 shrink-0" aria-hidden />
                    <span className="truncate">{n.time}</span>
                  </p>
                </li>
              ))}
            </ul>

            {topic.key === "afet" ? (
              <a
                href="tel:112"
                className="mt-4 flex h-12 items-center justify-center gap-2 rounded-full bg-red-600 text-base font-semibold text-white outline-none focus-visible:ring-3 focus-visible:ring-red-600/40"
              >
                <Phone className="size-5" aria-hidden /> 112&apos;yi ara
              </a>
            ) : null}
            <DrawerClose asChild>
              <button
                type="button"
                className="mt-3 h-12 w-full rounded-full bg-foreground text-base font-semibold text-background outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                Tamam
              </button>
            </DrawerClose>
          </div>
        ) : null}
      </DrawerContent>
    </Drawer>
  );
}

/**
 * Home "Kesintiler ve afet": deprem, su, elektrik, internet, doğalgaz and afet tiles; a tap opens a minimal bottom sheet
 * with that topic's notices. Mockup for now (see TOPICS): every sheet says the notices are samples.
 */
export function HomeOutages() {
  const [openKey, setOpenKey] = React.useState<string | null>(null);
  const topic = TOPICS.find((t) => t.key === openKey) ?? null;
  return (
    <section aria-labelledby="kesintiler" className="rounded-[1.75rem] bg-card p-4">
      <h2 id="kesintiler" className="text-xl leading-tight font-semibold">
        Kesintiler ve afet
      </h2>
      <p className="mt-0.5 text-[15px] text-muted-foreground">Deprem, su, elektrik, internet ve doğalgaz</p>
      <ul className="mt-3 grid grid-cols-3 gap-2">
        {TOPICS.map((t) => (
          <li key={t.key}>
            <button
              type="button"
              onClick={() => setOpenKey(t.key)}
              aria-haspopup="dialog"
              className="flex w-full flex-col items-center gap-1.5 rounded-[1.25rem] bg-muted/60 px-2 py-3 outline-none transition-transform active:scale-[0.97] focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className={cn("flex size-10 items-center justify-center rounded-xl", t.tone)} aria-hidden>
                <t.icon className="size-5" strokeWidth={2} />
              </span>
              <span className="text-[15px] font-semibold">{t.label}</span>
            </button>
          </li>
        ))}
      </ul>
      <OutageSheet topic={topic} onClose={() => setOpenKey(null)} />
    </section>
  );
}
