import type { Metadata } from "next";
import { CircleAlert, CircleCheck, ExternalLink, FileCheck, FileQuestionMark, Pencil, Plus, Timer } from "lucide-react";
import { requireAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatNumber, formatRelativeTime } from "@/core/format";
import { AdminCard } from "@/features/admin/components/admin-ui";
import { NewsActiveSwitch, NewsSourceDialog, RefreshNewsButton, type NewsSourceValue } from "@/features/admin/components/news-admin";

export const metadata: Metadata = { title: "Haberler" };

type Source = NewsSourceValue & {
  last_fetched_at: string | null;
  last_error: string | null;
  fail_count: number;
  failing_since: string | null;
  /** Archived headlines of the source. */
  item_count: number;
};
type Item = { id: string; title: string; url: string; published_at: string | null; news_sources: { name: string } | null };

/** Same mark as news_record_fetch, which also notifies the admins then. */
const LONG_FAIL_MS = 3 * 86_400_000;
/** The job runs every 20 minutes; no fetch for this long means it is not running. */
const CRON_LATE_MS = 45 * 60_000;

function feedHealth(sources: Source[], now = Date.now()) {
  const active = sources.filter((s) => s.active);
  const lastFetchedMs = Math.max(0, ...active.map((s) => (s.last_fetched_at ? Date.parse(s.last_fetched_at) : 0)));
  return {
    active,
    failing: active.filter((s) => s.last_error),
    lastFetched: lastFetchedMs ? new Date(lastFetchedMs).toISOString() : null,
    cronLate: active.length > 0 && now - lastFetchedMs > CRON_LATE_MS,
    isLongFailing: (s: Source) => !!s.failing_since && now - Date.parse(s.failing_since) > LONG_FAIL_MS,
  };
}

function EditSourceButton({ source }: { source: Source }) {
  return (
    <NewsSourceDialog
      value={source}
      trigger={
        <Button variant="ghost" size="icon" aria-label={`${source.name} düzenle`}>
          <Pencil />
        </Button>
      }
    />
  );
}

/** "Gebze Gündemi" kaynakları: RSS adresleri, çekim durumu, hata veren kaynaklar, izin notları ve son başlıklar. */
export default async function AdminNewsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [sourcesRes, itemsRes] = await Promise.all([
    // permission_note is not readable through the API (column grants): admin-only RPC with the admin's session.
    supabase.rpc("admin_news_sources"),
    supabase.from("news_items").select("id,title,url,published_at,news_sources(name)").order("published_at", { ascending: false }).limit(25),
  ]);
  const sources: Source[] = sourcesRes.data ?? [];
  const items = (itemsRes.data ?? []) as unknown as Item[];
  const { active, failing, lastFetched, cronLate, isLongFailing } = feedHealth(sources);

  return (
    <>
      <AdminPageHeader
        title="Haberler"
        description={`${active.length} aktif kaynak${failing.length ? ` · ${failing.length} kaynakta hata` : ""} · ${
          lastFetched ? `son çekim ${formatRelativeTime(lastFetched)}` : "henüz çekilmedi"
        }. Başlıklar 20 dakikada bir otomatik çekilir.`}
        actions={
          <>
            <RefreshNewsButton />
            <NewsSourceDialog
              trigger={
                <Button>
                  <Plus /> Kaynak ekle
                </Button>
              }
            />
          </>
        }
      />
      {sourcesRes.error ? <p className="mb-4 rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">Kaynaklar yüklenemedi. Sayfayı yenile.</p> : null}
      {cronLate ? (
        <p role="status" className="mb-4 flex items-start gap-2 rounded-2xl bg-highlight-soft px-4 py-3 text-sm text-highlight-foreground">
          <Timer className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>Zamanlanmış çekim 45 dakikadır çalışmadı. Başlıklar şimdilik sayfa ziyaretlerinde çekiliyor; &quot;Şimdi çek&quot; ile hemen yenileyebilirsin.</span>
        </p>
      ) : null}
      {failing.length ? (
        <AdminCard
          title="Hata veren kaynaklar"
          description="3 günden uzun süren hatalar genel bakışa bildirim olarak da düşer. Düzelmeyen kaynağı pasife alabilir ya da yayıncıyla iletişime geçebilirsin."
          className="mb-4"
          bodyClassName="p-0"
        >
          <ul className="divide-y">
            {failing.map((s) => (
              <li key={s.id} className="flex items-start gap-3 px-4 py-3">
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 font-semibold">
                    {s.name}
                    {isLongFailing(s) ? <Badge variant="destructive">3 günden uzun</Badge> : null}
                  </p>
                  <p className="text-xs text-destructive">{s.last_error}</p>
                  <p className="text-xs text-muted-foreground">
                    Art arda {formatNumber(s.fail_count)} başarısız çekim{s.failing_since ? ` · ${formatRelativeTime(s.failing_since)} başladı` : ""}
                  </p>
                </div>
                <EditSourceButton source={s} />
              </li>
            ))}
          </ul>
        </AdminCard>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <AdminCard title="Kaynaklar" bodyClassName="p-0">
          <ul className="divide-y">
            {sources.map((s) => (
              <li key={s.id} className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 font-semibold">
                    {s.active && !s.last_error ? <CircleCheck className="size-4 text-emerald-600" aria-label="Çalışıyor" /> : null}
                    {s.active && s.last_error ? <CircleAlert className="size-4 text-destructive" aria-label="Hata" /> : null}
                    {s.name}
                    {!s.active ? <Badge variant="secondary">Pasif</Badge> : null}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{s.feed_url}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.last_fetched_at ? `Son çekim ${formatRelativeTime(s.last_fetched_at)}` : "Henüz çekilmedi"} · {formatNumber(s.item_count ?? 0)} başlık arşivde
                  </p>
                  {s.last_error ? (
                    <p className="mt-0.5 text-xs text-destructive">
                      {s.last_error}
                      {s.fail_count > 1 ? ` · art arda ${formatNumber(s.fail_count)} kez` : ""}
                    </p>
                  ) : null}
                  <p className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
                    {s.permission_note ? (
                      <FileCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-600" aria-label="İzin notu" />
                    ) : (
                      <FileQuestionMark className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    )}
                    <span className="min-w-0 break-words">{s.permission_note ?? "Kullanım izni notu yok"}</span>
                  </p>
                </div>
                <NewsActiveSwitch value={s} />
                <EditSourceButton source={s} />
              </li>
            ))}
          </ul>
        </AdminCard>
        <AdminCard title="Son başlıklar" bodyClassName="p-0">
          <ul className="divide-y">
            {items.map((i) => (
              <li key={i.id} className="px-4 py-2.5">
                <a href={i.url} target="_blank" rel="noopener noreferrer" className="group flex items-start gap-2 text-sm">
                  <span className="min-w-0 flex-1 group-hover:underline">{i.title}</span>
                  <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                </a>
                <p className="text-xs text-muted-foreground">
                  {i.news_sources?.name ?? "-"} · {i.published_at ? formatRelativeTime(i.published_at) : "-"}
                </p>
              </li>
            ))}
          </ul>
        </AdminCard>
      </div>
    </>
  );
}
