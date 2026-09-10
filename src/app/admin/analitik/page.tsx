import type { Metadata } from "next";
import Link from "next/link";
import { Eye, Laptop, MousePointerClick, Smartphone, Tablet, Timer, TriangleAlert, Undo2, UserRound, Users } from "lucide-react";
import { requireAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-page";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatNumber, formatRelativeTime } from "@/core/format";
import { routes } from "@/core/routes";
import { AdminCard, EmptyCard, FilterTabs, StatTile } from "@/features/admin/components/admin-ui";
import { ColumnChart, HBarList, dayLabel, formatDuration } from "@/features/admin/components/charts";
import { LiveRefresher } from "@/features/admin/components/live-refresher";
import { StoreStatForm } from "@/features/admin/components/store-stat-form";
import { DEVICE_LABELS, INSTALL_LABELS, STORE_LABELS, pathLabel, type AnalyticsData, type OnlineSession } from "@/features/admin/lib/analytics-types";
import { oneOf } from "@/features/admin/lib/params";

export const metadata: Metadata = { title: "Canlı ve analitik" };

const RANGES = ["7", "30", "90"] as const;
const DEVICE_ICONS: Record<string, typeof Smartphone> = { mobile: Smartphone, tablet: Tablet, desktop: Laptop };

const entries = (o: Record<string, number>) => Object.entries(o ?? {}).sort((a, b) => b[1] - a[1]);

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AdminAnalyticsPage({ searchParams }: Props) {
  await requireAdmin();
  const sp = await searchParams;
  const days = Number(oneOf(sp.gun, RANGES, "30"));
  const supabase = await createClient();
  const [analytics, online] = await Promise.all([supabase.rpc("admin_analytics", { p_days: days }), supabase.rpc("admin_online_now")]);
  const a = analytics.data as unknown as AnalyticsData | null;
  const live = (online.data as unknown as OnlineSession[] | null) ?? [];

  return (
    <>
      <AdminPageHeader
        title="Canlı ve analitik"
        description="Uygulama içi, çerezsiz ölçüm: yalnızca sayfa yolu, cihaz türü ve süre tutulur. Veriler 180 gün saklanır."
        actions={<LiveRefresher seconds={30} />}
      />

      <div className="grid gap-4">
        <AdminCard title={`Şu an çevrimiçi: ${live.length}`} description="Son 2 dakikada uygulamada olanlar">
          {live.length ? (
            <ul className="divide-y">
              {live.map((s) => {
                const Icon = DEVICE_ICONS[s.device ?? ""] ?? Smartphone;
                return (
                  <li key={s.session} className="flex flex-wrap items-center gap-3 py-2.5">
                    <Icon className="size-5 shrink-0 text-muted-foreground" aria-label={DEVICE_LABELS[s.device ?? "bilinmiyor"]} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {s.user_id ? (
                          <Link className="text-primary hover:underline" href={routes.admin.user(s.user_id)}>
                            {s.name ?? "İsimsiz üye"}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">Misafir</span>
                        )}
                        {s.standalone ? (
                          <Badge variant="info" className="ml-2 h-5">
                            Uygulama
                          </Badge>
                        ) : null}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {pathLabel(s.path)} · {s.os ?? "?"} · {s.page_views} sayfa
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground tabular-nums">{formatDuration((Date.parse(s.last_seen_at) - Date.parse(s.started_at)) / 1000)}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Şu an uygulamada kimse yok.</p>
          )}
        </AdminCard>

        <FilterTabs
          ariaLabel="Zaman aralığı"
          items={RANGES.map((r) => ({ label: `Son ${r} gün`, active: Number(r) === days, href: routes.admin.analytics({ gun: r === "30" ? undefined : r }) }))}
        />

        {analytics.error || !a ? (
          <EmptyCard>
            <EmptyState icon={TriangleAlert} tone="warning" title="Analitik yüklenemedi" description="Sayfayı yenileyip tekrar dene." />
          </EmptyCard>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <StatTile label="Ziyaretçi" value={a.totals.visitors} icon={Users} hint={`${a.totals.signed_in} giriş yapmış üye`} tone="success" />
              <StatTile label="Oturum" value={a.totals.sessions} icon={MousePointerClick} />
              <StatTile label="Sayfa görüntüleme" value={a.totals.page_views} icon={Eye} tone="info" />
              <StatTile label="Ort. oturum süresi" value={formatDuration(a.totals.avg_duration_s)} icon={Timer} />
              <StatTile label="Tek sayfada çıkma" value={`%${formatNumber(a.totals.bounce_rate, 1)}`} icon={Undo2} hint="Tek sayfa görüp ayrılan oturumlar" />
              <StatTile label="Uygulamadan giriş" value={`%${formatNumber(a.totals.standalone_share, 1)}`} icon={UserRound} hint="Ana ekrana eklenmiş uygulamadan açılan oturumlar" />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <AdminCard title="Günlük ziyaret">
                <ColumnChart
                  ariaLabel="Günlük ziyaretçi ve oturum"
                  legend={["Ziyaretçi", "Oturum"]}
                  color="bg-emerald-500"
                  secondaryColor="bg-primary"
                  data={a.series.map((s) => ({ label: dayLabel(s.date), value: s.visitors, secondary: s.sessions }))}
                />
              </AdminCard>
              <AdminCard title="Günlük sayfa görüntüleme">
                <ColumnChart ariaLabel="Günlük sayfa görüntüleme" color="bg-sky-500" data={a.series.map((s) => ({ label: dayLabel(s.date), value: s.page_views }))} />
              </AdminCard>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <AdminCard title="En çok bakılan sayfalar" className="lg:col-span-2">
                <HBarList items={a.top_pages.map((p) => ({ label: pathLabel(p.path), value: p.views, hint: p.avg_s ? `· ort. ${formatDuration(p.avg_s)}` : undefined }))} />
              </AdminCard>
              <AdminCard title="Cihaz">
                <HBarList items={entries(a.devices).map(([k, n]) => ({ label: DEVICE_LABELS[k] ?? k, value: n }))} />
                <h3 className="mt-5 mb-2 text-sm font-semibold">İşletim sistemi</h3>
                <HBarList items={entries(a.os).map(([k, n]) => ({ label: k, value: n }))} />
                <h3 className="mt-5 mb-2 text-sm font-semibold">Tarayıcı</h3>
                <HBarList items={entries(a.browsers).map(([k, n]) => ({ label: k, value: n }))} />
              </AdminCard>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <AdminCard title="Nereden geldiler?" description="Dış bağlantıdan gelen oturumlar">
                <HBarList items={a.referrers.map((r) => ({ label: r.host, value: r.sessions }))} empty="Dış kaynaktan gelen ziyaret yok." />
              </AdminCard>
              <AdminCard title="Uygulama kurulumları" description={`Son ${days} gün`}>
                <HBarList items={entries(a.installs).map(([k, n]) => ({ label: INSTALL_LABELS[k] ?? k, value: n }))} empty="Bu dönemde kurulum yok." />
                <ColumnChart ariaLabel="Günlük kurulum" color="bg-amber-500" height={80} data={a.series.map((s) => ({ label: dayLabel(s.date), value: s.installs }))} />
              </AdminCard>
            </div>

            <AdminCard
              title="Google Play ve App Store"
              description="Uygulama mağazaya çıkınca Play Console ve App Store Connect bağlanacak; o zamana kadar rakamlar buradan girilebilir."
            >
              <StoreStatForm />
              {a.store.length ? (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[36rem] text-sm">
                    <thead className="text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="py-2 font-medium">Tarih</th>
                        <th className="py-2 font-medium">Mağaza</th>
                        <th className="py-2 text-right font-medium">İndirme</th>
                        <th className="py-2 text-right font-medium">Aktif kurulum</th>
                        <th className="py-2 text-right font-medium">Puan</th>
                        <th className="py-2 text-right font-medium">Yorum</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {a.store.map((s) => (
                        <tr key={s.id}>
                          <td className="py-2">{formatDate(s.stat_date)}</td>
                          <td className="py-2">{STORE_LABELS[s.platform]}</td>
                          <td className="py-2 text-right tabular-nums">{formatNumber(s.downloads ?? 0)}</td>
                          <td className="py-2 text-right tabular-nums">{formatNumber(s.active_installs ?? 0)}</td>
                          <td className="py-2 text-right tabular-nums">{s.rating ?? "-"}</td>
                          <td className="py-2 text-right tabular-nums">{formatNumber(s.reviews_count ?? 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              <p className="mt-3 text-xs text-muted-foreground">Son ölçüm {formatRelativeTime(new Date())}.</p>
            </AdminCard>
          </>
        )}
      </div>
    </>
  );
}
