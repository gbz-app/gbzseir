import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Activity,
  ChevronLeft,
  Clock,
  Eye,
  Image as ImageIcon,
  LifeBuoy,
  LogIn,
  MousePointerClick,
  Pencil,
  Phone,
  Shield,
  ShieldAlert,
  Star,
  Store,
  Tag,
  Ticket,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { requireAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-page";
import { DemoBadge } from "@/components/shared/badges";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatNumber, formatPhoneTR, formatRelativeTime, initials } from "@/core/format";
import { telHref } from "@/core/phone";
import { routes, withQuery } from "@/core/routes";
import { publicUrl } from "@/config/app-mode";
import { AdminCard, InfoList, InfoRow, StatTile, StatusBadge } from "@/features/admin/components/admin-ui";
import { HBarList, formatDuration } from "@/features/admin/components/charts";
import { UserActions } from "@/features/admin/components/user-actions";
import { BUSINESS_STATUS, PROFILE_STATUS } from "@/features/admin/lib/labels";
import { DEVICE_LABELS, pathLabel } from "@/features/admin/lib/analytics-types";

export const metadata: Metadata = { title: "Kullanıcı" };

type Overview = {
  profile: {
    id: string;
    full_name: string | null;
    phone: string | null;
    email: string | null;
    avatar_url: string | null;
    role: string;
    status: string;
    trusted_publisher: boolean;
    marketing_consent: boolean;
    onboarded: boolean;
    is_demo: boolean;
    created_at: string;
    updated_at: string;
    kvkk_accepted_at: string | null;
    /** legal_texts version (kvkk) accepted at kvkk_accepted_at; null for older acceptances. */
    kvkk_version: string | null;
    neighbourhood: string | null;
    last_sign_in_at: string | null;
  };
  counts: Record<"listings" | "listings_active" | "reviews" | "requests" | "favorites" | "reports_made" | "reports_against" | "support_messages", number>;
  businesses: Array<{ id: string; name: string; slug: string; status: string; vertical: string | null }>;
  usage: { sessions: number; page_views: number; total_s: number; avg_s: number; last_seen_at: string | null; devices: Record<string, number> };
  sessions: Array<{ id: string; started_at: string; last_seen_at: string; page_views: number; device: string | null; os: string | null; browser: string | null; standalone: boolean }>;
  page_views: Array<{ path: string; at: string; duration_s: number | null }>;
  top_pages: Array<{ path: string; views: number }>;
  audit: Array<{ at: string; action: string; summary: string; actor: string | null; details: Record<string, unknown> }>;
};

const ACTION_ICONS: Array<[string, LucideIcon]> = [
  ["auth.login", LogIn],
  // Sign-in blocked / unblocked (admin_set_user_status).
  ["profile.signin", ShieldAlert],
  ["profile.avatar", ImageIcon],
  ["profile.phone", Phone],
  ["profile.status", ShieldAlert],
  ["profile.role", Shield],
  ["profile.", Pencil],
  ["business.", Store],
  ["listing.", Tag],
  ["review.", Star],
  ["support.", LifeBuoy],
  ["event.", Ticket],
  ["finance.", Wallet],
];
const iconFor = (action: string): LucideIcon => ACTION_ICONS.find(([p]) => action.startsWith(p))?.[1] ?? Activity;

type Props = { params: Promise<{ id: string }> };

/** Kullanıcı ayrıntısı: profil, hesap hareketleri (denetim kaydı), gezdiği sayfalar, oturumlar, yönetim işlemleri. */
export default async function AdminUserPage({ params }: Props) {
  const { user: me } = await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_user_overview", { p_user: id });
  if (error || !data) notFound();
  const o = data as unknown as Overview;
  const p = o.profile;

  return (
    <>
      <Link href={routes.admin.users()} className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-primary">
        <ChevronLeft className="size-4" aria-hidden /> Kullanıcılar
      </Link>
      <AdminPageHeader title={p.full_name || "İsimsiz kullanıcı"} description={`Katıldı ${formatDateTime(p.created_at)}`} />

      <div className="grid gap-4 lg:grid-cols-3">
        <AdminCard className="lg:col-span-2">
          <div className="flex flex-wrap items-start gap-4">
            <Avatar className="size-20">
              {p.avatar_url ? <AvatarImage src={p.avatar_url} alt="" /> : null}
              <AvatarFallback className="bg-brand-soft text-xl font-semibold text-primary">{initials(p.full_name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusBadge map={PROFILE_STATUS} value={p.status} />
                {p.role === "admin" ? <Badge variant="info">Yönetici</Badge> : null}
                {p.trusted_publisher ? <Badge variant="success">Güvenilir yayıncı</Badge> : null}
                {p.is_demo ? <DemoBadge /> : null}
              </div>
              <InfoList className="mt-3">
                <InfoRow label="Telefon">
                  {p.phone ? (
                    <a className="text-primary hover:underline" href={telHref(p.phone)}>
                      {formatPhoneTR(p.phone)}
                    </a>
                  ) : (
                    "-"
                  )}
                </InfoRow>
                <InfoRow label="E-posta">{p.email ?? "-"}</InfoRow>
                <InfoRow label="Mahalle">{p.neighbourhood ?? "-"}</InfoRow>
                <InfoRow label="Son giriş">{p.last_sign_in_at ? formatDateTime(p.last_sign_in_at) : "-"}</InfoRow>
                <InfoRow label="Son görülme">{o.usage.last_seen_at ? formatRelativeTime(o.usage.last_seen_at) : "Uygulamada görülmedi"}</InfoRow>
                <InfoRow label="KVKK onayı">
                  {p.kvkk_accepted_at ? `${formatDateTime(p.kvkk_accepted_at)}${p.kvkk_version ? ` · sürüm ${p.kvkk_version}` : ""}` : "Yok"}
                </InfoRow>
                <InfoRow label="Ticari ileti">{p.marketing_consent ? "İzin verdi" : "İzin yok"}</InfoRow>
              </InfoList>
            </div>
          </div>
          <div className="mt-4 border-t pt-4">
            <UserActions userId={p.id} status={p.status} trusted={p.trusted_publisher} locked={p.role === "admin" || p.id === me.id} />
          </div>
        </AdminCard>

        <AdminCard title="İçerikler">
          <InfoList>
            <InfoRow label="İlan">{`${formatNumber(o.counts.listings)} (${formatNumber(o.counts.listings_active)} yayında)`}</InfoRow>
            <InfoRow label="Hizmet talebi">{formatNumber(o.counts.requests)}</InfoRow>
            <InfoRow label="Yorum">{formatNumber(o.counts.reviews)}</InfoRow>
            <InfoRow label="Favori">{formatNumber(o.counts.favorites)}</InfoRow>
            <InfoRow label="Destek mesajı">{formatNumber(o.counts.support_messages)}</InfoRow>
            <InfoRow label="Yaptığı şikayet">{formatNumber(o.counts.reports_made)}</InfoRow>
            <InfoRow label="Hakkında şikayet">
              <span className={o.counts.reports_against ? "font-bold text-destructive" : undefined}>{formatNumber(o.counts.reports_against)}</span>
            </InfoRow>
          </InfoList>
          {o.businesses.length ? (
            <div className="mt-4 border-t pt-3">
              <p className="mb-2 text-sm font-semibold">İşletmeleri</p>
              <ul className="flex flex-col gap-2">
                {o.businesses.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-2 text-sm">
                    {b.status === "approved" ? (
                      <a href={publicUrl(routes.businesses.detail(b.slug))} target="_blank" rel="noopener noreferrer" className="truncate text-primary hover:underline">
                        {b.name}
                      </a>
                    ) : (
                      <Link href={withQuery(routes.admin.businesses(), { q: b.name })} className="truncate text-primary hover:underline">
                        {b.name}
                      </Link>
                    )}
                    <StatusBadge map={BUSINESS_STATUS} value={b.status} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </AdminCard>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Oturum" value={o.usage.sessions} icon={MousePointerClick} />
        <StatTile label="Sayfa görüntüleme" value={o.usage.page_views} icon={Eye} tone="info" />
        <StatTile label="Toplam süre" value={formatDuration(o.usage.total_s)} icon={Clock} />
        <StatTile label="Ort. oturum" value={formatDuration(o.usage.avg_s)} icon={Activity} tone="success" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <AdminCard title="Hesap hareketleri" description="Giriş, giriş engeli, profil fotoğrafı, ad, telefon, durum değişiklikleri ve içerik işlemleri">
          {o.audit.length ? (
            <ol className="relative flex flex-col gap-4 border-l pl-5">
              {o.audit.map((a, i) => {
                const Icon = iconFor(a.action);
                const byAdmin = a.actor && a.actor !== p.id;
                return (
                  <li key={`${a.at}-${i}`} className="relative">
                    <span className="absolute top-0 -left-[1.95rem] flex size-7 items-center justify-center rounded-full bg-card text-primary ring-1 ring-foreground/10">
                      <Icon className="size-3.5" aria-hidden />
                    </span>
                    <p className="text-sm font-medium">{a.summary}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(a.at)}
                      {byAdmin ? " · yönetici tarafından" : ""}
                    </p>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">Henüz kayıt yok.</p>
          )}
        </AdminCard>

        <div className="flex flex-col gap-4">
          <AdminCard title="En çok baktığı sayfalar">
            <HBarList items={o.top_pages.map((t) => ({ label: pathLabel(t.path), value: t.views }))} />
          </AdminCard>
          <AdminCard title="Son gezdiği sayfalar">
            {o.page_views.length ? (
              <ul className="divide-y text-sm">
                {o.page_views.slice(0, 30).map((v, i) => (
                  <li key={`${v.at}-${i}`} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0 truncate">{pathLabel(v.path)}</span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {v.duration_s != null ? `${formatDuration(v.duration_s)} · ` : ""}
                      {formatRelativeTime(v.at)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Kayıtlı sayfa görüntüleme yok.</p>
            )}
          </AdminCard>
          <AdminCard title="Oturumlar">
            {o.sessions.length ? (
              <ul className="divide-y text-sm">
                {o.sessions.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      {formatDateTime(s.started_at)}
                      <span className="text-muted-foreground">
                        {" "}
                        · {DEVICE_LABELS[s.device ?? "bilinmiyor"] ?? s.device} · {s.os ?? "?"} · {s.browser ?? "?"}
                        {s.standalone ? " · uygulama" : ""}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {s.page_views} sayfa · {formatDuration((Date.parse(s.last_seen_at) - Date.parse(s.started_at)) / 1000)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Oturum yok.</p>
            )}
            {Object.keys(o.usage.devices).length ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Cihazlar: {Object.entries(o.usage.devices).map(([k, n]) => `${DEVICE_LABELS[k] ?? k} ${n}`).join(", ")}
              </p>
            ) : null}
          </AdminCard>
        </div>
      </div>

      {p.phone ? (
        <div className="mt-6">
          <Button asChild variant="outline">
            <a href={telHref(p.phone)}>
              <Phone /> Kullanıcıyı ara
            </a>
          </Button>
        </div>
      ) : null}
    </>
  );
}
