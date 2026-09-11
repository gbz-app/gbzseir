import type { Metadata } from "next";
import { Droplets, Flame, HeartHandshake, Phone, Siren, Zap, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { CITY } from "@/config/site";
import { routes } from "@/core/routes";

export const metadata: Metadata = {
  title: "Acil durum numaraları",
  description: `${CITY.name} ve ${CITY.province} için acil çağrı ve arıza numaraları: 112, su, elektrik ve doğalgaz arıza hatları.`,
  alternates: { canonical: routes.content.emergency() },
};

const NUMBERS: Array<{ number: string; title: string; text: string; icon: LucideIcon; tone: string }> = [
  { number: "112", title: "Acil Çağrı", text: "Ambulans, polis, jandarma ve itfaiye", icon: Siren, tone: "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300" },
  { number: "185", title: "Su arıza", text: "Su kesintisi ve boru patlağı", icon: Droplets, tone: "bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300" },
  { number: "186", title: "Elektrik arıza", text: "Elektrik kesintisi ve arıza", icon: Zap, tone: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
  { number: "187", title: "Doğalgaz acil", text: "Gaz kokusu ve kaçak", icon: Flame, tone: "bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300" },
  { number: "183", title: "Sosyal destek", text: "Kadın, çocuk, yaşlı ve engelli destek hattı", icon: HeartHandshake, tone: "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300" },
];

/** Acil durum: one-tap call buttons for emergency and utility fault numbers. */
export default function EmergencyPage() {
  return (
    <>
      <PageHeader title="Acil durum" backHref={routes.home()} />
      <div className="flex flex-col gap-3 px-4 pt-4 pb-10">
        <p className="rounded-3xl bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-800 dark:bg-red-500/10 dark:text-red-200">
          Hayati tehlike varsa beklemeden <strong>112</strong>&apos;yi ara. Aramalar ücretsizdir.
        </p>
        <ul className="flex flex-col gap-2.5">
          {NUMBERS.map((n) => (
            <li key={n.number}>
              <a
                href={`tel:${n.number}`}
                className="flex items-center gap-3 rounded-3xl bg-card p-3 pr-4 outline-none transition-transform active:scale-[0.99] focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span className={`flex size-12 shrink-0 items-center justify-center rounded-2xl ${n.tone}`}>
                  <n.icon className="size-6" strokeWidth={1.75} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{n.title}</span>
                  <span className="block truncate text-sm text-muted-foreground">{n.text}</span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-foreground px-3.5 py-2 text-sm font-bold text-background tabular-nums">
                  <Phone className="size-4" aria-hidden /> {n.number}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
