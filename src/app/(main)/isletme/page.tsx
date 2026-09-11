import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BedDouble,
  Megaphone,
  QrCode,
  Ticket,
  Briefcase,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  Clock,
  ImagePlus,
  MessageSquareText,
  Navigation,
  Pencil,
  PhoneCall,
  Plus,
  SlidersHorizontal,
  Star,
  Stethoscope,
  Store,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { routes } from "@/core/routes";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { requireProfile } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { formatRating } from "@/features/business/components/rating";
import { ProfileStrength } from "@/features/business/components/profile-strength";
import { VacationToggle } from "@/features/business/components/vacation-toggle";
import { BusinessSwitcher } from "@/features/business/components/business-switcher";
import { hasDoctors } from "@/features/business/components/doctors/doctor-meta";
import { getOwnerToolCounts, ownerChecklist } from "@/features/business/lib/owner-progress";
import { getOwnerBusiness, getOwnerBusinessList } from "@/features/business/lib/owner-queries";
import { VERTICAL_INFO, hasMenu, hasRooms, resolveVertical } from "@/features/business/lib/verticals";
import { getAppSettings } from "@/lib/app-settings";
import { TABLES } from "@/lib/db-contract";
import { PushOptIn } from "@/features/profile/components/push-opt-in";

export const metadata: Metadata = { title: "İşletme Paneli", robots: { index: false } };

type Stats = {
  leads_week?: number;
  leads_waiting?: number;
  calls_week?: number;
  calls_prev_week?: number;
  calls_total?: number;
  directions_week?: number;
  /** /firma/<slug> + /menu/<slug> views, owner's own sessions excluded. */
  page_views_7d?: number;
  page_views_30d?: number;
  reviews_unreplied?: number;
};

/** Bento tile surface (white card on the lavender ground, no border, no shadow). */
const TILE = "relative flex flex-col rounded-3xl bg-card p-4";

function ArrowBadge() {
  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden>
      <ArrowRight className="size-3.5" />
    </span>
  );
}

/** Small stat tile: colored icon, unit top-right, big number, label and an arrow. */
function StatTile({ href, icon: Icon, iconClass, value, unit, label }: { href: string; icon: LucideIcon; iconClass: string; value: string | number; unit?: string; label: string }) {
  return (
    <Link href={href} className={cn(TILE, "transition-transform outline-none active:scale-[0.98] focus-visible:ring-3 focus-visible:ring-ring/50")}>
      <div className="flex items-start justify-between gap-2">
        <Icon className={cn("size-6", iconClass)} strokeWidth={1.75} aria-hidden />
        {unit ? <span className="truncate text-xs text-muted-foreground tabular-nums">{unit}</span> : null}
      </div>
      <p className="mt-5 text-[2rem] leading-none font-medium tabular-nums">{value}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="truncate text-sm text-muted-foreground">{label}</span>
        <ArrowBadge />
      </div>
    </Link>
  );
}

function MiniStat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-2xl bg-muted/60 px-3 py-2.5">
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 flex min-w-0 items-baseline gap-1.5">
        <span className="text-base font-semibold tabular-nums">{value}</span>
        {hint ? <span className="truncate text-xs text-muted-foreground tabular-nums">{hint}</span> : null}
      </p>
    </div>
  );
}

function MenuRow({ href, icon: Icon, label, badge }: { href: string; icon: LucideIcon; label: string; badge?: number }) {
  return (
    <li>
      <Link href={href} className="flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60">
        <Icon className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden />
        <span className="flex-1 text-[15px] font-medium">{label}</span>
        {badge ? <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground tabular-nums">{badge}</span> : null}
        <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
      </Link>
    </li>
  );
}

function StatusCard({ icon: Icon, tone, title, text, action }: { icon: LucideIcon; tone: string; title: string; text: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="flex flex-col items-center gap-3 rounded-3xl bg-card px-5 py-8 text-center">
      <span className={cn("flex size-16 items-center justify-center rounded-2xl", tone)}>
        <Icon className="size-8" strokeWidth={1.75} aria-hidden />
      </span>
      <h2 className="text-xl font-bold">{title}</h2>
      <div className="max-w-sm text-[15px] leading-relaxed text-muted-foreground">{text}</div>
      {action}
    </section>
  );
}

/** H3 - İşletme paneli ("Genel bakış" bento dashboard). */
export default async function BusinessPanelPage() {
  const { user } = await requireProfile(routes.business.root());
  const b = await getOwnerBusiness();
  if (!b) redirect(routes.business.intro());
  const [owned, settings] = await Promise.all([getOwnerBusinessList(), getAppSettings()]);
  // A suspended owner cannot open a new business (apply_business refuses it too).
  const canAdd = settings.businessApplications && !owned.some((x) => x.status === "suspended");

  if (b.status !== "approved") {
    return (
      <>
        <PageHeader title="İşletme Paneli" subtitle={b.name} backHref={routes.profile.root()} />
        <div className="flex flex-col gap-4 px-4 pt-4 pb-8">
          <BusinessSwitcher businesses={owned} activeId={b.id} canAdd={canAdd} />
          {b.status === "pending" ? (
            <StatusCard
              icon={Clock}
              tone="bg-highlight-soft text-highlight-foreground"
              title="İşletmen henüz yayında değil"
              text="Bilgilerini tamamlayıp gönderdiğinde işletme sayfan hemen yayına girer."
              action={
                <Button asChild className="mt-2">
                  <Link href={routes.business.applyEdit(b.id)}>
                    <Pencil /> Bilgileri tamamla ve yayına al
                  </Link>
                </Button>
              }
            />
          ) : b.status === "rejected" ? (
            <StatusCard
              icon={CircleAlert}
              tone="bg-destructive/10 text-destructive"
              title="İşletmen yayından kaldırıldı"
              text={
                <>
                  <p>{b.rejection_reason ?? "İşletme bilgilerinde eksik ya da hatalı bilgi var."}</p>
                  <p className="mt-2">Bilgileri düzeltip gönderdiğinde tekrar yayına girer.</p>
                </>
              }
              action={
                <Button asChild className="mt-2">
                  <Link href={routes.business.applyEdit(b.id)}>Bilgileri düzelt ve yayına al</Link>
                </Button>
              }
            />
          ) : (
            <StatusCard
              icon={CircleAlert}
              tone="bg-destructive/10 text-destructive"
              title="İşletme hesabın askıya alındı"
              text="İşletme sayfan şu an yayında değil. Ayrıntılar için bizimle iletişime geç."
              action={
                <Button asChild variant="outline" className="mt-2">
                  <Link href={routes.content.help()}>Yardım ve iletişim</Link>
                </Button>
              }
            />
          )}
        </div>
      </>
    );
  }

  const supabase = await createClient();
  const [{ data }, { count: pushSubs }, toolCounts] = await Promise.all([
    supabase.rpc("business_panel_stats", { p_business_id: b.id }),
    supabase.from(TABLES.pushSubscriptions).select("id", { count: "exact", head: true }).eq("user_id", user.id),
    getOwnerToolCounts(b),
  ]);
  const stats = (data ?? {}) as Stats;
  const isService = b.kinds.includes("service");
  const vertical = resolveVertical(b.vertical, b.kinds);
  const pageHref = routes.businesses.detail(b.slug);
  const unreplied = stats.reviews_unreplied ?? 0;
  const callsPrev = stats.calls_prev_week ?? 0;
  const checklist = ownerChecklist(b, toolCounts);

  return (
    <>
      <PageHeader
        title="Genel bakış"
        subtitle={b.name}
        backHref={routes.profile.root()}
        actions={
          <Link
            href={routes.business.edit()}
            aria-label="İşletme sayfamı düzenle"
            className="flex size-10 items-center justify-center rounded-full bg-card transition-colors hover:bg-muted"
          >
            <SlidersHorizontal className="size-5" strokeWidth={1.75} aria-hidden />
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 px-4 pt-4 pb-8">
        <BusinessSwitcher businesses={owned} activeId={b.id} canAdd={canAdd} className="col-span-2" />
        {pushSubs === 0 ? (
          <PushOptIn
            title={isService ? "Yeni talepleri anında gör" : "Yeni yorumları kaçırma"}
            text={
              isService
                ? "Bölgene yeni bir talep gelince telefonuna bildirim gelsin. Her talebe sınırlı sayıda firma ilgilenebilir, erken davranan kazanır."
                : "İşletmene yorum yazılınca ve önemli bir gelişme olunca telefonuna bildirim gelsin."
            }
            dismissKey="business"
            className="col-span-2 rounded-3xl"
          />
        ) : null}
        {isService ? (
          <StatTile
            href={routes.business.leads()}
            icon={ClipboardList}
            iconClass="text-info"
            value={stats.leads_waiting ?? 0}
            unit={`${stats.leads_week ?? 0} bu hafta`}
            label="Bekleyen talep"
          />
        ) : (
          <StatTile href={pageHref} icon={Navigation} iconClass="text-info" value={stats.directions_week ?? 0} unit="bu hafta" label="Yol tarifi" />
        )}
        <StatTile
          href={pageHref}
          icon={PhoneCall}
          iconClass="text-success"
          value={stats.calls_week ?? 0}
          unit={callsPrev ? `geçen hafta ${callsPrev}` : "bu hafta"}
          label="Arama"
        />

        <ProfileStrength checklist={checklist} className="col-span-2" />

        <StatTile
          href={routes.business.reviews()}
          icon={Star}
          iconClass="text-highlight"
          value={b.rating_count ? formatRating(b.rating_avg) : "-"}
          unit="/5"
          label={`${b.rating_count} yorum`}
        />
        <StatTile href={routes.business.reviews()} icon={MessageSquareText} iconClass="text-rose-500" value={unreplied} unit="yanıtsız" label="Yorum" />

        <Link href={pageHref} className={cn(TILE, "col-span-2 transition-transform outline-none active:scale-[0.99] focus-visible:ring-3 focus-visible:ring-ring/50")}>
          <div className="flex items-start justify-between gap-2">
            <Store className="size-6 text-primary" strokeWidth={1.75} aria-hidden />
            <ArrowBadge />
          </div>
          <div className="mt-4 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[1.6rem] leading-tight font-semibold">{b.name}</p>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">{b.category_label || VERTICAL_INFO[vertical].label}</p>
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full px-3 py-1 text-sm font-semibold",
                b.vacation_mode ? "bg-highlight-soft text-highlight-foreground dark:text-highlight" : "bg-success-soft text-success",
              )}
            >
              {b.vacation_mode ? "Tatilde" : "Yayında"}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <MiniStat label="Toplam arama" value={stats.calls_total ?? 0} />
            {isService ? (
              <MiniStat label="Kabul edilen talep" value={b.leads_accepted_count} />
            ) : (
              <MiniStat label="Görüntülenme (7 gün)" value={stats.page_views_7d ?? 0} hint={`30 günde ${stats.page_views_30d ?? 0}`} />
            )}
          </div>
        </Link>

        <section className="col-span-2 overflow-hidden rounded-3xl bg-card" aria-label="Yönet">
          <ul className="divide-y">
            {isService ? <MenuRow href={routes.business.leads()} icon={ClipboardList} label="Gelen talepler" badge={stats.leads_waiting} /> : null}
            <MenuRow href={routes.business.edit()} icon={Pencil} label="İşletme sayfamı düzenle" />
            {isService || vertical === "hizmet" ? <MenuRow href={routes.business.services()} icon={Wrench} label="Hizmetlerim ve fiyatlar" /> : null}
            {hasMenu(vertical) ? <MenuRow href={routes.business.menu()} icon={QrCode} label="Menü ve QR menü" /> : null}
            {hasRooms(vertical) ? <MenuRow href={routes.business.rooms()} icon={BedDouble} label="Odalar" /> : null}
            {hasDoctors(vertical) ? <MenuRow href={routes.business.doctors()} icon={Stethoscope} label="Doktorlar" /> : null}
            <MenuRow href={routes.business.photos()} icon={ImagePlus} label="Fotoğraflar ve galeri" />
            <MenuRow href={routes.business.events()} icon={Ticket} label="Etkinliklerim" />
            <MenuRow href={routes.business.reviews()} icon={Star} label="Yorumlar" badge={unreplied} />
            <MenuRow href={routes.profile.jobs()} icon={Briefcase} label="İş ilanlarım" />
            <MenuRow href={routes.content.help("reklam")} icon={Megaphone} label="Reklam ve öne çıkma" />
            {canAdd ? <MenuRow href={routes.business.apply()} icon={Plus} label="Yeni işletme ekle" /> : null}
            <li>
              <VacationToggle businessId={b.id} initial={b.vacation_mode} initialUntil={b.vacation_until} isService={isService} />
            </li>
          </ul>
        </section>
      </div>
    </>
  );
}
