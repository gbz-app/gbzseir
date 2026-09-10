import type { Metadata } from "next";
import { CircleAlert, CircleCheck, ExternalLink, Pencil, Plus } from "lucide-react";
import { requireAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatNumber, formatRelativeTime } from "@/core/format";
import { AdminCard } from "@/features/admin/components/admin-ui";
import { NewsActiveSwitch, NewsSourceDialog, RefreshNewsButton, type NewsSourceValue } from "@/features/admin/components/news-admin";

export const metadata: Metadata = { title: "Haberler" };

type Source = NewsSourceValue & { last_fetched_at: string | null; last_error: string | null; news_items: Array<{ count: number }> | null };
type Item = { id: string; title: string; url: string; published_at: string | null; news_sources: { name: string } | null };

/** "Gebze Gündemi" kaynakları: RSS adresleri, durum ve son başlıklar. */
export default async function AdminNewsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [sourcesRes, itemsRes] = await Promise.all([
    supabase.from("news_sources").select("id,name,site_url,feed_url,active,last_fetched_at,last_error,news_items(count)").order("name"),
    supabase.from("news_items").select("id,title,url,published_at,news_sources(name)").order("published_at", { ascending: false }).limit(25),
  ]);
  const sources = (sourcesRes.data ?? []) as unknown as Source[];
  const items = (itemsRes.data ?? []) as unknown as Item[];
  const failing = sources.filter((s) => s.active && s.last_error).length;

  return (
    <>
      <AdminPageHeader
        title="Haberler"
        description={`${sources.filter((s) => s.active).length} aktif kaynak${failing ? ` · ${failing} kaynakta hata` : ""}. Başlıklar 20 dakikada bir yenilenir.`}
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
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <AdminCard title="Kaynaklar" bodyClassName="p-0">
          <ul className="divide-y">
            {sources.map((s) => (
              <li key={s.id} className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 font-semibold">
                    {s.active && !s.last_error ? <CircleCheck className="size-4 text-emerald-600" aria-label="Çalışıyor" /> : null}
                    {s.active && s.last_error ? <CircleAlert className="size-4 text-destructive" aria-label="Hata" /> : null}
                    {s.name}
                    {!s.active ? <Badge variant="secondary">Pasif</Badge> : null}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{s.feed_url}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.last_fetched_at ? `Son çekim ${formatRelativeTime(s.last_fetched_at)}` : "Henüz çekilmedi"} · {formatNumber(s.news_items?.[0]?.count ?? 0)} başlık arşivde
                  </p>
                  {s.last_error ? <p className="mt-0.5 text-xs text-destructive">{s.last_error}</p> : null}
                </div>
                <NewsActiveSwitch value={s} />
                <NewsSourceDialog
                  value={s}
                  trigger={
                    <Button variant="ghost" size="icon" aria-label={`${s.name} düzenle`}>
                      <Pencil />
                    </Button>
                  }
                />
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
