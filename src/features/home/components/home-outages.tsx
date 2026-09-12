import { Activity, Droplets, Flame, Siren, Wifi, Zap, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS: ReadonlyArray<{ key: string; label: string; icon: LucideIcon; tone: string }> = [
  { key: "deprem", label: "Deprem", icon: Activity, tone: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300" },
  { key: "su", label: "Su", icon: Droplets, tone: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300" },
  { key: "elektrik", label: "Elektrik", icon: Zap, tone: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300" },
  { key: "internet", label: "İnternet", icon: Wifi, tone: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300" },
  { key: "dogalgaz", label: "Doğalgaz", icon: Flame, tone: "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300" },
  { key: "afet", label: "Afet", icon: Siren, tone: "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300" },
];

/**
 * Home "Kesintiler ve afet": deprem, su, elektrik, internet, doğalgaz and afet in one white card, for people to follow
 * outages from here. Not wired yet (owner's decision, 12.09): the tiles are not links and do nothing on tap, and the
 * "Yakında" label says so; the data sources come later. Server-safe.
 */
export function HomeOutages() {
  return (
    <section aria-labelledby="kesintiler" className="rounded-3xl bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="kesintiler" className="text-lg leading-tight font-semibold">
            Kesintiler ve afet
          </h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">Deprem, su, elektrik, internet ve doğalgaz</p>
        </div>
        <span className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full bg-muted px-2.5 text-[11px] font-semibold text-muted-foreground">
          <span className="size-1.5 rounded-full bg-muted-foreground/60" aria-hidden />
          Yakında
        </span>
      </div>
      <ul className="mt-3 grid grid-cols-3 gap-2">
        {ITEMS.map((it) => (
          <li key={it.key} className="flex flex-col items-center gap-1.5 rounded-2xl bg-muted/60 px-2 py-3">
            <span className={cn("flex size-10 items-center justify-center rounded-xl", it.tone)} aria-hidden>
              <it.icon className="size-5" strokeWidth={2} />
            </span>
            <span className="text-[13px] font-semibold">{it.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
