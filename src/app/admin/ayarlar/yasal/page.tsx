import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Eye, Pencil, Plus, TriangleAlert } from "lucide-react";
import { requireAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-page";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { publicUrl } from "@/config/app-mode";
import { formatDate, formatDateTime } from "@/core/format";
import { routes } from "@/core/routes";
import { AdminCard, EmptyCard, StatusBadge } from "@/features/admin/components/admin-ui";
import { LegalTextDialog } from "@/features/admin/components/legal-text-dialog";
import type { LabelMap } from "@/features/admin/lib/labels";
import { LEGAL_LABELS, LEGAL_PATHS, LEGAL_SLUGS, suggestNextVersion } from "@/features/legal/meta";

export const metadata: Metadata = { title: "Yasal metinler" };

const VERSION_STATUS: LabelMap = {
  live: { label: "Yayında", tone: "success" },
  old: { label: "Eski sürüm", tone: "secondary" },
  draft: { label: "Taslak", tone: "warning" },
};

/** Yasal metinler: sürümlü KVKK, açık rıza, koşullar, gizlilik ve çerez metinleri. The newest published version is live. */
export default async function AdminLegalTextsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("legal_texts")
    .select("id,slug,version,title,body_md,pending_review,published_at,created_at,updated_at")
    .order("created_at", { ascending: false })
    .limit(500);
  const rows = data ?? [];

  return (
    <>
      <AdminPageHeader
        title="Yasal metinler"
        description="Uygulamada her metnin en yeni yayınlanan sürümü görünür. Yayınlanan sürümler değişmez; kullanıcının onayladığı KVKK sürümü profilinde saklanır."
        actions={
          <Button asChild variant="outline">
            <Link href={routes.admin.settings()}>
              <ArrowLeft /> Ayarlar
            </Link>
          </Button>
        }
      />
      {error ? (
        <EmptyCard>
          <EmptyState icon={TriangleAlert} tone="warning" title="Yasal metinler yüklenemedi" />
        </EmptyCard>
      ) : (
        <div className="grid gap-4">
          {LEGAL_SLUGS.map((slug) => {
            const versions = rows.filter((r) => r.slug === slug);
            const live = versions
              .filter((r) => r.published_at)
              .sort((a, b) => (a.published_at! < b.published_at! ? 1 : -1))[0];
            const base = live ?? versions[0];
            return (
              <AdminCard
                key={slug}
                title={LEGAL_LABELS[slug]}
                description={
                  live?.published_at ? `Yayında: sürüm ${live.version} · ${formatDate(live.published_at, { month: "long", year: true })}` : "Yayında sürüm yok"
                }
                actions={
                  <>
                    <Button asChild variant="ghost" size="sm">
                      <a href={publicUrl(LEGAL_PATHS[slug])} target="_blank" rel="noopener noreferrer">
                        <ExternalLink /> Görüntüle
                      </a>
                    </Button>
                    <LegalTextDialog
                      slug={slug}
                      base={{
                        version: suggestNextVersion(versions.map((r) => r.version)),
                        title: base?.title ?? LEGAL_LABELS[slug],
                        body: base?.body_md ?? "",
                      }}
                      trigger={
                        <Button size="sm">
                          <Plus /> Yeni sürüm
                        </Button>
                      }
                    />
                  </>
                }
              >
                {versions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Henüz sürüm yok. Yeni sürüm ile metni yaz ve yayınla.</p>
                ) : (
                  <ul className="grid gap-2">
                    {versions.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-muted/40 p-3">
                        <span className="font-mono text-sm font-semibold">{r.version}</span>
                        <StatusBadge map={VERSION_STATUS} value={r.id === live?.id ? "live" : r.published_at ? "old" : "draft"} />
                        {r.pending_review ? <Badge variant="outline">İnceleme bekliyor</Badge> : null}
                        <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                          {r.published_at ? `Yayın: ${formatDateTime(r.published_at)}` : `Son düzenleme ${formatDateTime(r.updated_at)}`}
                        </span>
                        <LegalTextDialog
                          slug={slug}
                          value={{ id: r.id, version: r.version, title: r.title, body: r.body_md, pending_review: r.pending_review, published_at: r.published_at }}
                          trigger={
                            <Button variant="outline" size="sm">
                              {r.published_at ? (
                                <>
                                  <Eye /> Aç
                                </>
                              ) : (
                                <>
                                  <Pencil /> Düzenle
                                </>
                              )}
                            </Button>
                          }
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </AdminCard>
            );
          })}
          <p className="flex items-start gap-2 rounded-xl bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> İlk sürümler taslaktır: köşeli parantezli alanlar ([Şirket unvanı], [Adres], [MERSİS No],
            [KEP/e-posta] vb.) doldurulmalı ve metinler avukat onayından sonra yeni sürüm olarak yayınlanmalı.
          </p>
        </div>
      )}
    </>
  );
}
