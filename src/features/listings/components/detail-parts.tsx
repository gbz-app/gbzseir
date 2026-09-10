import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { CalendarDays, ChevronRight, CircleCheck, CirclePause, CircleX, Hash, Hourglass, MapPin, ShieldAlert, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { routes } from "@/core/routes";
import { formatDate, initials } from "@/core/format";
import { BusinessBadge, VerifiedBadge } from "@/components/shared/badges";
import type { BusinessRef } from "../types";
import type { DisplayState, SellerInfo } from "../view-models";
import { CompanyLogo } from "./listing-cards";

/** Amber safety box. */
export function SafetyNotice({ title = "Güvenli alışveriş", text }: { title?: string; text: string }) {
  return (
    <aside className="flex gap-3 rounded-2xl bg-highlight-soft p-4 ring-1 ring-highlight/30">
      <ShieldAlert className="mt-0.5 size-5 shrink-0 text-highlight-foreground dark:text-highlight" aria-hidden />
      <div>
        <p className="text-sm font-bold text-highlight-foreground dark:text-foreground">{title}</p>
        <p className="mt-0.5 text-sm leading-relaxed text-highlight-foreground/85 dark:text-foreground/80">{text}</p>
      </div>
    </aside>
  );
}

type NoticeConfig = { icon: LucideIcon; title: string; text: string; tone: "warning" | "danger" | "muted" | "success" };

function noticeFor(state: DisplayState, kind: "classified" | "job", rejectionReason?: string | null): NoticeConfig | null {
  switch (state) {
    case "live":
      return null;
    case "sold":
      return { icon: CircleCheck, tone: "muted", title: "Bu ilan artık yayında değil", text: "Ürün satıldı. Benzer ilanlara göz atabilirsin." };
    case "filled":
      return { icon: CircleCheck, tone: "muted", title: "Bu ilan artık yayında değil", text: "Bu pozisyon için eleman bulundu." };
    case "expired":
      return { icon: Timer, tone: "muted", title: "Bu ilan artık yayında değil", text: "İlanın yayın süresi doldu." };
    case "paused":
      return {
        icon: CirclePause,
        tone: "muted",
        title: "Yayında değil",
        text: "Bu ilanı yayından kaldırdın. İlanlarım sayfasından tekrar yayına alabilirsin.",
      };
    case "pending_review":
      return {
        icon: Hourglass,
        tone: "warning",
        title: "Onay bekliyor",
        text: `${kind === "job" ? "İş ilanın" : "İlanın"} ekibimiz tarafından inceleniyor. Onaylanınca yayına girer ve bildirim alırsın.`,
      };
    case "rejected":
      return {
        icon: CircleX,
        tone: "danger",
        title: "İlanın reddedildi",
        text: `${rejectionReason ? `Neden: ${rejectionReason}. ` : ""}Düzenleyip tekrar onaya gönderebilirsin.`,
      };
    case "draft":
      return { icon: Hourglass, tone: "muted", title: "Taslak", text: "Bu ilan henüz onaya gönderilmedi." };
    case "deleted":
      return { icon: CircleX, tone: "muted", title: "Bu ilan artık yayında değil", text: "İlan kaldırıldı." };
  }
}

const toneClass: Record<NoticeConfig["tone"], { box: string; icon: string }> = {
  warning: { box: "bg-highlight-soft ring-highlight/30", icon: "text-highlight-foreground dark:text-highlight" },
  danger: { box: "bg-destructive/10 ring-destructive/20", icon: "text-destructive" },
  muted: { box: "bg-muted ring-foreground/[0.06]", icon: "text-muted-foreground" },
  success: { box: "bg-success-soft ring-success/20", icon: "text-success" },
};

/** Status banner for listings that are not live (sold, expired, pending review...). */
export function StatusNotice({
  state,
  kind,
  rejectionReason,
  action,
}: {
  state: DisplayState;
  kind: "classified" | "job";
  rejectionReason?: string | null;
  action?: React.ReactNode;
}) {
  const cfg = noticeFor(state, kind, rejectionReason);
  if (!cfg) return null;
  const Icon = cfg.icon;
  const tone = toneClass[cfg.tone];
  return (
    <div role="status" className={cn("flex gap-3 rounded-2xl p-4 ring-1", tone.box)}>
      <Icon className={cn("mt-0.5 size-5 shrink-0", tone.icon)} aria-hidden />
      <div className="min-w-0">
        <p className="font-bold">{cfg.title}</p>
        <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{cfg.text}</p>
        {action ? <div className="mt-2">{action}</div> : null}
      </div>
    </div>
  );
}

/** Location · date · ilan no. */
export function MetaRow({ neighbourhoodName, postedAt, listingNo }: { neighbourhoodName: string | null; postedAt: string | null; listingNo: string | null }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
      {neighbourhoodName ? (
        <li className="inline-flex items-center gap-1.5">
          <MapPin className="size-4 shrink-0" aria-hidden />
          {neighbourhoodName} Mah., Gebze
        </li>
      ) : null}
      <li className="inline-flex items-center gap-1.5">
        <CalendarDays className="size-4 shrink-0" aria-hidden />
        {postedAt ? formatDate(postedAt, { month: "long" }) : "Bugün"}
      </li>
      {listingNo ? (
        <li className="inline-flex items-center gap-1.5">
          <Hash className="size-4 shrink-0" aria-hidden />
          İlan no: {listingNo}
        </li>
      ) : null}
    </ul>
  );
}

/** Label/value table (Özellikler, İş bilgileri). */
export function DetailTable({ id, title, rows }: { id: string; title: string; rows: Array<{ label: string; value: string }> }) {
  if (!rows.length) return null;
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="text-lg font-bold">
        {title}
      </h2>
      <dl className="mt-3 divide-y overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/[0.06]">
        {rows.map((r) => (
          <div key={r.label} className="flex items-start justify-between gap-4 px-4 py-3 text-[15px]">
            <dt className="shrink-0 text-muted-foreground">{r.label}</dt>
            <dd className="min-w-0 text-right font-semibold break-words">{r.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Free text section (Açıklama, İş tanımı...). */
export function TextSection({ id, title, text }: { id: string; title: string; text: string }) {
  if (!text.trim()) return null;
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="text-lg font-bold">
        {title}
      </h2>
      <p className="mt-2 text-[15px] leading-relaxed break-words whitespace-pre-line">{text.trim()}</p>
    </section>
  );
}

function BusinessRow({ business, interactive }: { business: BusinessRef; interactive: boolean }) {
  const verified = business.verification_level >= 1;
  const inner = (
    <>
      <CompanyLogo name={business.name} logoUrl={business.logo_url} className="size-11 rounded-lg" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <BusinessBadge />
          {verified ? <VerifiedBadge /> : null}
        </div>
        <p className="mt-1 truncate text-[15px] font-bold">{business.name}</p>
      </div>
      {interactive && business.slug ? <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden /> : null}
    </>
  );
  if (interactive && business.slug) {
    return (
      <Link
        href={routes.businesses.detail(business.slug)}
        className="mt-3 flex items-center gap-3 rounded-xl bg-muted/60 p-3 transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label={`${business.name} işletme profili`}
      >
        {inner}
      </Link>
    );
  }
  return <div className="mt-3 flex items-center gap-3 rounded-xl bg-muted/60 p-3">{inner}</div>;
}

/** E3 seller card: "Ayşe Y.", "Üyelik: Eylül 2026", business badge -> /firma/[slug]. */
export function SellerCard({ seller, business, interactive = true }: { seller: SellerInfo; business: BusinessRef | null; interactive?: boolean }) {
  return (
    <section aria-labelledby="satici-baslik" className="rounded-2xl bg-card p-4 shadow-soft ring-1 ring-foreground/[0.06]">
      <h2 id="satici-baslik" className="text-sm font-semibold text-muted-foreground">
        Satıcı
      </h2>
      <div className="mt-3 flex items-center gap-3">
        <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-soft text-base font-extrabold text-primary">
          {initials(seller.displayName)}
        </span>
        <div className="min-w-0">
          <p className="truncate font-bold">{seller.displayName}</p>
          {seller.memberSince ? <p className="text-sm text-muted-foreground">Üyelik: {seller.memberSince}</p> : null}
        </div>
      </div>
      {business ? <BusinessRow business={business} interactive={interactive} /> : null}
    </section>
  );
}

/** E4 company card: logo, name, "Onaylı" badge, link to /firma/[slug]. */
export function CompanyCard({ company, interactive = true }: { company: BusinessRef | null; interactive?: boolean }) {
  if (!company) return null;
  const verified = company.verification_level >= 1;
  const inner = (
    <>
      <CompanyLogo name={company.name} logoUrl={company.logo_url} className="size-14 rounded-2xl text-lg" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-bold">{company.name}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {verified ? <VerifiedBadge /> : <BusinessBadge />}
          {interactive && company.slug ? <span className="text-xs font-semibold text-primary">İşletme profilini gör</span> : null}
        </div>
      </div>
      {interactive && company.slug ? <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden /> : null}
    </>
  );
  const cls = "flex items-center gap-3 rounded-2xl bg-card p-4 shadow-soft ring-1 ring-foreground/[0.06]";
  if (interactive && company.slug) {
    return (
      <Link
        href={routes.businesses.detail(company.slug)}
        className={cn(cls, "transition-colors outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50")}
        aria-label={`${company.name} işletme profili`}
      >
        {inner}
      </Link>
    );
  }
  return <div className={cls}>{inner}</div>;
}
