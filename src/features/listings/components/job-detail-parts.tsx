import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { BadgeCheck, Banknote, Briefcase, BriefcaseBusiness, Bus, CircleCheck, Clock, Eye, MapPin, PhoneCall, ShieldAlert, UtensilsCrossed } from "lucide-react";
import { cn } from "@/lib/utils";
import { CITY } from "@/config/site";
import { formatNumber, formatPhoneTR } from "@/core/format";
import { routes } from "@/core/routes";
import { DemoBadge, VerifiedBadge } from "@/components/shared/badges";
import { RelativeTime } from "@/components/shared/relative-time";
import { JOB_SAFETY_TEXT, jobLocationByLabel, type Option } from "../constants";
import type { BusinessRef } from "../types";
import { CompanyLogo } from "./listing-cards";
import { BENEFIT_ICONS, jobLocationIcon } from "./listing-icons";

// ---------------------------------------------------------------------------
// Hero + header
// ---------------------------------------------------------------------------

/** Short, calm purple band with the hero buttons on top; the logo of the header overlaps its bottom edge. */
export function JobHeroBand({ overlay }: { overlay?: React.ReactNode }) {
  return (
    <div className="relative h-[calc(env(safe-area-inset-top,0px)+9.5rem)] w-full overflow-hidden bg-primary">
      <span aria-hidden className="absolute -top-28 -right-16 size-72 rounded-full bg-white/10" />
      <span aria-hidden className="absolute -bottom-20 left-1/3 size-44 rounded-full bg-white/[0.07]" />
      {overlay ? <div className="absolute inset-x-0 top-0 px-4 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)]">{overlay}</div> : null}
    </div>
  );
}

/**
 * Company logo (or initial) as a large rounded square sitting in a notch on the sheet edge.
 * The pad is the sheet colour, so it reads as a cut-out (spacing, not a border).
 */
export function JobLogoNotch({ company }: { company: BusinessRef | null }) {
  return (
    <div className="relative -mt-[4.25rem] w-fit rounded-media bg-background p-1.5">
      {company ? (
        <CompanyLogo name={company.name} logoUrl={company.logo_url} className="size-20 rounded-card bg-card text-2xl" />
      ) : (
        <span aria-hidden className="flex size-20 items-center justify-center rounded-card bg-card text-primary">
          <Briefcase className="size-9" strokeWidth={1.75} />
        </span>
      )}
    </div>
  );
}

/**
 * Highlighted salary or a quiet "Maaş görüşülür". The wizard asks "Maaş (aylık, net)"; daily jobs ("Günlük") are
 * treated as a day rate elsewhere (JSON-LD unitText DAY), so they only say "net".
 */
export function SalaryPill({ visible, text, daily }: { visible: boolean; text: string; daily?: boolean }) {
  if (!visible) {
    return (
      <p className="inline-flex h-11 items-center gap-2 rounded-2xl bg-card px-4 text-[15px] font-semibold">
        <Banknote className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        Maaş görüşülür
      </p>
    );
  }
  return (
    <p className="inline-flex min-h-11 max-w-full flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-2xl bg-brand-soft px-4 py-2 text-primary">
      <Banknote className="size-5 shrink-0 self-center" aria-hidden />
      <span className="text-lg leading-tight font-bold tabular-nums">{text}</span>
      <span className="text-[13px] font-medium text-muted-foreground">{daily ? "net" : "aylık, net"}</span>
    </p>
  );
}

/** Small meta line: place · posted time · views · demo badge. */
export function JobMetaLine({ place, postedAt, views, isDemo }: { place: string; postedAt: string | null; views?: number | null; isDemo?: boolean }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[13px] text-muted-foreground">
      <span className="inline-flex min-w-0 items-center gap-1">
        <MapPin className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">{place}</span>
      </span>
      {postedAt ? (
        <>
          <span aria-hidden>·</span>
          <RelativeTime date={postedAt} />
        </>
      ) : null}
      {views != null ? (
        <>
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1 tabular-nums">
            <Eye className="size-3.5 shrink-0" aria-hidden />
            {formatNumber(views)} görüntülenme
          </span>
        </>
      ) : null}
      {isDemo ? <DemoBadge className="ml-0.5" /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Key facts + benefits
// ---------------------------------------------------------------------------

type Fact = { key: string; icon: LucideIcon; text: string };

/** Key facts as icon chips: work type, place / OSB, experience, and servis / yemek when offered. */
export function JobFactChips({
  workTypeLabel,
  locationLabel,
  experienceLabel,
  benefits,
}: {
  workTypeLabel: string | null;
  locationLabel: string | null;
  experienceLabel: string | null;
  benefits: Option[];
}) {
  const facts: Fact[] = [];
  if (workTypeLabel) facts.push({ key: "calisma", icon: Clock, text: workTypeLabel });
  if (locationLabel) {
    const merkez = jobLocationByLabel(locationLabel)?.key === "merkez";
    facts.push({ key: "konum", icon: jobLocationIcon(locationLabel), text: merkez ? `${CITY.name} merkez` : locationLabel });
  }
  facts.push({
    key: "deneyim",
    icon: BriefcaseBusiness,
    text: !experienceLabel || experienceLabel === "Fark etmez" ? "Deneyim fark etmez" : `${experienceLabel} deneyim`,
  });
  if (benefits.some((b) => b.value === "servis")) facts.push({ key: "servis", icon: Bus, text: "Servis var" });
  if (benefits.some((b) => b.value === "yemek")) facts.push({ key: "yemek", icon: UtensilsCrossed, text: "Yemek var" });

  return (
    <ul className="flex flex-wrap gap-2" aria-label="Öne çıkan bilgiler">
      {facts.map((f) => (
        <li key={f.key} className="inline-flex h-10 max-w-full items-center gap-2 rounded-full bg-card pr-4 pl-3 text-sm font-medium">
          <f.icon className="size-[18px] shrink-0 text-primary" aria-hidden />
          <span className="truncate">{f.text}</span>
        </li>
      ))}
    </ul>
  );
}

/** "Yan haklar" as a two-column grid of icon rows. */
export function BenefitGrid({ benefits }: { benefits: Option[] }) {
  return (
    <ul className="grid grid-cols-2 gap-2">
      {benefits.map((b) => {
        const Icon = BENEFIT_ICONS[b.value] ?? CircleCheck;
        return (
          <li key={b.value} className="flex min-w-0 items-center gap-2.5 rounded-2xl bg-card p-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-primary">
              <Icon className="size-[18px]" aria-hidden />
            </span>
            <span className="min-w-0 text-[15px] leading-tight font-medium break-words">{b.label}</span>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Employer
// ---------------------------------------------------------------------------

const PILL_LINK =
  "flex h-11 min-w-0 items-center justify-center rounded-full px-4 text-sm font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/** Employer card: logo, name, "Onaylı" badge, neighbourhood; links to the firm page and its other open job ads. */
export function EmployerCard({
  company,
  neighbourhoodName,
  openJobs,
  interactive = true,
}: {
  company: BusinessRef;
  neighbourhoodName?: string | null;
  openJobs?: number | null;
  interactive?: boolean;
}) {
  const verified = company.verification_level >= 1;
  const href = interactive && company.slug ? routes.businesses.detail(company.slug) : null;
  const others = openJobs ?? 0;
  return (
    <div className="rounded-3xl bg-card p-4">
      <div className="flex items-center gap-3.5">
        <CompanyLogo name={company.name} logoUrl={company.logo_url} className="size-14 rounded-2xl text-lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold">{company.name}</p>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            {verified ? <VerifiedBadge /> : null}
            <span className="inline-flex min-w-0 items-center gap-1">
              <MapPin className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{neighbourhoodName ? `${neighbourhoodName} Mah., ${CITY.name}` : CITY.name}</span>
            </span>
          </div>
        </div>
      </div>
      {href ? (
        <div className="mt-3.5 flex gap-2">
          <Link href={href} className={cn(PILL_LINK, "bg-muted/70 hover:bg-muted", others > 0 ? "flex-none" : "flex-1")}>
            <span className="truncate">{others > 0 ? "Profili gör" : "İşletme profilini gör"}</span>
          </Link>
          {others > 0 ? (
            <Link href={`${href}#ilanlar`} className={cn(PILL_LINK, "flex-1 bg-brand-soft text-primary hover:bg-brand-soft/70")}>
              <span className="truncate">
                <span className="tabular-nums">{formatNumber(others)}</span> açık iş ilanı daha
              </span>
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// How to apply + safety (one calm section)
// ---------------------------------------------------------------------------

function InfoRow({ icon: Icon, title, children, iconClassName }: { icon: LucideIcon; title: string; children: React.ReactNode; iconClassName?: string }) {
  return (
    <li className="flex gap-3">
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full bg-card text-primary", iconClassName)}>
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <div className="min-w-0 pt-0.5 text-sm leading-relaxed">
        <p className="font-semibold text-foreground">{title}</p>
        <p className="mt-0.5 text-muted-foreground">{children}</p>
      </div>
    </li>
  );
}

/**
 * "Nasıl başvurulur?", the address note, the approved-business note and the "Dikkat" safety text in one soft card.
 * `closed` (filled / expired ad): says applications are closed instead of "call to apply".
 */
export function JobApplyInfo({ isDemo, verified, phone, closed }: { isDemo?: boolean; verified: boolean; phone?: string | null; closed?: boolean }) {
  return (
    <section aria-labelledby="basvuru" className="rounded-3xl bg-brand-soft/60 p-4">
      <h2 id="basvuru" className="text-base font-semibold">
        Başvurmadan önce
      </h2>
      <ul className="mt-3.5 flex flex-col gap-4">
        <InfoRow icon={PhoneCall} title={closed && !isDemo ? "Başvuru kapandı" : "Nasıl başvurulur?"}>
          {isDemo ? (
            "Bu ilan için başvuru şu an kapalı. Diğer iş ilanlarına göz atabilirsin."
          ) : closed ? (
            "Bu ilan artık başvuru almıyor. Diğer iş ilanlarına göz atabilirsin."
          ) : (
            <>
              {phone ? (
                <>
                  Başvurmak için işletmeyi ara: <span className="font-semibold whitespace-nowrap text-foreground tabular-nums">{formatPhoneTR(phone)}</span>.{" "}
                </>
              ) : (
                "Başvurmak için işletmeyi telefonla ara. "
              )}
              Gebzem üzerinden CV gönderilmez; görüşme bilgisini işletme sana verir.
            </>
          )}
        </InfoRow>
        <InfoRow icon={MapPin} title="Adres">
          Tam adresi işverenle telefonda görüşürken öğrenebilirsin.
        </InfoRow>
        {verified ? (
          <InfoRow icon={BadgeCheck} title="Onaylı işletme">
            Bu ilan, ekibimizin onayladığı bir işletme hesabından verildi.
          </InfoRow>
        ) : null}
        <InfoRow icon={ShieldAlert} title="Dikkat" iconClassName="text-highlight-foreground dark:text-highlight">
          {JOB_SAFETY_TEXT}
        </InfoRow>
      </ul>
    </section>
  );
}
