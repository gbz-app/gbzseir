import type { Metadata } from "next";
import { ExternalLink, Newspaper, Pencil, Plus, TriangleAlert } from "lucide-react";
import { requireAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-page";
import { EmptyState } from "@/components/shared/empty-state";
import { DemoBadge } from "@/components/shared/badges";
import { Button } from "@/components/ui/button";
import { publicUrl } from "@/config/app-mode";
import { formatDateTime } from "@/core/format";
import { routes, withQuery } from "@/core/routes";
import { AdminCard, AdminThumb, EmptyCard, FilterTabs, StatusBadge } from "@/features/admin/components/admin-ui";
import { NewsArticleDialog, type NewsArticleValue } from "@/features/admin/components/news-article-dialog";
import type { LabelMap } from "@/features/admin/lib/labels";
import { oneOf } from "@/features/admin/lib/params";
import { toArticleCategory } from "@/features/content/articles/meta";
import { NEWS_CATEGORY_LABELS } from "@/features/content/news/parse";

export const metadata: Metadata = { title: "Haber yazıları" };

const TABS = ["tumu", "yayinda", "taslak"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = { tumu: "Tümü", yayinda: "Yayında", taslak: "Taslak" };

const ARTICLE_STATUS: LabelMap = {
  published: { label: "Yayında", tone: "success" },
  draft: { label: "Taslak", tone: "secondary" },
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Haber yazıları: Gebzem'in kendi haberleri (taslak / yayında), RSS başlıklarından önce gösterilir. */
export default async function AdminNewsArticlesPage({ searchParams }: Props) {
  await requireAdmin();
  const sp = await searchParams;
  const tab = oneOf<Tab>(sp.sekme, TABS, "tumu");
  const supabase = await createClient();

  let query = supabase.from("news_articles").select("id,slug,title,summary,body,category,cover_url,status,published_at,is_demo,updated_at");
  if (tab === "yayinda") query = query.eq("status", "published");
  else if (tab === "taslak") query = query.eq("status", "draft");
  const { data, error } = await query.order("updated_at", { ascending: false }).limit(100);
  const rows = (data ?? []).map((r) => ({
    ...r,
    category: toArticleCategory(r.category),
    status: r.status === "published" ? ("published" as const) : ("draft" as const),
  }));

  return (
    <>
      <AdminPageHeader
        title="Haber yazıları"
        description="Gebzem'in kendi haberleri. Yayındakiler ana sayfada ve Haberler sayfasında kaynak haberlerinden önce görünür."
        actions={
          <NewsArticleDialog
            trigger={
              <Button>
                <Plus /> Yeni haber
              </Button>
            }
          />
        }
      />
      <FilterTabs
        ariaLabel="Haber filtresi"
        items={TABS.map((t) => ({ label: TAB_LABELS[t], active: t === tab, href: withQuery(routes.admin.newsArticles(), { sekme: t === "tumu" ? undefined : t }) }))}
      />
      <div className="mt-5 grid gap-3">
        {error ? (
          <EmptyCard>
            <EmptyState icon={TriangleAlert} tone="warning" title="Haberler yüklenemedi" />
          </EmptyCard>
        ) : rows.length === 0 ? (
          <EmptyCard>
            <EmptyState icon={Newspaper} title={tab === "tumu" ? "Henüz haber yok" : "Bu filtrede haber yok"} description="Yeni haber ile ilk haberini yaz." />
          </EmptyCard>
        ) : (
          rows.map((a) => {
            const value: NewsArticleValue = a;
            return (
              <AdminCard key={a.id} as="article">
                <div className="flex items-start gap-3">
                  <AdminThumb src={a.cover_url} alt="" size={72} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge map={ARTICLE_STATUS} value={a.status} />
                      <span className="text-xs font-semibold text-muted-foreground">{NEWS_CATEGORY_LABELS[a.category]}</span>
                      {a.is_demo ? <DemoBadge /> : null}
                    </div>
                    <h2 className="mt-1.5 font-bold break-words">{a.title}</h2>
                    {a.summary ? <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{a.summary}</p> : null}
                    <p className="mt-2 text-xs break-all text-muted-foreground">
                      {a.published_at ? `Yayın: ${formatDateTime(a.published_at)}` : "Henüz yayınlanmadı"} · Son düzenleme {formatDateTime(a.updated_at)} ·{" "}
                      {routes.content.newsArticle(a.slug)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row">
                    {a.status === "published" ? (
                      <Button asChild variant="ghost" size="sm">
                        <a href={publicUrl(routes.content.newsArticle(a.slug))} target="_blank" rel="noopener noreferrer">
                          <ExternalLink /> Görüntüle
                        </a>
                      </Button>
                    ) : null}
                    <NewsArticleDialog
                      value={value}
                      trigger={
                        <Button variant="outline" size="sm">
                          <Pencil /> Düzenle
                        </Button>
                      }
                    />
                  </div>
                </div>
              </AdminCard>
            );
          })
        )}
      </div>
    </>
  );
}
