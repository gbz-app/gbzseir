import type { Metadata } from "next";
import { Megaphone, Pencil, Plus, TriangleAlert } from "lucide-react";
import { requireAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-page";
import { EmptyState } from "@/components/shared/empty-state";
import { DemoBadge } from "@/components/shared/badges";
import { Button } from "@/components/ui/button";
import { KOCAELI_DISTRICTS } from "@/config/districts";
import { formatDateTime } from "@/core/format";
import { routes, withQuery } from "@/core/routes";
import { AdminCard, EmptyCard, FilterTabs, StatusBadge } from "@/features/admin/components/admin-ui";
import { AnnouncementDialog, type AnnouncementValue } from "@/features/admin/components/announcement-dialog";
import { ANNOUNCEMENT_KINDS } from "@/features/admin/lib/labels";
import { oneOf } from "@/features/admin/lib/params";

export const metadata: Metadata = { title: "Duyurular" };

const TABS = ["aktif", "planlanan", "biten", "tumu"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = { aktif: "Yayında", planlanan: "Planlanan", biten: "Biten", tumu: "Tümü" };

type Row = AnnouncementValue & { is_demo: boolean; created_at: string };
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Duyurular: su / elektrik kesintisi, belediye ve genel duyurular (ilçe hedefli). */
export default async function AdminAnnouncementsPage({ searchParams }: Props) {
  await requireAdmin();
  const sp = await searchParams;
  const tab = oneOf<Tab>(sp.sekme, TABS, "aktif");
  const supabase = await createClient();
  const now = new Date().toISOString();

  let query = supabase.from("announcements").select("id,kind,title,body,district_ids,source_label,starts_at,ends_at,is_demo,created_at");
  if (tab === "aktif") query = query.lte("starts_at", now).or(`ends_at.is.null,ends_at.gt.${now}`).order("starts_at", { ascending: false });
  else if (tab === "planlanan") query = query.gt("starts_at", now).order("starts_at");
  else if (tab === "biten") query = query.lte("ends_at", now).order("ends_at", { ascending: false });
  else query = query.order("created_at", { ascending: false });

  const { data, error } = await query.limit(100);
  const rows = (data ?? []) as unknown as Row[];

  return (
    <>
      <AdminPageHeader
        title="Duyurular"
        description="Yayındaki duyurular Duyurular sayfasında görünür. İlçe seçmezsen tüm Kocaeli için yayınlanır."
        actions={
          <AnnouncementDialog
            trigger={
              <Button>
                <Plus /> Yeni duyuru
              </Button>
            }
          />
        }
      />
      <FilterTabs ariaLabel="Duyuru filtresi" items={TABS.map((t) => ({ label: TAB_LABELS[t], active: t === tab, href: withQuery(routes.admin.announcements(), { sekme: t === "aktif" ? undefined : t }) }))} />
      <div className="mt-5 grid gap-3">
        {error ? (
          <EmptyCard>
            <EmptyState icon={TriangleAlert} tone="warning" title="Duyurular yüklenemedi" />
          </EmptyCard>
        ) : rows.length === 0 ? (
          <EmptyCard>
            <EmptyState icon={Megaphone} title="Bu filtrede duyuru yok" />
          </EmptyCard>
        ) : (
          rows.map((a) => {
            const names = KOCAELI_DISTRICTS.filter((d) => (a.district_ids ?? []).includes(d.slug)).map((d) => d.name);
            return (
              <AdminCard key={a.id} as="article">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge map={ANNOUNCEMENT_KINDS} value={a.kind} />
                      {a.is_demo ? <DemoBadge /> : null}
                      {a.source_label ? <span className="text-xs text-muted-foreground">Kaynak: {a.source_label}</span> : null}
                    </div>
                    <h2 className="mt-1.5 font-bold break-words">{a.title}</h2>
                    {a.body ? <p className="mt-1 text-sm leading-relaxed whitespace-pre-line text-muted-foreground">{a.body}</p> : null}
                    <p className="mt-2 text-xs text-muted-foreground">
                      {formatDateTime(a.starts_at)} {a.ends_at ? `- ${formatDateTime(a.ends_at)}` : "· bitiş yok"} ·{" "}
                      {names.length ? `${names.slice(0, 6).join(", ")}${names.length > 6 ? ` +${names.length - 6}` : ""}` : "Tüm Kocaeli"}
                    </p>
                  </div>
                  <AnnouncementDialog
                    value={a}
                    trigger={
                      <Button variant="outline" size="sm">
                        <Pencil /> Düzenle
                      </Button>
                    }
                  />
                </div>
              </AdminCard>
            );
          })
        )}
      </div>
    </>
  );
}
