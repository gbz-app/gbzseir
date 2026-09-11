import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ChevronRight, CircleCheck, CirclePause, CircleX, Hourglass, MapPin, ShieldAlert, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { routes } from "@/core/routes";
import { initials } from "@/core/format";
import { BusinessBadge, VerifiedBadge } from "@/components/shared/badges";
import type { BusinessRef } from "../types";
import type { DisplayState, SellerInfo } from "../view-models";
import { CompanyLogo } from "./listing-cards";

/** Section with a heading (firm page style) and an optional small icon before the title. */
export function DetailSection({ id, title, icon: Icon, children }: { id: string; title: string; icon?: LucideIcon; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="mb-3 flex items-center gap-2 text-lg font-semibold">
        {Icon ? <Icon className="size-5 shrink-0 text-primary" aria-hidden /> : null}
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Amber safety box. */
export function SafetyNotice({ title = "Güvenli alışveriş", text }: { title?: string; text: string }) {
  return (
    <aside className="flex gap-3 rounded-3xl bg-highlight-soft p-4">
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
  warning: { box: "bg-highlight-soft", icon: "text-highlight-foreground dark:text-highlight" },
  danger: { box: "bg-destructive/10", icon: "text-destructive" },
  muted: { box: "bg-card", icon: "text-muted-foreground" },
  success: { box: "bg-success-soft", icon: "text-success" },
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
    <div role="status" className={cn("flex gap-3 rounded-3xl p-4", tone.box)}>
      <Icon className={cn("mt-0.5 size-5 shrink-0", tone.icon)} aria-hidden />
      <div className="min-w-0">
        <p className="font-bold">{cfg.title}</p>
        <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{cfg.text}</p>
        {action ? <div className="mt-2">{action}</div> : null}
      </div>
    </div>
  );
}

export type FactTile = { label: string; value: React.ReactNode; icon?: LucideIcon };

/** Key facts as three white tiles (the firm page stat tiles): icon, value, label below. */
export function FactTiles({ tiles }: { tiles: FactTile[] }) {
  return (
    <dl className="grid grid-cols-3 gap-2">
      {tiles.map(({ label, value, icon: Icon }) => (
        <div key={label} className="flex min-w-0 flex-col-reverse items-center justify-center rounded-2xl bg-card px-2 py-3 text-center">
          <dt className="mt-1 text-xs text-muted-foreground">{label}</dt>
          <dd className="flex max-w-full flex-col items-center">
            {Icon ? <Icon className="mb-1.5 size-5 shrink-0 text-primary" aria-hidden /> : null}
            <span className="line-clamp-2 max-w-full text-[15px] leading-tight font-semibold break-words tabular-nums">{value}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** `key`: attribute key (or another stable id) for React; `icon`: shown in a soft chip before the label. */
export type DetailRow = { key?: string; label: string; value: string; icon?: LucideIcon };

/** Label / value pairs as a clean two-column list on a white card (Özellikler, İş bilgileri). */
export function DetailList({ id, title, icon, rows }: { id: string; title: string; icon?: LucideIcon; rows: DetailRow[] }) {
  if (!rows.length) return null;
  return (
    <DetailSection id={id} title={title} icon={icon}>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-4 rounded-3xl bg-card p-4">
        {rows.map(({ key, label, value, icon: Icon }, i) => (
          <div key={key ?? `${label}-${i}`} className={cn("relative min-w-0", Icon && "min-h-9 pl-11")}>
            <dt className="text-[13px] leading-snug text-muted-foreground">
              {Icon ? (
                <span aria-hidden className="absolute top-0 left-0 flex size-9 items-center justify-center rounded-xl bg-brand-soft text-primary">
                  <Icon className="size-[18px]" />
                </span>
              ) : null}
              {label}
            </dt>
            <dd className="mt-0.5 text-[15px] leading-snug font-semibold break-words">{value}</dd>
          </div>
        ))}
      </dl>
    </DetailSection>
  );
}

/** Free text section (Açıklama, İş tanımı...). */
export function TextSection({ id, title, icon, text }: { id: string; title: string; icon?: LucideIcon; text: string }) {
  if (!text.trim()) return null;
  return (
    <DetailSection id={id} title={title} icon={icon}>
      <p className="text-[15px] leading-relaxed break-words whitespace-pre-line text-foreground/90">{text.trim()}</p>
    </DetailSection>
  );
}

/** District with a short note (listings carry no exact address). */
export function LocationCard({ title, note }: { title: string; note?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-3xl bg-card p-4">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-soft text-primary">
        <MapPin className="size-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="font-semibold break-words">{title}</p>
        {note ? <p className="mt-0.5 text-sm leading-snug text-muted-foreground">{note}</p> : null}
      </div>
    </div>
  );
}

function BusinessRow({ business, interactive }: { business: BusinessRef; interactive: boolean }) {
  const verified = business.verification_level >= 1;
  const inner = (
    <>
      <CompanyLogo name={business.name} logoUrl={business.logo_url} className="size-11" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <BusinessBadge />
          {verified ? <VerifiedBadge /> : null}
        </div>
        <p className="mt-1 truncate text-[15px] font-semibold">{business.name}</p>
      </div>
      {interactive && business.slug ? <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden /> : null}
    </>
  );
  if (interactive && business.slug) {
    return (
      <Link
        href={routes.businesses.detail(business.slug)}
        className="mt-3 flex items-center gap-3 rounded-2xl bg-muted/60 p-3 transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label={`${business.name} işletme profili`}
      >
        {inner}
      </Link>
    );
  }
  return <div className="mt-3 flex items-center gap-3 rounded-2xl bg-muted/60 p-3">{inner}</div>;
}

/** Seller card: "Ayşe Y.", "Üyelik: Eylül 2026", business row -> /firma/[slug]. */
export function SellerCard({ seller, business, interactive = true }: { seller: SellerInfo; business: BusinessRef | null; interactive?: boolean }) {
  return (
    <div className="rounded-3xl bg-card p-4">
      <div className="flex items-center gap-3">
        <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-soft text-base font-bold text-primary">
          {initials(seller.displayName)}
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold">{seller.displayName}</p>
          <p className="text-sm text-muted-foreground">{seller.memberSince ? `Üyelik: ${seller.memberSince}` : "Gebzem üyesi"}</p>
        </div>
      </div>
      {business ? <BusinessRow business={business} interactive={interactive} /> : null}
    </div>
  );
}

/** Company card of a job ad: logo, name, "Onaylı" badge, link to /firma/[slug]. */
export function CompanyCard({ company, interactive = true }: { company: BusinessRef | null; interactive?: boolean }) {
  if (!company) return null;
  const verified = company.verification_level >= 1;
  const linked = interactive && !!company.slug;
  const inner = (
    <>
      <CompanyLogo name={company.name} logoUrl={company.logo_url} className="size-14 text-lg" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-semibold">{company.name}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {verified ? <VerifiedBadge /> : <BusinessBadge />}
          {linked ? <span className="text-xs font-semibold text-primary">İşletme profilini gör</span> : null}
        </div>
      </div>
      {linked ? <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden /> : null}
    </>
  );
  const cls = "flex items-center gap-3 rounded-3xl bg-card p-4";
  if (interactive && company.slug) {
    return (
      <Link
        href={routes.businesses.detail(company.slug)}
        className={cn(cls, "transition-colors outline-none hover:bg-card/80 focus-visible:ring-3 focus-visible:ring-ring/50")}
        aria-label={`${company.name} işletme profili`}
      >
        {inner}
      </Link>
    );
  }
  return <div className={cls}>{inner}</div>;
}
