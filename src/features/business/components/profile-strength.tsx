import Link from "next/link";
import { Check, ChevronRight, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Checklist } from "../lib/completeness";

const R = 26;
const C = 2 * Math.PI * R;

/** Progress ring with the percentage in the middle. */
function Ring({ percent }: { percent: number }) {
  return (
    <div
      className="relative size-16 shrink-0"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-label="Profil gücü"
    >
      <svg viewBox="0 0 64 64" className="size-full -rotate-90" aria-hidden>
        <circle cx="32" cy="32" r={R} fill="none" strokeWidth="7" className="stroke-brand-soft" />
        {percent > 0 ? (
          <circle
            cx="32"
            cy="32"
            r={R}
            fill="none"
            strokeWidth="7"
            strokeLinecap="round"
            className="stroke-primary"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - Math.min(percent, 100) / 100)}
          />
        ) : null}
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums">%{percent}</span>
    </div>
  );
}

/**
 * Business panel "Profil gücü": ring + "X/Y tamam", then the tasks one per row. Open tasks come first (bold, a
 * "Bunu unuttun" hint, the whole row links to the screen that completes it); done tasks follow, struck through.
 */
export function ProfileStrength({ checklist, className }: { checklist: Checklist; className?: string }) {
  const open = checklist.items.filter((i) => !i.done);
  const done = checklist.items.filter((i) => i.done);
  const left = checklist.total - checklist.done;

  return (
    <section className={cn("rounded-3xl bg-card p-4", className)} aria-labelledby="profil-gucu">
      <div className="flex items-center gap-4">
        <Ring percent={checklist.percent} />
        <div className="min-w-0">
          <h2 id="profil-gucu" className="text-base font-semibold">
            Profil gücü
          </h2>
          <p className="text-sm text-muted-foreground tabular-nums">
            {checklist.done}/{checklist.total} tamam{checklist.complete ? " · profilin eksiksiz" : ` · ${left} adım kaldı`}
          </p>
        </div>
      </div>

      {checklist.complete ? (
        <p className="mt-3 rounded-2xl bg-brand-soft px-4 py-3 text-sm font-medium text-primary">Harika, her şey tamam. Müşterilerin seni tüm ayrıntılarınla görüyor.</p>
      ) : (
        <ul className="mt-3 flex flex-col">
          {open.map((item) => (
            <li key={item.key}>
              <Link
                href={item.href}
                className="-mx-2 flex min-h-14 items-center gap-3 rounded-2xl px-2 py-2.5 transition-colors outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Circle className="size-6 shrink-0 text-muted-foreground/50" strokeWidth={1.75} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold">{item.label}</span>
                  <span className="block text-xs leading-snug text-muted-foreground">{item.hint}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
          {done.map((item) => (
            <li key={item.key} className="flex min-h-11 items-center gap-3 py-1.5">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground" aria-hidden>
                <Check className="size-3.5" strokeWidth={3} />
              </span>
              <span className="text-[15px] text-muted-foreground line-through">
                {item.label}
                <span className="sr-only"> (tamam)</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
