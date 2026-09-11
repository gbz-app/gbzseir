import type { Metadata } from "next";
import { KeyRound, ShieldCheck, TriangleAlert } from "lucide-react";
import { requireAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-page";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDate, formatNumber, formatRelativeTime } from "@/core/format";
import { routes, withQuery } from "@/core/routes";
import { FilterTabs } from "@/features/admin/components/admin-ui";
import { AiSettingsForm, type AiSettingsValues } from "@/features/ai/admin/ai-settings-form";
import { AI_MODELS, AI_PROVIDERS, isAiModelId, isAiProvider, resolveModelId, type AiProvider } from "@/features/ai/lib/models";
import { callRpc } from "@/features/ai/server/rpc";

export const metadata: Metadata = { title: "GebzemAI" };

type DayRow = { day: string; messages: number; input_tokens: number; output_tokens: number; cost_micro_usd: number; active_users: number };
type Report = {
  from: string;
  to: string;
  days: DayRow[];
  totals: { messages: number; input_tokens: number; output_tokens: number; cost_micro_usd: number; active_users: number };
  today: { messages: number; cost_micro_usd: number; pending: number; budget_micro_usd: number };
  last_24h: { done: number; error: number; aborted: number; lost: number; last_error_at: string | null };
  /** provider: 2026091378_gebzemai_openai.sql (missing before it is applied). */
  settings: { enabled: boolean; provider?: string | null; model: string; daily_messages: number; per_minute: number; daily_budget_usd: number };
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const usd = (micro: number) => {
  const v = (Number(micro) || 0) / 1_000_000;
  return `$${formatNumber(v, v < 1 ? 4 : 2)}`;
};

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-card p-4">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 font-heading text-2xl font-extrabold tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** GebzemAI usage (admin_ai_usage) and settings (admin_set_ai_settings). Metadata only: no conversation text exists. */
export default async function AdminGebzemAiPage({ searchParams }: Props) {
  await requireAdmin(routes.admin.gebzemai());
  const sp = await searchParams;
  const days = sp.gun === "30" ? 30 : 7;
  const supabase = await createClient();
  const { data, error } = await callRpc<Report>(supabase, "admin_ai_usage", { p_days: days });

  const header = <AdminPageHeader title="GebzemAI" description="Yapay zeka asistanının kullanımı, maliyeti ve sınırları. Sohbet metinleri hiçbir yerde saklanmaz." />;
  if (error || !data) {
    return (
      <>
        {header}
        <div className="rounded-2xl bg-card">
          <EmptyState
            icon={TriangleAlert}
            tone="warning"
            title="Kullanım verisi alınamadı"
            description="Veritabanı güncellemeleri (2026091375_gebzemai, 2026091378_gebzemai_openai) uygulanmamış olabilir."
          />
        </div>
      </>
    );
  }

  const s = data.settings;
  // The stored provider; before 2026091378 there is none, so the stored model tells it.
  const provider: AiProvider = isAiProvider(s.provider) ? s.provider : isAiModelId(s.model) ? AI_MODELS[s.model].provider : "openai";
  const initial: AiSettingsValues = {
    enabled: s.enabled,
    provider,
    model: resolveModelId(s.model, provider),
    dailyMessages: s.daily_messages,
    perMinute: s.per_minute,
    dailyBudgetUsd: Number(s.daily_budget_usd),
  };
  const info = AI_PROVIDERS[provider];
  const t = data.totals;
  const today = data.today;
  const budget = Number(today.budget_micro_usd) || 0;
  const usedPct = budget > 0 ? Math.min(100, Math.round((Number(today.cost_micro_usd) / budget) * 100)) : 100;
  const h = data.last_24h;

  return (
    <>
      {header}
      <FilterTabs
        ariaLabel="Dönem"
        className="mb-4"
        items={[
          { label: "Son 7 gün", href: withQuery(routes.admin.gebzemai(), {}), active: days === 7 },
          { label: "Son 30 gün", href: withQuery(routes.admin.gebzemai(), { gun: 30 }), active: days === 30 },
        ]}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Soru" value={formatNumber(Number(t.messages))} hint={`${formatDate(data.from)} - ${formatDate(data.to)}`} />
        <Tile label="Aktif kullanıcı" value={formatNumber(Number(t.active_users))} hint="En az bir soru soran" />
        <Tile label="Token" value={formatNumber(Number(t.input_tokens) + Number(t.output_tokens))} hint={`Giriş ${formatNumber(Number(t.input_tokens))} · Çıkış ${formatNumber(Number(t.output_tokens))}`} />
        <Tile label="Maliyet" value={usd(t.cost_micro_usd)} hint="Tahmini, model fiyatlarıyla" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="min-w-0 rounded-2xl bg-card">
          <h2 className="border-b px-4 py-3 font-heading text-base font-bold">Günlük kullanım</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Gün</th>
                  <th className="px-4 py-2 text-right font-medium">Soru</th>
                  <th className="px-4 py-2 text-right font-medium">Kullanıcı</th>
                  <th className="px-4 py-2 text-right font-medium">Giriş token</th>
                  <th className="px-4 py-2 text-right font-medium">Çıkış token</th>
                  <th className="px-4 py-2 text-right font-medium">Maliyet</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.days.map((d) => (
                  <tr key={d.day} className={d.messages ? undefined : "text-muted-foreground"}>
                    <td className="px-4 py-2 whitespace-nowrap">{formatDate(d.day, { weekday: true })}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatNumber(Number(d.messages))}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatNumber(Number(d.active_users))}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatNumber(Number(d.input_tokens))}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatNumber(Number(d.output_tokens))}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{usd(d.cost_micro_usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="grid content-start gap-4">
          <section className="rounded-2xl bg-card p-4">
            <h2 className="font-heading text-base font-bold">Bugün</h2>
            <p className="mt-1 text-sm">
              {usd(today.cost_micro_usd)} / {usd(budget)} bütçe · {formatNumber(Number(today.messages))} soru
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={`Bütçenin yüzde ${usedPct} kadarı kullanıldı`}>
              <div className={usedPct >= 90 ? "h-full bg-destructive" : "h-full bg-primary"} style={{ width: `${usedPct}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Şu an: {info.label} · {AI_MODELS[initial.model].label}
            </p>
            {Number(today.pending) > 0 ? <p className="mt-1 text-xs text-muted-foreground">Şu an yanıtlanan: {formatNumber(Number(today.pending))}</p> : null}
            <h3 className="mt-4 text-sm font-semibold">Son 24 saat</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Tamamlanan {formatNumber(Number(h.done))} · Hata {formatNumber(Number(h.error))} · Durdurulan {formatNumber(Number(h.aborted))} · Yarım kalan{" "}
              {formatNumber(Number(h.lost))}
            </p>
            {Number(h.error) > 0 ? (
              <p className="mt-2 flex items-start gap-2 rounded-xl bg-highlight-soft p-3 text-xs text-highlight-foreground">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                Son hata {h.last_error_at ? formatRelativeTime(h.last_error_at) : ""}. Hatalar genelde eksik ya da geçersiz anahtar, kota veya servis kesintisinden olur.
              </p>
            ) : null}
          </section>

          <AiSettingsForm initial={initial} />

          <section className="grid gap-3 rounded-2xl bg-card p-4 text-xs leading-relaxed text-muted-foreground">
            <p className="flex items-start gap-2">
              <KeyRound className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              {info.keyEnv} ({info.label}) yalnızca uygulama sitesinin Vercel projesinde tanımlanır; yönetim sitesinde tanımlanmaz ve burada görünmez.
            </p>
            <p className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              Saklanan tek şey sayılardır: soru sayısı, token ve maliyet. Soru ve cevap metinleri kaydedilmez.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
