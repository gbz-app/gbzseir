"use client";

import * as React from "react";
import { Activity, CircleCheck, Droplets, ExternalLink, Flame, Phone, Siren, Wifi, Zap, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";

type Topic = {
  key: string;
  label: string;
  icon: LucideIcon;
  tone: string;
  title: string;
  text: string;
  /** Short line on the home card's quick-call row. */
  line?: string;
  /** Nationwide number (tel:). */
  call?: { number: string; who: string };
  /** Official site with the current notices. */
  site?: { label: string; href: string };
  tips: readonly string[];
};

/**
 * Real, fixed information (no made-up notices): who runs each service in Kocaeli, the nationwide numbers (185 su, 186
 * elektrik, 187 doğalgaz, 112 acil) and the official sites with the current outages. Live feeds (SEDAŞ, İSU, İZGAZ,
 * AFAD / Kandilli) can replace the site links later.
 */
const TOPICS: readonly Topic[] = [
  {
    key: "elektrik",
    label: "Elektrik",
    icon: Zap,
    tone: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300",
    title: "Elektrik arızası ve kesintiler",
    text: "Kocaeli'de elektrik dağıtımı SEDAŞ'ta",
    line: "SEDAŞ arıza hattı",
    call: { number: "186", who: "SEDAŞ arıza" },
    site: { label: "Planlı kesintiler: sedas.com", href: "https://www.sedas.com" },
    tips: ["Arızayı 186'ya bildir; adresini ve sayaç numaranı hazırla.", "Planlı kesintiler genellikle bir gün önceden duyurulur."],
  },
  {
    key: "su",
    label: "Su",
    icon: Droplets,
    tone: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
    title: "Su arızası ve kesintiler",
    text: "Kocaeli'de su ve kanalizasyon İSU'da",
    line: "İSU arıza hattı",
    call: { number: "185", who: "İSU arıza" },
    site: { label: "Kesinti duyuruları: isu.gov.tr", href: "https://www.isu.gov.tr" },
    tips: ["Patlak boru ve su kesintisini 185'e bildir.", "Kesinti sonrası ilk suyu bir süre akıtıp öyle kullan."],
  },
  {
    key: "dogalgaz",
    label: "Doğalgaz",
    icon: Flame,
    tone: "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300",
    title: "Doğalgaz acil",
    text: "Kocaeli'de doğalgaz dağıtımı İZGAZ'da",
    line: "Gaz kokusu ve kaçak",
    call: { number: "187", who: "Doğalgaz acil" },
    site: { label: "izgaz.com.tr", href: "https://www.izgaz.com.tr" },
    tips: ["Gaz kokusu alırsan elektrik düğmelerine dokunma, ateş yakma.", "Pencereleri aç, vanayı kapat, binadan çık ve 187'yi ara."],
  },
  {
    key: "afet",
    label: "Afet",
    icon: Siren,
    tone: "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300",
    title: "Afet ve acil durum",
    text: "Ambulans, itfaiye, polis, jandarma ve AFAD tek numarada",
    line: "Ambulans, itfaiye, polis, AFAD",
    call: { number: "112", who: "Acil çağrı" },
    site: { label: "afad.gov.tr", href: "https://www.afad.gov.tr" },
    tips: ["Toplanma alanını önceden öğren: e-Devlet'te \"Acil Toplanma Alanı Sorgulama\".", "Deprem çantan hazır olsun: su, ilk yardım, fener, düdük, powerbank."],
  },
  {
    key: "deprem",
    label: "Deprem",
    icon: Activity,
    tone: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
    title: "Son depremler",
    text: "Güncel liste AFAD ve Kandilli'de",
    site: { label: "AFAD son depremler", href: "https://deprem.afad.gov.tr" },
    tips: ["Deprem anında: çök, kapan, tutun.", "Sarsıntı bitince asansör kullanmadan binadan çık, toplanma alanına git."],
  },
  {
    key: "internet",
    label: "İnternet",
    icon: Wifi,
    tone: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
    title: "İnternet kesintisi",
    text: "Arızayı servis sağlayıcına bildir",
    tips: ["Modemi 30 saniye kapatıp yeniden aç.", "Sorun sürerse servis sağlayıcının çağrı merkezini ara; bölgesel bir arıza varsa söylerler."],
  },
];

/** The quick-call rows of the home card: the topics with a number. */
const CALL_TOPICS = TOPICS.filter((t) => t.call);

function TopicIcon({ topic, size = "md" }: { topic: Topic; size?: "sm" | "md" | "lg" }) {
  const box = size === "lg" ? "size-12 rounded-2xl" : size === "sm" ? "size-7 rounded-lg" : "size-10 rounded-xl";
  const ico = size === "lg" ? "size-6" : size === "sm" ? "size-4" : "size-5";
  return (
    <span className={cn("flex shrink-0 items-center justify-center", box, topic.tone)} aria-hidden>
      <topic.icon className={ico} strokeWidth={2} />
    </span>
  );
}

/** One topic: the number to call, what to do, the official site. White cards on the sheet's lavender ground. */
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

            {topic.call ? (
              <a
                href={`tel:${topic.call.number}`}
                className="mt-4 flex items-center gap-3 rounded-[1.25rem] bg-card p-4 outline-none transition-transform active:scale-[0.99] focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-muted-foreground">{topic.call.who}</span>
                  <span className="block text-3xl leading-tight font-bold tracking-tight tabular-nums">{topic.call.number}</span>
                </span>
                <span className="inline-flex h-11 shrink-0 items-center gap-2 rounded-2xl bg-foreground px-4 text-base font-semibold text-background">
                  <Phone className="size-5" aria-hidden /> Ara
                </span>
              </a>
            ) : null}

            <ul className="mt-2 flex flex-col gap-2.5 rounded-[1.25rem] bg-card p-4">
              {topic.tips.map((tip) => (
                <li key={tip} className="flex items-start gap-2.5 text-[15px] leading-snug">
                  <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
                  {tip}
                </li>
              ))}
            </ul>

            {topic.site ? (
              <a
                href={topic.site.href}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 flex min-h-12 items-center justify-between gap-2 rounded-[1.25rem] bg-card px-4 text-[15px] font-semibold text-primary outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {topic.site.label}
                <ExternalLink className="size-4 shrink-0" aria-hidden />
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
 * Home "Kesintiler ve afet": quick-call rows (elektrik 186, su 185, doğalgaz 187, acil 112; the row opens its sheet, the
 * number calls) and a row of topic chips (also deprem and internet). Each sheet: the number, what to do and the
 * official site with the current notices.
 */
export function HomeOutages() {
  const [openKey, setOpenKey] = React.useState<string | null>(null);
  const topic = TOPICS.find((t) => t.key === openKey) ?? null;

  return (
    <section aria-labelledby="kesintiler" className="rounded-[1.75rem] bg-card p-4">
      <h2 id="kesintiler" className="text-xl leading-tight font-semibold">
        Kesintiler ve afet
      </h2>
      <p className="mt-0.5 text-[15px] text-muted-foreground">Arızayı bildir, acil durumda tek dokunuşla ara</p>

      <ul className="mt-3 flex flex-col gap-2">
        {CALL_TOPICS.map((t) => (
          <li key={t.key} className="flex items-center gap-2 rounded-[1.25rem] bg-muted/60 p-2 pl-3">
            <button
              type="button"
              onClick={() => setOpenKey(t.key)}
              aria-haspopup="dialog"
              className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl py-1 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <TopicIcon topic={t} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold">{t.label}</span>
                <span className="block truncate text-[13px] text-muted-foreground">{t.line}</span>
              </span>
            </button>
            <a
              href={`tel:${t.call!.number}`}
              aria-label={`${t.call!.who}: ${t.call!.number} ara`}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-2xl bg-foreground px-3.5 text-[15px] font-bold text-background tabular-nums outline-none transition-transform active:scale-95 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Phone className="size-4" aria-hidden />
              {t.call!.number}
            </a>
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
