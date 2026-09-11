import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, ClipboardList, Plus } from "lucide-react";
import { ProfileHeaderLink, ProfilePageHeader } from "@/components/shared/profile-page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireAuth } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/core/format";
import { routes } from "@/core/routes";
import { StatusBadge } from "@/features/services/components/bits";
import { ServiceIconBubble } from "@/features/services/components/service-icon";
import { isRequestOpen, requestStatusMeta } from "@/features/services/labels";
import type { RequestStatus } from "@/features/services/types";
import { neighbourhoodLabel } from "@/features/services/util";

export const metadata: Metadata = { title: "Taleplerim", robots: { index: false } };

type Row = {
  id: string;
  public_code: string;
  status: RequestStatus;
  accepted_count: number;
  max_providers: number;
  /** Set when a next wave found no new firm (same "Firma aranıyor" state as /talep/[code]). */
  stalled_at: string | null;
  created_at: string;
  categoryName: string;
  categoryIcon: string | null;
  neighbourhoodName: string | null;
};

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

function RequestCard({ row }: { row: Row }) {
  const status = requestStatusMeta(row.status, row.accepted_count, !!row.stalled_at);
  const open = isRequestOpen(row.status);
  return (
    <Link
      href={routes.services.requestDetail(row.public_code)}
      className="flex items-start gap-3 rounded-2xl bg-card p-4 transition-transform outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.99]"
    >
      <ServiceIconBubble name={row.categoryIcon} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-bold">{row.categoryName}</p>
        <p className="truncate text-xs text-muted-foreground">
          {formatDate(row.created_at, { month: "long" })} · {neighbourhoodLabel(row.neighbourhoodName)}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StatusBadge label={status.label} tone={status.tone} />
          {open && row.status !== "admin_review" ? (
            <span className="text-xs font-medium text-muted-foreground">
              {row.accepted_count}/{row.max_providers} firma ilgilendi
            </span>
          ) : null}
        </div>
      </div>
      <ChevronRight className="mt-1 size-5 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}

/** G5: the customer's service requests (Açık / Kapanan). */
export default async function MyRequestsPage() {
  const user = await requireAuth(routes.profile.requests());
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("service_requests")
    .select("id,public_code,status,accepted_count,max_providers,stalled_at,created_at,service_categories(name,icon),neighbourhoods(name)")
    .eq("customer_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);

  const rows: Row[] = (data ?? []).map((r) => {
    const cat = one(r.service_categories as { name: string; icon: string | null } | { name: string; icon: string | null }[] | null);
    const nb = one(r.neighbourhoods as { name: string } | { name: string }[] | null);
    return {
      id: r.id,
      public_code: r.public_code,
      status: r.status as RequestStatus,
      accepted_count: r.accepted_count,
      max_providers: r.max_providers,
      stalled_at: r.stalled_at,
      created_at: r.created_at,
      categoryName: cat?.name ?? "Hizmet talebi",
      categoryIcon: cat?.icon ?? null,
      neighbourhoodName: nb?.name ?? null,
    };
  });
  const openRows = rows.filter((r) => isRequestOpen(r.status));
  const closedRows = rows.filter((r) => !isRequestOpen(r.status));

  return (
    <>
      <ProfilePageHeader
        title="Taleplerim"
        backHref={routes.profile.root()}
        actions={
          rows.length ? (
            <ProfileHeaderLink href={routes.services.root()} label="Yeni talep">
              <Plus className="size-5" strokeWidth={2} aria-hidden />
            </ProfileHeaderLink>
          ) : null
        }
      />
      <div className="px-4 pt-4 pb-nav">
        {rows.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="Henüz hizmet talebin yok"
            description="Birkaç soruyu cevapla, Gebze'deki uygun firmalar seninle ilgilensin. Ücretsiz."
            actionLabel="Hizmet talebi oluştur"
            actionHref={routes.services.root()}
          />
        ) : (
          <Tabs defaultValue={openRows.length || !closedRows.length ? "acik" : "kapanan"} className="gap-4">
            <TabsList className="grid h-11 w-full grid-cols-2 group-data-horizontal/tabs:h-11">
              <TabsTrigger value="acik" className="text-[15px] font-semibold">
                Açık ({openRows.length})
              </TabsTrigger>
              <TabsTrigger value="kapanan" className="text-[15px] font-semibold">
                Kapanan ({closedRows.length})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="acik">
              {openRows.length ? (
                <ul className="flex flex-col gap-3">
                  {openRows.map((r) => (
                    <li key={r.id}>
                      <RequestCard row={r} />
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  compact
                  icon={ClipboardList}
                  title="Açık talebin yok"
                  description="Yeni bir ihtiyacın olduğunda birkaç soruda talep oluşturabilirsin."
                  actionLabel="Hizmet talebi oluştur"
                  actionHref={routes.services.root()}
                />
              )}
            </TabsContent>
            <TabsContent value="kapanan">
              {closedRows.length ? (
                <ul className="flex flex-col gap-3">
                  {closedRows.map((r) => (
                    <li key={r.id}>
                      <RequestCard row={r} />
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState compact icon={ClipboardList} title="Kapanan talebin yok" description="Kapattığın ya da süresi dolan talepler burada görünür." />
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </>
  );
}
