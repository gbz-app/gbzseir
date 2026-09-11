import { Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPhoneTR } from "@/core/format";
import { telHref } from "@/core/phone";
import type { EmergencyNumber } from "@/features/guide/lib/types";

const URGENT = new Set(["112", "155", "156", "110", "177"]);
const FAULT = new Set(["185", "186", "187"]);

const isShort = (n: string) => /^\d{3,5}$/.test(n);

/** "112 Acil Çağrı" -> "Acil Çağrı", "Alo 153 Büyükşehir..." -> "Büyükşehir..." (the number is shown in the badge). */
function titleOf(e: EmergencyNumber): string {
  if (!isShort(e.number)) return e.label;
  const t = e.label.replace(new RegExp(`^(alo\\s+)?${e.number}\\s+`, "i"), "").trim();
  return t || e.label;
}

/** Big tappable rows that call (tel:) the emergency and fault numbers (app_settings.emergency_numbers). Server-safe. */
export function EmergencyList({ numbers, className }: { numbers: EmergencyNumber[]; className?: string }) {
  return (
    <ul className={cn("flex flex-col gap-2.5", className)}>
      {numbers.map((e) => {
        const short = isShort(e.number);
        const display = short ? e.number : formatPhoneTR(e.number);
        const tone = URGENT.has(e.number)
          ? "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300"
          : FAULT.has(e.number)
            ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
            : "bg-brand-soft text-primary";
        return (
          <li key={`${e.number}-${e.label}`}>
            <a
              href={short ? `tel:${e.number}` : telHref(e.number)}
              aria-label={`${e.label} ara: ${display}`}
              className="flex min-h-[4.5rem] items-center gap-3 rounded-3xl bg-card p-3 pr-3.5 outline-none transition-transform focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.99]"
            >
              <span className={cn("flex h-12 min-w-12 shrink-0 items-center justify-center rounded-2xl px-2 font-extrabold tabular-nums", tone, short ? "text-lg" : "")}>
                {short ? e.number : <Phone className="size-5" aria-hidden />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block leading-snug font-semibold">{titleOf(e)}</span>
                {short ? null : <span className="block text-[13px] font-semibold text-foreground/80 tabular-nums">{display}</span>}
                {e.description ? <span className="mt-0.5 line-clamp-2 block text-[13px] leading-snug text-muted-foreground">{e.description}</span> : null}
              </span>
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-foreground text-background" aria-hidden>
                <Phone className="size-5" />
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
