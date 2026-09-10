import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BadgeCheck,
  Briefcase,
  ChevronRight,
  Circle,
  CircleAlert,
  CircleCheck,
  ClipboardList,
  Clock,
  ExternalLink,
  ImagePlus,
  Pencil,
  PhoneCall,
  Star,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { routes } from "@/core/routes";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/shared/page-header";
import { requireProfile } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { BusinessLogo } from "@/features/business/components/business-logo";
import { RatingInline } from "@/features/business/components/rating";
import { VacationToggle } from "@/features/business/components/vacation-toggle";
import { businessChecklist } from "@/features/business/lib/completeness";
import { KIND_SHORT_LABELS } from "@/features/business/lib/kinds";
import { getOwnerBusiness } from "@/features/business/lib/owner-queries";

export const metadata: Metadata = { title: "İşletme Paneli", robots: { index: false } };

type Stats = {
  ok?: boolean;
  leads_week?: number;
  leads_waiting?: number;
  calls_week?: number;
  calls_prev_week?: number;
  calls_total?: number;
  reviews_unreplied?: number;
};

function StatCard({ label, value, hint, icon: Icon, href }: { label: string; value: number; hint?: string; icon: LucideIcon; href?: string }) {
  const body = (
    <>
      <span className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <Icon className="size-4" aria-hidden /> {label}
      </span>
      <span className="mt-1.5 block text-2xl font-bold tabular-nums">{value}</span>
      {hint ? <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span> : null}
    </>
  );
  const cls = "block rounded-2xl bg-card p-4 shadow-soft ring-1 ring-foreground/[0.06]";
  return href ? (
    <Link href={href} className={cn(cls, "transition-colors hover:bg-muted/50")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function MenuRow({ href, icon: Icon, label, badge }: { href: string; icon: LucideIcon; label: string; badge?: number }) {
  return (
    <li>
      <Link href={href} className="flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60">
        <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="flex-1 text-[15px] font-medium">{label}</span>
        {badge ? <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground tabular-nums">{badge}</span> : null}
        <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
      </Link>
    </li>
  );
}

function StatusCard({ icon: Icon, tone, title, text, action }: { icon: LucideIcon; tone: string; title: string; text: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="flex flex-col items-center gap-3 rounded-3xl bg-card px-5 py-8 text-center shadow-soft ring-1 ring-foreground/[0.06]">
      <span className={cn("flex size-16 items-center justify-center rounded-2xl", tone)}>
        <Icon className="size-8" strokeWidth={1.75} aria-hidden />
      </span>
      <h2 className="text-xl font-bold">{title}</h2>
      <div className="max-w-sm text-[15px] leading-relaxed text-muted-foreground">{text}</div>
      {action}
    </section>
  );
}

/** H3 - İşletme paneli. */
export default async function BusinessPanelPage() {
  await requireProfile(routes.business.root());
  const b = await getOwnerBusiness();
  if (!b) redirect(routes.business.intro());

  const header = <PageHeader title="İşletme Paneli" subtitle={b.name} backHref={routes.profile.root()} />;

  if (b.status !== "approved") {
    return (
      <>
        {header}
        <div className="px-4 pt-5 pb-8">
          {b.status === "pending" ? (
            <StatusCard
              icon={Clock}
              tone="bg-highlight-soft text-highlight-foreground"
              title="Başvurun inceleniyor"
              text="Ekibimiz başvurunu genelde 1 iş günü içinde inceler. Onaylanınca bildirim alacaksın."
              action={
                <Button asChild variant="outline" className="mt-2">
                  <Link href={routes.business.apply()}>
                    <Pencil /> Başvuruyu düzenle
                  </Link>
                </Button>
              }
            />
          ) : b.status === "rejected" ? (
            <StatusCard
              icon={CircleAlert}
              tone="bg-destructive/10 text-destructive"
              title="Başvurun onaylanmadı"
              text={
                <>
                  <p>{b.rejection_reason ?? "Başvurunda eksik ya da hatalı bilgi var."}</p>
                  <p className="mt-2">Bilgileri düzeltip tekrar gönderebilirsin.</p>
                </>
              }
              action={
                <Button asChild className="mt-2">
                  <Link href={routes.business.apply()}>Başvuruyu düzenle ve gönder</Link>
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
  const { data } = await supabase.rpc("business_panel_stats");
  const stats = (data ?? {}) as Stats;
  const isService = b.kinds.includes("service");
  const isEmployer = b.kinds.includes("employer");
  const checklist = businessChecklist({
    kinds: b.kinds,
    logo_url: b.logo_url,
    address: b.address,
    lat: b.lat,
    lng: b.lng,
    cover_url: b.cover_url,
    working_hours: b.working_hours,
    categoryCount: b.category_ids.length,
    photoCount: b.photos.length,
  });
  const callsWeek = stats.calls_week ?? 0;
  const callsPrev = stats.calls_prev_week ?? 0;
  const callsHint = callsPrev ? `Geçen hafta ${callsPrev}` : `Toplam ${stats.calls_total ?? 0}`;

  return (
    <>
      {header}
      <div className="flex flex-col gap-5 px-4 pt-4 pb-8">
        <section className="flex items-center gap-4 rounded-3xl bg-card p-4 shadow-soft ring-1 ring-foreground/[0.06]">
          <BusinessLogo name={b.name} url={b.logo_url} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-lg font-bold">
              <span className="truncate">{b.name}</span>
              {b.verification_level >= 1 ? <BadgeCheck className="size-5 shrink-0 text-primary" aria-label="Onaylı işletme" /> : null}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">{b.kinds.map((k) => KIND_SHORT_LABELS[k]).join(" · ")}</p>
            <RatingInline avg={b.rating_avg} count={b.rating_count} className="mt-1 text-sm" />
          </div>
        </section>

        {b.vacation_mode ? (
          <p className="rounded-2xl bg-highlight-soft px-4 py-3 text-sm font-semibold">Tatil modundasın: yeni hizmet talebi almıyorsun.</p>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          {isService ? (
            <>
              <StatCard label="Bekleyen talep" value={stats.leads_waiting ?? 0} icon={ClipboardList} href={routes.business.leads()} />
              <StatCard label="Bu hafta talep" value={stats.leads_week ?? 0} icon={ClipboardList} href={routes.business.leads()} />
            </>
          ) : null}
          <StatCard label="Bu hafta arama" value={callsWeek} hint={callsHint} icon={PhoneCall} />
          <StatCard label="Yanıtsız yorum" value={stats.reviews_unreplied ?? 0} icon={Star} href={routes.business.reviews()} />
        </div>

        {!checklist.complete ? (
          <section className="rounded-3xl bg-card p-4 shadow-soft ring-1 ring-foreground/[0.06]" aria-labelledby="profil-tamamla">
            <div className="flex items-center justify-between gap-3">
              <h2 id="profil-tamamla" className="text-base font-bold">
                Profilini tamamla
              </h2>
              <span className="text-sm font-bold text-primary tabular-nums">%{checklist.percent}</span>
            </div>
            <Progress value={checklist.percent} className="mt-3 h-2" aria-label={`Profil %${checklist.percent} tamamlandı`} />
            <ul className="mt-3 flex flex-col">
              {checklist.items.map((item) => (
                <li key={item.key}>
                  <Link href={item.href} className="flex min-h-12 items-center gap-3 rounded-xl px-1 py-2 transition-colors hover:bg-muted/60">
                    {item.done ? (
                      <CircleCheck className="size-5 shrink-0 text-success" aria-hidden />
                    ) : (
                      <Circle className="size-5 shrink-0 text-muted-foreground/60" aria-hidden />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-[15px]", item.done ? "text-muted-foreground line-through" : "font-medium")}>{item.label}</span>
                      {!item.done ? <span className="block text-xs text-muted-foreground">{item.hint}</span> : null}
                    </span>
                    {!item.done ? <span className="text-sm font-semibold text-primary">Ekle</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <p className="flex items-center gap-2 rounded-2xl bg-success-soft px-4 py-3 text-sm font-semibold text-success">
            <CircleCheck className="size-5" aria-hidden /> Harika, profilin eksiksiz.
          </p>
        )}

        <ul className="divide-y overflow-hidden rounded-2xl bg-card shadow-soft ring-1 ring-foreground/[0.06]">
          {isService ? <MenuRow href={routes.business.leads()} icon={ClipboardList} label="Gelen talepler" badge={stats.leads_waiting} /> : null}
          <MenuRow href={routes.business.edit()} icon={Pencil} label="İşletme sayfamı düzenle" />
          <MenuRow href={routes.business.photos()} icon={ImagePlus} label="Fotoğraflar" />
          <MenuRow href={routes.business.reviews()} icon={Star} label="Yorumlar" badge={stats.reviews_unreplied} />
          {isEmployer ? <MenuRow href={routes.profile.jobs()} icon={Briefcase} label="İş ilanlarım" /> : null}
        </ul>

        <div className="overflow-hidden rounded-2xl bg-card shadow-soft ring-1 ring-foreground/[0.06]">
          <VacationToggle businessId={b.id} initial={b.vacation_mode} />
        </div>

        <Button asChild variant="outline" size="lg">
          <Link href={routes.businesses.detail(b.slug)}>
            <ExternalLink /> Sayfamı görüntüle
          </Link>
        </Button>
      </div>
    </>
  );
}
