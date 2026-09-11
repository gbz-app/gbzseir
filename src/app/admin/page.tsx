import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  CalendarDays,
  ClipboardList,
  Clock,
  Download,
  Eye,
  Flag,
  LifeBuoy,
  Store,
  Tag,
  TriangleAlert,
  UserPlus,
  Users,
} from "lucide-react";
import { requireAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-page";
import { EmptyState } from "@/components/shared/empty-state";
import { formatNumber, formatRelativeTime } from "@/core/format";
import { routes, withQuery } from "@/core/routes";
import { VERTICAL_INFO, parseVertical } from "@/features/business/lib/verticals";
import { AdminCard, EmptyCard, StatTile } from "@/features/admin/components/admin-ui";
import { ColumnChart, HBarList, dayLabel, formatDuration } from "@/features/admin/components/charts";
import { LiveRefresher } from "@/features/admin/components/live-refresher";
import { AdminNotices } from "@/features/admin/components/admin-notices";
import { INSTALL_LABELS, STORE_LABELS, pathLabel, type DashboardData } from "@/features/admin/lib/analytics-types";

export const metadata: Metadata = { title: "Genel bakış" };

/** Yönetim ana ekranı: canlı kullanıcı, bugün, bekleyen işler, 14 günlük grafik, kurulumlar, en çok bakılan sayfalar. */
export default async function AdminDashboardPage() {
  const { user } = await requireAdmin();
  const supabase = await createClient();
  const [{ data, error }, { data: notices }] = await Promise.all([
    supabase.rpc("admin_dashboard"),
    // Admin notices (new business, unmatched request...) are shown here only, never in the app.
    supabase
      .from("notifications")
      .select("id,title,body,link,read_at,created_at")
      .eq("user_id", user.id)
      .like("link", "/admin%")
      .order("created_at", { ascending: false })
      .limit(8),
  ]);
  const d = data as unknown as DashboardData | null;

  if (error || !d) {
    return (
      <>
        <AdminPageHeader title="Genel bakış" />
        <EmptyCard>
          <EmptyState icon={TriangleAlert} tone="warning" title="Özet yüklenemedi" description="Sayfayı yenileyip tekrar dene." />
        </EmptyCard>
      </>
    );
  }

  const store = d.installs.store ?? {};
  const pending = [
    { label: "Yayında olmayan işletme", value: d.businesses.pending, href: withQuery(routes.admin.businesses(), { sekme: "basvurular" }), icon: Store },
    { label: "Onay bekleyen ilan", value: d.content.listings_pending, href: routes.admin.listings(), icon: Tag },
    { label: "Açık şikayet", value: d.content.reports_open, href: routes.admin.reports(), icon: Flag },
    { label: "Yeni destek mesajı", value: d.content.support_new, href: routes.admin.support(), icon: LifeBuoy },
    { label: "Açık hizmet talebi", value: d.content.requests_open, href: routes.admin.requests(), icon: ClipboardList },
    { label: "Onay bekleyen etkinlik", value: d.content.events_pending ?? 0, href: withQuery(routes.admin.events(), { sekme: "onay" }), icon: CalendarDays },
  ];

  return (
    <>
      <AdminPageHeader title="Genel bakış" description={`Son güncelleme ${formatRelativeTime(d.generated_at)}`} actions={<LiveRefresher seconds={60} />} />

      <div className="grid gap-4">
        <Link
          href={routes.admin.analytics()}
          className="flex flex-wrap items-center gap-4 rounded-2xl bg-linear-to-r from-emerald-500 to-teal-500 p-5 text-white shadow-soft outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="flex size-12 items-center justify-center rounded-2xl bg-white/20">
            <Activity className="size-6" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-white/80">Şu an uygulamada</p>
            <p className="text-4xl font-extrabold tabular-nums">{formatNumber(d.live.online_now)}</p>
          </div>
          <div className="text-sm text-white/90">
            <p>{formatNumber(d.live.online_users)} giriş yapmış kullanıcı</p>
            <p>{formatNumber(d.live.online_now - d.live.online_users)} misafir</p>
          </div>
        </Link>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Toplam kullanıcı" value={d.users.total} icon={Users} hint={`Bugün +${d.users.today} · 7 gün +${d.users.week}`} href={routes.admin.users()} />
          <StatTile label="Onaylı işletme" value={d.businesses.approved} icon={Store} tone="info" hint={`${d.users.business_owners} işletme sahibi`} href={routes.admin.businesses()} />
          <StatTile label="Bugünkü ziyaretçi" value={d.today.visitors} icon={Eye} tone="success" hint={`${d.today.sessions} oturum · ${d.today.signed_in} üye`} href={routes.admin.analytics()} />
          <StatTile label="Ort. oturum süresi" value={formatDuration(d.today.avg_duration_s)} icon={Clock} hint={`${formatNumber(d.page_views_today)} sayfa görüntüleme bugün`} />
          <StatTile label="Aktif ilan" value={d.content.listings_active} icon={Tag} href={routes.admin.listings()} />
          <StatTile label="Yaklaşan etkinlik" value={d.content.events_upcoming} icon={CalendarDays} />
          <StatTile label="Uygulama kurulumu" value={d.installs.total} icon={Download} tone="info" hint={`Son 7 gün +${d.installs.week}`} href={routes.admin.analytics()} />
          <StatTile label="Kısıtlı / engelli hesap" value={d.users.restricted} icon={UserPlus} tone={d.users.restricted ? "danger" : "default"} href={routes.admin.users()} />
        </div>

        <AdminCard title="Bekleyen işler">
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {pending.map((p) => (
              <li key={p.label}>
                <Link
                  href={p.href}
                  className="flex items-center gap-3 rounded-xl bg-muted/50 p-3 transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <p.icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 text-sm">{p.label}</span>
                  <span className={p.value ? "rounded-full bg-primary px-2 py-0.5 text-sm font-bold text-primary-foreground tabular-nums" : "text-sm text-muted-foreground tabular-nums"}>
                    {formatNumber(p.value)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </AdminCard>

        <AdminCard title="Yönetim bildirimleri" description="Yeni işletmeler, eşleşmeyen talepler ve onay bekleyen işler">
          <AdminNotices initial={notices ?? []} />
        </AdminCard>

        <div className="grid gap-4 lg:grid-cols-2">
          <AdminCard title="Ziyaretler (14 gün)" description="Günlük oturum ve sayfa görüntüleme">
            <ColumnChart
              ariaLabel="Günlük oturum ve sayfa görüntüleme"
              legend={["Oturum", "Sayfa görüntüleme"]}
              color="bg-primary"
              secondaryColor="bg-sky-400"
              data={d.series.map((s) => ({ label: dayLabel(s.date), value: s.sessions, secondary: s.page_views }))}
            />
          </AdminCard>
          <AdminCard title="Yeni üyeler (14 gün)">
            <ColumnChart ariaLabel="Günlük yeni üye" color="bg-emerald-500" data={d.series.map((s) => ({ label: dayLabel(s.date), value: s.signups }))} />
          </AdminCard>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <AdminCard title="En çok bakılan sayfalar" description="Son 7 gün">
            <HBarList items={d.top_pages.map((p) => ({ label: pathLabel(p.path), value: p.views }))} />
          </AdminCard>
          <AdminCard title="İşletmeler (türe göre)">
            <HBarList
              items={Object.entries(d.businesses.by_vertical)
                .sort((a, b) => b[1] - a[1])
                .map(([k, n]) => ({ label: VERTICAL_INFO[parseVertical(k) ?? "diger"].label, value: n }))}
            />
          </AdminCard>
          <AdminCard title="İndirmeler ve kurulumlar" actions={<Link className="text-sm font-semibold text-primary" href={routes.admin.analytics()}>Ayrıntı</Link>}>
            <HBarList items={Object.entries(d.installs.by_platform).map(([k, n]) => ({ label: INSTALL_LABELS[k] ?? k, value: n }))} empty="Henüz kurulum yok." />
            <div className="mt-4 grid grid-cols-2 gap-2">
              {(["google_play", "app_store"] as const).map((p) => {
                const row = store[p];
                return (
                  <div key={p} className="rounded-xl bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">{STORE_LABELS[p]}</p>
                    {row ? (
                      <>
                        <p className="mt-0.5 text-lg font-bold tabular-nums">{formatNumber(row.downloads ?? 0)}</p>
                        <p className="text-xs text-muted-foreground">
                          {row.rating != null ? `${row.rating} puan · ` : ""}
                          {formatNumber(row.reviews_count ?? 0)} yorum
                        </p>
                      </>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">Mağazada değil</p>
                    )}
                  </div>
                );
              })}
            </div>
          </AdminCard>
        </div>
      </div>
    </>
  );
}
