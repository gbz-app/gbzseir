import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, ShieldCheck, Star, TriangleAlert } from "lucide-react";
import { requireAdmin } from "@/lib/auth/server";
import { createClient, type ServerSupabase } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-page";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { routes, withQuery } from "@/core/routes";
import { publicUrl } from "@/config/app-mode";
import { formatDateTime, formatPhoneTR, formatPrice, formatRelativeTime, truncate } from "@/core/format";
import { AdminCard, AdminPagination, AdminThumb, EmptyCard, FilterTabs, StatusBadge } from "@/features/admin/components/admin-ui";
import { ReportActions } from "@/features/admin/components/report-actions";
import { eventWhenShort } from "@/features/events/format";
import {
  BUSINESS_STATUS,
  EVENT_STATUS,
  LISTING_STATUS,
  PROFILE_STATUS,
  REPORT_REASONS,
  REPORT_STATUS,
  REPORT_TARGETS,
  type LabelMap,
} from "@/features/admin/lib/labels";
import { oneOf, pageParam, pageRange } from "@/features/admin/lib/params";

export const metadata: Metadata = { title: "Şikayetler" };

const PAGE_SIZE = 20;
const STATUSES = ["open", "resolved", "dismissed", "tumu"] as const;
type StatusTab = (typeof STATUSES)[number];
const TARGETS = ["tumu", "listing", "business", "review", "user", "event"] as const;

type Preview = {
  title: string;
  subtitle?: string;
  statusMap?: LabelMap;
  status?: string;
  href?: string;
  external?: boolean;
  thumb?: string | null;
  isAdmin?: boolean;
};

async function loadPreviews(supabase: ServerSupabase, rows: Array<{ target_type: string; target_id: string }>): Promise<Map<string, Preview>> {
  const ids = (t: string) => [...new Set(rows.filter((r) => r.target_type === t).map((r) => r.target_id))];
  const map = new Map<string, Preview>();
  const [listings, businesses, reviews, users, events] = await Promise.all([
    ids("listing").length
      ? supabase
          .from("listings")
          .select("id,title,type,status,price_try,owner:profiles!listings_owner_id_fkey(full_name),listing_media(thumb_url,url,sort)")
          .in("id", ids("listing"))
      : null,
    ids("business").length ? supabase.from("businesses").select("id,name,slug,status,category_label,phone").in("id", ids("business")) : null,
    ids("review").length
      ? supabase
          .from("reviews")
          .select("id,rating,comment,created_at,businesses(name,slug),author:profiles!reviews_author_id_fkey(full_name)")
          .in("id", ids("review"))
      : null,
    ids("user").length ? supabase.from("profiles").select("id,full_name,phone,status,role,created_at").in("id", ids("user")) : null,
    ids("event").length
      ? supabase.from("events").select("id,slug,title,status,cover_url,starts_at,ends_at,admin_hidden,organizer_name,businesses(name)").in("id", ids("event"))
      : null,
  ]);
  for (const l of listings?.data ?? []) {
    const media = [...(l.listing_media ?? [])].sort((a, b) => a.sort - b.sort)[0];
    const isPublic = ["active", "sold", "filled"].includes(l.status);
    map.set(`listing:${l.id}`, {
      title: l.title,
      subtitle: `${l.type === "job" ? "İş ilanı" : formatPrice(l.price_try)} · ${l.owner?.full_name ?? "İsimsiz"}`,
      statusMap: LISTING_STATUS,
      status: l.status,
      href: isPublic ? publicUrl(l.type === "job" ? routes.listings.job(l.id) : routes.listings.classified(l.id)) : withQuery(routes.admin.listings(), { durum: "tumu", q: l.title.slice(0, 40) }),
      external: isPublic,
      thumb: media?.thumb_url ?? media?.url ?? null,
    });
  }
  for (const b of businesses?.data ?? []) {
    map.set(`business:${b.id}`, {
      title: b.name,
      subtitle: [b.category_label, formatPhoneTR(b.phone)].filter(Boolean).join(" · "),
      statusMap: BUSINESS_STATUS,
      status: b.status,
      href: b.status === "approved" ? publicUrl(routes.businesses.detail(b.slug)) : withQuery(routes.admin.businesses(), { q: b.name }),
      external: b.status === "approved",
    });
  }
  for (const r of reviews?.data ?? []) {
    map.set(`review:${r.id}`, {
      title: `${r.rating}/5 · ${truncate(r.comment ?? "Yorum metni yok", 140)}`,
      subtitle: `${r.author?.full_name ?? "Kullanıcı"} → ${r.businesses?.name ?? "İşletme"}`,
      href: r.businesses ? publicUrl(routes.businesses.detail(r.businesses.slug)) : undefined,
      external: true,
    });
  }
  for (const u of users?.data ?? []) {
    map.set(`user:${u.id}`, {
      title: u.full_name ?? "İsimsiz kullanıcı",
      subtitle: `${formatPhoneTR(u.phone)}${u.role === "admin" ? " · Yönetici" : ""}`,
      statusMap: PROFILE_STATUS,
      status: u.status,
      href: withQuery(routes.admin.users(), { q: (u.phone ?? "").replace(/^\+90/, "") || u.full_name }),
      isAdmin: u.role === "admin",
    });
  }
  type EventPreviewRow = {
    id: string;
    slug: string | null;
    title: string;
    status: string;
    cover_url: string | null;
    starts_at: string;
    ends_at: string | null;
    admin_hidden: boolean;
    organizer_name: string | null;
    businesses: { name: string } | null;
  };
  for (const e of (events?.data ?? []) as unknown as EventPreviewRow[]) {
    const isPublic = e.status === "published" && !e.admin_hidden && !!e.slug;
    map.set(`event:${e.id}`, {
      title: e.title,
      subtitle: `${eventWhenShort(e.starts_at, e.ends_at)} · ${e.businesses?.name ?? e.organizer_name ?? "Şehir etkinliği"}`,
      statusMap: EVENT_STATUS,
      status: e.status,
      href: isPublic && e.slug ? publicUrl(routes.events.detail(e.slug)) : withQuery(routes.admin.events(), { sekme: "tumu" }),
      external: isPublic,
      thumb: e.cover_url,
    });
  }
  return map;
}

export default async function AdminReportsPage({ searchParams }: PageProps<"/admin/sikayetler">) {
  await requireAdmin();
  const sp = await searchParams;
  const status = oneOf<StatusTab>(sp.durum, STATUSES, "open");
  const target = oneOf(sp.tur, TARGETS, "tumu");
  const page = pageParam(sp.sayfa);
  const supabase = await createClient();

  let query = supabase.from("reports").select("*, reporter:profiles!reports_reporter_id_fkey(full_name,phone), report_notes(note)", { count: "exact" });
  if (status !== "tumu") query = query.eq("status", status);
  if (target !== "tumu") query = query.eq("target_type", target);
  const { from, to } = pageRange(page, PAGE_SIZE);
  query = query.order("created_at", { ascending: status === "open" }).range(from, to);

  const countFor = async (s: StatusTab) => {
    let c = supabase.from("reports").select("id", { count: "exact", head: true });
    if (s !== "tumu") c = c.eq("status", s);
    if (target !== "tumu") c = c.eq("target_type", target);
    const { count } = await c;
    return count ?? 0;
  };

  const [{ data, count, error }, ...counts] = await Promise.all([query, ...STATUSES.map(countFor)]);
  const rows = data ?? [];
  const previews = await loadPreviews(supabase, rows);

  // Open reports per target (to show "3 açık şikayet").
  const targetIds = [...new Set(rows.map((r) => r.target_id))];
  const openCounts = new Map<string, number>();
  if (targetIds.length) {
    const { data: open } = await supabase.from("reports").select("target_type,target_id").eq("status", "open").in("target_id", targetIds);
    for (const o of open ?? []) openCounts.set(`${o.target_type}:${o.target_id}`, (openCounts.get(`${o.target_type}:${o.target_id}`) ?? 0) + 1);
  }

  const baseQuery = { durum: status === "open" ? undefined : status, tur: target === "tumu" ? undefined : target };
  const statusLabel: Record<StatusTab, string> = { open: "Açık", resolved: "Çözülen", dismissed: "Yoksayılan", tumu: "Tümü" };

  return (
    <>
      <AdminPageHeader title="Şikayetler" description="Hedef: her şikayete 24 saat içinde yanıt. En eski açık şikayet en üstte." />
      <div className="flex flex-col gap-3">
        <FilterTabs
          ariaLabel="Şikayet durumu"
          items={STATUSES.map((s, i) => ({
            label: statusLabel[s],
            count: counts[i],
            active: s === status,
            href: withQuery(routes.admin.reports(), { ...baseQuery, durum: s === "open" ? undefined : s }),
          }))}
        />
        <FilterTabs
          ariaLabel="Şikayet konusu"
          items={TARGETS.map((t) => ({
            label: t === "tumu" ? "Tüm konular" : REPORT_TARGETS[t],
            active: t === target,
            href: withQuery(routes.admin.reports(), { ...baseQuery, tur: t === "tumu" ? undefined : t }),
          }))}
        />
      </div>

      <div className="mt-5 flex flex-col gap-4">
        {error ? (
          <EmptyCard>
            <EmptyState icon={TriangleAlert} tone="warning" title="Şikayetler yüklenemedi" description="Sayfayı yenileyip tekrar dene." />
          </EmptyCard>
        ) : rows.length === 0 ? (
          <EmptyCard>
            <EmptyState
              icon={ShieldCheck}
              title={status === "open" ? "Açık şikayet yok" : "Bu filtrede şikayet yok"}
              description={status === "open" ? "Kullanıcılar bir içeriği bildirdiğinde burada görünür." : undefined}
            />
          </EmptyCard>
        ) : (
          rows.map((r) => {
            const key = `${r.target_type}:${r.target_id}`;
            const p = previews.get(key);
            const openCount = openCounts.get(key) ?? 0;
            return (
              <AdminCard key={r.id} as="article">
                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusBadge map={REPORT_STATUS} value={r.status} />
                  <Badge variant="secondary" className="h-6 px-2.5">
                    {REPORT_TARGETS[r.target_type] ?? r.target_type}
                  </Badge>
                  <Badge variant="destructive" className="h-6 px-2.5">
                    {REPORT_REASONS[r.reason] ?? r.reason}
                  </Badge>
                  {openCount > 1 ? (
                    <Badge variant="warning" className="h-6 px-2.5">
                      Bu içerik için {openCount} açık şikayet
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {/* No reporter row = the account was deleted (reporter_id -> null). */}
                  {r.reporter ? `${r.reporter.full_name ?? "İsimsiz kullanıcı"} (${formatPhoneTR(r.reporter.phone)})` : "Silinmiş hesap"} ·{" "}
                  <time dateTime={r.created_at} title={formatDateTime(r.created_at)}>
                    {formatRelativeTime(r.created_at)}
                  </time>
                </p>
                {r.detail ? <p className="mt-2 rounded-xl bg-muted/50 p-3 text-sm leading-relaxed break-words whitespace-pre-line">{r.detail}</p> : null}

                <div className="mt-3 flex items-center gap-3 rounded-xl border p-3">
                  {r.target_type === "listing" || r.target_type === "event" ? <AdminThumb src={p?.thumb} size={56} /> : r.target_type === "review" ? <Star className="size-6 shrink-0 text-highlight" aria-hidden /> : null}
                  <div className="min-w-0 flex-1">
                    {p ? (
                      <>
                        <p className="font-semibold break-words">{p.title}</p>
                        {p.subtitle ? <p className="text-sm text-muted-foreground">{p.subtitle}</p> : null}
                        {p.statusMap && p.status ? <StatusBadge map={p.statusMap} value={p.status} className="mt-1.5" /> : null}
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">Şikayet edilen içerik artık yok (silinmiş olabilir).</p>
                    )}
                  </div>
                  {p?.href && p.external ? (
                    // Public app page (a separate site): plain link in a new tab.
                    <a
                      href={p.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl hover:bg-muted"
                      aria-label="İçeriği aç"
                    >
                      <ExternalLink className="size-5" aria-hidden />
                    </a>
                  ) : p?.href ? (
                    <Link href={p.href} className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl hover:bg-muted" aria-label="İçeriği aç">
                      <ExternalLink className="size-5" aria-hidden />
                    </Link>
                  ) : null}
                </div>

                {r.report_notes?.note ? (
                  <p className="mt-3 text-sm">
                    <span className="font-semibold">Yönetici notu:</span> {r.report_notes.note}
                  </p>
                ) : null}
                {r.resolved_at ? <p className="mt-1 text-xs text-muted-foreground">Kapatıldı: {formatDateTime(r.resolved_at)}</p> : null}

                <div className="mt-4 border-t pt-4">
                  <ReportActions reportId={r.id} status={r.status} targetType={r.target_type} targetExists={!!p} targetIsAdmin={p?.isAdmin} />
                </div>
              </AdminCard>
            );
          })
        )}
      </div>
      <AdminPagination path={routes.admin.reports()} query={baseQuery} page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
    </>
  );
}
