import type { Metadata } from "next";
import Link from "next/link";
import { Inbox, Mail, Phone, Store, TriangleAlert, UserRound } from "lucide-react";
import { requireAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-page";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, formatPhoneTR, formatRelativeTime } from "@/core/format";
import { telHref } from "@/core/phone";
import { routes } from "@/core/routes";
import { AdminCard, AdminPagination, EmptyCard, FilterTabs, StatusBadge } from "@/features/admin/components/admin-ui";
import { SupportActions } from "@/features/admin/components/support-actions";
import { SUPPORT_STATUS, SUPPORT_TOPIC } from "@/features/admin/lib/labels";
import { oneOf, pageParam, pageRange } from "@/features/admin/lib/params";
import { MESSAGE_TOPICS, TOPIC_INFO, type MessageTopic } from "@/features/support/topics";

export const metadata: Metadata = { title: "Destek mesajları" };

const PAGE_SIZE = 20;
const STATUSES = ["new", "in_progress", "resolved", "spam", "tumu"] as const;
type StatusFilter = (typeof STATUSES)[number];
const TOPICS = ["tumu", ...MESSAGE_TOPICS] as const;
type TopicFilter = (typeof TOPICS)[number];

type Row = {
  id: string;
  topic: MessageTopic;
  subject: string | null;
  message: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  business_name: string | null;
  status: string;
  support_notes: { note: string } | null;
  page_path: string | null;
  user_agent: string | null;
  created_at: string;
  resolved_at: string | null;
  user_id: string | null;
  user: { id: string; full_name: string | null } | null;
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Destek gelen kutusu: şikayet, teknik destek, reklam, işletme, öneri mesajları ve yer bilgisi düzeltmeleri. */
export default async function AdminSupportPage({ searchParams }: Props) {
  await requireAdmin();
  const sp = await searchParams;
  const status = oneOf<StatusFilter>(sp.durum, STATUSES, "new");
  const topic = oneOf<TopicFilter>(sp.konu, TOPICS, "tumu");
  const page = pageParam(sp.sayfa);
  const supabase = await createClient();

  let query = supabase
    .from("contact_messages")
    .select("*, user:profiles!contact_messages_user_id_fkey(id,full_name), support_notes(note)", { count: "exact" });
  if (status !== "tumu") query = query.eq("status", status);
  if (topic !== "tumu") query = query.eq("topic", topic);
  const { from, to } = pageRange(page, PAGE_SIZE);
  const [{ data, count, error }, ...counts] = await Promise.all([
    query.order("created_at", { ascending: status === "new" }).range(from, to),
    ...(["new", "in_progress", "resolved", "spam"] as const).map((s) => supabase.from("contact_messages").select("id", { count: "exact", head: true }).eq("status", s)),
  ]);
  const statusCount: Record<string, number> = { new: counts[0].count ?? 0, in_progress: counts[1].count ?? 0, resolved: counts[2].count ?? 0, spam: counts[3].count ?? 0 };
  const rows = (data ?? []) as unknown as Row[];
  const baseQuery = { durum: status === "new" ? undefined : status, konu: topic === "tumu" ? undefined : topic };

  return (
    <>
      <AdminPageHeader title="Destek mesajları" description="Şikayet, teknik destek, reklam ve iş birliği talepleri, yer bilgisi düzeltmeleri. Kullanıcı kendi mesajının durumunu Yardım sayfasında görür; iç notlar gizlidir." />
      <div className="flex flex-col gap-3">
        <FilterTabs
          ariaLabel="Durum"
          items={STATUSES.map((s) => ({
            label: s === "tumu" ? "Tümü" : SUPPORT_STATUS[s].label,
            count: s === "tumu" ? null : statusCount[s],
            active: s === status,
            href: routes.admin.support({ ...baseQuery, durum: s === "new" ? undefined : s }),
          }))}
        />
        <FilterTabs
          ariaLabel="Konu"
          items={TOPICS.map((t) => ({ label: t === "tumu" ? "Tüm konular" : SUPPORT_TOPIC[t], active: t === topic, href: routes.admin.support({ ...baseQuery, konu: t === "tumu" ? undefined : t }) }))}
        />
      </div>

      <div className="mt-5 flex flex-col gap-4">
        {error ? (
          <EmptyCard>
            <EmptyState icon={TriangleAlert} tone="warning" title="Mesajlar yüklenemedi" description="Sayfayı yenileyip tekrar dene." />
          </EmptyCard>
        ) : rows.length === 0 ? (
          <EmptyCard>
            <EmptyState icon={Inbox} title="Bu filtrede mesaj yok" />
          </EmptyCard>
        ) : (
          rows.map((m) => {
            const info = TOPIC_INFO[m.topic] ?? TOPIC_INFO.diger;
            return (
              <AdminCard key={m.id} as="article">
                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusBadge map={SUPPORT_STATUS} value={m.status} />
                  <Badge variant="secondary" className="gap-1">
                    <info.icon className="size-3.5" aria-hidden /> {SUPPORT_TOPIC[m.topic] ?? info.label}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    #{m.id.slice(0, 8).toUpperCase()} · {formatRelativeTime(m.created_at)}
                  </span>
                </div>
                {m.subject ? <h2 className="mt-2 text-lg leading-snug font-bold break-words">{m.subject}</h2> : null}
                <p className="mt-2 text-[15px] leading-relaxed break-words whitespace-pre-line">{m.message}</p>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
                  {m.user ? (
                    <Link href={routes.admin.user(m.user.id)} className="inline-flex items-center gap-1.5 text-primary hover:underline">
                      <UserRound className="size-4" aria-hidden /> {m.user.full_name ?? m.name ?? "Üye"}
                    </Link>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <UserRound className="size-4" aria-hidden /> {m.name ?? "Misafir"}
                    </span>
                  )}
                  {m.phone ? (
                    <a href={telHref(m.phone)} className="inline-flex items-center gap-1.5 text-primary hover:underline">
                      <Phone className="size-4" aria-hidden /> {formatPhoneTR(m.phone)}
                    </a>
                  ) : null}
                  {m.email ? (
                    <a href={`mailto:${m.email}`} className="inline-flex items-center gap-1.5 text-primary hover:underline">
                      <Mail className="size-4" aria-hidden /> {m.email}
                    </a>
                  ) : null}
                  {m.business_name ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Store className="size-4 text-muted-foreground" aria-hidden /> {m.business_name}
                    </span>
                  ) : null}
                </div>
                {m.page_path || m.user_agent ? (
                  <p className="mt-2 text-xs break-all text-muted-foreground">
                    {m.page_path ? `Geldiği sayfa: ${m.page_path}` : ""}
                    {m.user_agent ? ` · Cihaz: ${m.user_agent}` : ""}
                  </p>
                ) : null}
                {m.resolved_at ? <p className="mt-1 text-xs text-muted-foreground">Kapanış: {formatDateTime(m.resolved_at)}</p> : null}
                <div className="mt-4 border-t pt-4">
                  <SupportActions id={m.id} status={m.status} note={m.support_notes?.note ?? null} />
                </div>
              </AdminCard>
            );
          })
        )}
      </div>
      <AdminPagination path={routes.admin.support()} query={baseQuery} page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
    </>
  );
}
