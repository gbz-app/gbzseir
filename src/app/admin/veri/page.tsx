import type { Metadata } from "next";
import { Database, TriangleAlert } from "lucide-react";
import { requireAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-page";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, formatNumber, formatRelativeTime } from "@/core/format";
import { AdminCard, EmptyCard, InfoList, InfoRow, StatTile } from "@/features/admin/components/admin-ui";
import { DemoCleanup } from "@/features/admin/components/demo-cleanup";
import { PoiSyncPanel } from "@/features/admin/components/poi-sync-panel";
import { POI_KINDS, POI_SOURCES, type DemoScope } from "@/features/admin/lib/labels";
import { POI_KIND_META } from "@/features/admin/lib/poi-kinds";
import { POI_SYNC_RUN_COLUMNS, poiSyncRunFromRow } from "@/features/nearby/server/poi-sync";
import type { PoiKind } from "@/features/nearby/types";

export const metadata: Metadata = { title: "Veri sağlığı" };

type Health = {
  generated_at: string;
  poi: Array<{ kind: string; source: string; license: string; n: number; last_updated: string | null }>;
  places: { total: number; curated: number; with_photos: number };
  duty: {
    total: number;
    active_now: number;
    current_start: string | null;
    current_end: string | null;
    last_fetched_at: string | null;
    by_source: Record<string, number>;
    mode?: string;
    demo_job?: boolean;
  };
  news: { sources: number; active: number; with_error: number; last_fetched_at: string | null; items: number; latest_item_at: string | null };
  demo: Partial<Record<DemoScope, number>>;
  /** Active non-demo admins (the demo admin can only be removed while there is one). */
  real_admins?: number;
  counts: Record<string, number>;
};

const DUTY_MODES: Record<string, string> = { demo: "Örnek veri", off: "Kapalı", live: "Canlı" };

const COUNT_LABELS: Record<string, string> = {
  users: "Kullanıcı",
  businesses_approved: "Onaylı işletme",
  listings_active: "Aktif ilan",
  requests: "Hizmet talebi",
  neighbourhoods: "Mahalle",
  neighbourhoods_without_center: "Merkezi olmayan mahalle",
  service_categories: "Hizmet kategorisi",
  sub_categories_without_flow: "Soru akışı olmayan alt kategori",
  listing_categories: "İlan kategorisi",
  push_subscriptions: "Bildirim aboneliği",
  notifications_unsent: "Gönderilmemiş bildirim",
};

/** Veri sağlığı: kaynaklar, yer verisi eşitleme, nöbetçi eczane, haber akışları, sayımlar ve örnek veri temizliği. */
export default async function AdminDataPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data, error }, lastRunRes, activeRunRes] = await Promise.all([
    supabase.rpc("admin_data_health"),
    // Last finished run (a preview only shows to the admin who asked for it).
    supabase
      .from("data_sync_runs")
      .select(POI_SYNC_RUN_COLUMNS)
      .eq("dataset", "poi")
      .eq("dry_run", false)
      .neq("status", "running")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // An admin request the public app is still working on ("Şimdi eşitle" before a reload).
    supabase
      .from("data_sync_runs")
      .select(POI_SYNC_RUN_COLUMNS)
      .eq("dataset", "poi")
      .eq("status", "running")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const h = data as unknown as Health | null;
  if (error || !h) {
    return (
      <>
        <AdminPageHeader title="Veri sağlığı" />
        <EmptyCard>
          <EmptyState icon={TriangleAlert} tone="warning" title="Veri özeti yüklenemedi" />
        </EmptyCard>
      </>
    );
  }
  const demoTotal = Object.values(h.demo).reduce<number>((a, b) => a + (b ?? 0), 0);
  const lastRun = lastRunRes.data ? poiSyncRunFromRow(lastRunRes.data) : null;
  const activeRun = activeRunRes.data ? poiSyncRunFromRow(activeRunRes.data) : null;

  return (
    <>
      <AdminPageHeader title="Veri sağlığı" description={`Özet ${formatRelativeTime(h.generated_at)} oluşturuldu.`} />
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Nöbette şu an" value={h.duty.active_now} icon={Database} tone={h.duty.active_now ? "success" : "danger"} hint={h.duty.last_fetched_at ? `Son çekim ${formatRelativeTime(h.duty.last_fetched_at)}` : "Hiç çekilmedi"} />
          <StatTile label="Gezilecek yer" value={h.places.total} hint={`${h.places.curated} öne çıkan · ${h.places.with_photos} fotoğraflı`} />
          <StatTile label="Haber kaynağı" value={`${h.news.active}/${h.news.sources}`} tone={h.news.with_error ? "warning" : "default"} hint={h.news.with_error ? `${h.news.with_error} kaynakta hata` : `${formatNumber(h.news.items)} başlık arşivde`} />
          <StatTile label="Örnek (demo) kayıt" value={demoTotal} tone={demoTotal ? "warning" : "success"} hint="Canlıya geçmeden temizlenmeli" />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <AdminCard title="Harita verileri (POI)">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[26rem] text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-1.5 font-medium">Tür</th>
                    <th className="py-1.5 font-medium">Kaynak</th>
                    <th className="py-1.5 text-right font-medium">Kayıt</th>
                    <th className="py-1.5 text-right font-medium">Güncelleme</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {h.poi.map((p) => (
                    <tr key={`${p.kind}-${p.source}-${p.license}`}>
                      <td className="py-1.5">{POI_KIND_META[p.kind as PoiKind]?.label ?? POI_KINDS[p.kind] ?? p.kind}</td>
                      <td className="py-1.5">
                        {POI_SOURCES[p.source] ?? p.source}
                        {p.license ? <span className="block text-xs text-muted-foreground">{p.license}</span> : null}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{formatNumber(p.n)}</td>
                      <td className="py-1.5 text-right text-xs text-muted-foreground">{p.last_updated ? formatRelativeTime(p.last_updated) : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </AdminCard>
          <AdminCard title="Nöbetçi eczane">
            <InfoList>
              <InfoRow label="Toplam kayıt">{formatNumber(h.duty.total)}</InfoRow>
              <InfoRow label="Şu an nöbette">{formatNumber(h.duty.active_now)}</InfoRow>
              <InfoRow label="Nöbet aralığı">{h.duty.current_start && h.duty.current_end ? `${formatDateTime(h.duty.current_start)} - ${formatDateTime(h.duty.current_end)}` : "-"}</InfoRow>
              <InfoRow label="Son çekim">{h.duty.last_fetched_at ? formatDateTime(h.duty.last_fetched_at) : "-"}</InfoRow>
              {h.duty.mode ? <InfoRow label="Liste modu">{DUTY_MODES[h.duty.mode] ?? h.duty.mode}</InfoRow> : null}
              {h.duty.demo_job !== undefined ? (
                <InfoRow label="Örnek liste üretimi">{h.duty.demo_job ? "Açık (her sabah)" : "Durduruldu"}</InfoRow>
              ) : null}
              <InfoRow label="Kaynaklar">
                <span className="flex flex-wrap gap-1.5">
                  {Object.entries(h.duty.by_source).map(([k, n]) => (
                    <Badge key={k} variant={k === "demo" ? "warning" : "secondary"}>
                      {k === "demo" ? "Örnek" : k}: {n}
                    </Badge>
                  ))}
                </span>
              </InfoRow>
            </InfoList>
          </AdminCard>
        </div>

        <AdminCard
          title="Yer verisi eşitleme"
          description="Eczane ve camiler (KBB) ile duraklar, taksi durakları, ATM'ler ve gezilecek yerler (OpenStreetMap) her ayın 2'sinde yeniden çekilir. Kaynakta artık olmayan yerler silinmez, gizlenir; kilitli yerlere dokunulmaz."
        >
          <PoiSyncPanel lastRun={lastRun} activeRun={activeRun} />
        </AdminCard>

        <AdminCard title="Sayımlar">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            {Object.entries(h.counts).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2 border-b py-1.5">
                <dt className="text-muted-foreground">{COUNT_LABELS[k] ?? k}</dt>
                <dd className={v && (k === "neighbourhoods_without_center" || k === "sub_categories_without_flow" || k === "notifications_unsent") ? "font-semibold text-amber-700" : "font-semibold"}>
                  {formatNumber(v)}
                </dd>
              </div>
            ))}
          </dl>
        </AdminCard>

        <AdminCard title="Örnek veri temizliği" description="Canlıya geçmeden önce örnek hesapları, işletmeleri, ilanları ve diğer örnek kayıtları buradan silebilirsin.">
          <DemoCleanup counts={h.demo} realAdmins={h.real_admins ?? 0} />
        </AdminCard>
      </div>
    </>
  );
}
