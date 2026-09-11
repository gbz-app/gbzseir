import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { CalendarDays, TriangleAlert } from "lucide-react";
import { requireAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-page";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dutyDayFor, dutyWindowFor } from "@/core/duty";
import { formatDate, formatDateTime, formatRelativeTime } from "@/core/format";
import { routes } from "@/core/routes";
import { addDaysToKey, istanbulDateKey, istanbulDateTime } from "@/core/time";
import { trCompare } from "@/core/tr";
import { AdminCard, EmptyCard, FilterTabs, InfoList, InfoRow, StatusBadge } from "@/features/admin/components/admin-ui";
import { DutyEditor, type DutyPharmacy } from "@/features/admin/components/duty-editor";
import type { LabelMap } from "@/features/admin/lib/labels";
import { one } from "@/features/admin/lib/params";

export const metadata: Metadata = { title: "Nöbet listesi" };

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Same limit as admin_set_duty. */
const MAX_DAYS_AHEAD = 60;
const QUICK_DAYS = 7;
const RUNS_SHOWN = 8;

const DUTY_MODES: Record<string, { label: string; tone: "success" | "warning" | "secondary"; text: string }> = {
  live: { label: "Canlı", tone: "success", text: "Sitede yalnızca gerçek liste (elle girilen ya da aktarılan) görünür." },
  demo: {
    label: "Örnek veri",
    tone: "warning",
    text: "Sitede örnek liste de görünür ve bütün liste 'Örnek veri' diye etiketlenir. Gerçek listeye geçmek için nöbet listesi verisini Canlı yap.",
  },
  off: { label: "Kapalı", tone: "secondary", text: "Sitede nöbet listesi yerine Eczacı Odası bağlantısı görünür." },
};

const DUTY_SOURCES: Record<string, string> = { manual: "Elle girildi", nosyapi: "NosyAPI", demo: "Örnek veri", none: "Kaynak yok" };

const RUN_STATUS: LabelMap = {
  ok: { label: "Aktarıldı", tone: "success" },
  manual: { label: "Elle kaydedildi", tone: "info" },
  skipped: { label: "Elle girilen korundu", tone: "secondary" },
  empty: { label: "Boş liste", tone: "warning" },
  stale: { label: "Henüz güncel değil", tone: "warning" },
  no_source: { label: "Kaynak yok", tone: "outline" },
  error: { label: "Hata", tone: "destructive" },
};

type Run = {
  id: string;
  created_at: string;
  source: string;
  status: string;
  duty_day: string | null;
  fetched: number;
  matched: number;
  written: number;
  unmatched: unknown;
  message: string | null;
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Midday of a duty day key, for date labels. */
const dayDate = (key: string) => istanbulDateTime(key, "12:00");

function runCounts(r: Run): string | null {
  if (r.status === "manual") return `${r.matched} eczane`;
  if (r.status === "ok" || r.status === "skipped" || r.fetched > 0) return `${r.fetched} geldi · ${r.matched} eşleşti · ${r.written} yazıldı`;
  return null;
}

/**
 * Nöbet listesi: pick a duty day (08:30 -> 08:30) and tick its duty pharmacies. Saved with source 'manual', so the
 * automatic import no longer changes that day. Also shows the list mode and the last import runs.
 */
export default async function AdminDutyPage({ searchParams }: Props) {
  await requireAdmin();
  const sp = await searchParams;
  const today = dutyDayFor(new Date());
  const lastDay = addDaysToKey(today, MAX_DAYS_AHEAD);
  const asked = one(sp.gun);
  const day = asked && DAY_RE.test(asked) && asked >= today && asked <= lastDay ? asked : today;
  const win = dutyWindowFor(day);
  const supabase = await createClient();

  const [pharmacyRes, dayRes, runsRes, modeRes] = await Promise.all([
    supabase.from("poi").select("id,name,phone,neighbourhoods(name)").eq("kind", "pharmacy").eq("hidden", false).order("name").limit(1000),
    supabase.from("pharmacy_duty").select("poi_id,source,fetched_at").eq("duty_start", win.start.toISOString()),
    supabase
      .from("duty_import_runs")
      .select("id,created_at,source,status,duty_day,fetched,matched,written,unmatched,message")
      .order("created_at", { ascending: false })
      .limit(RUNS_SHOWN),
    supabase.from("app_settings").select("value").eq("key", "duty_data_mode").maybeSingle(),
  ]);

  const pharmacies: DutyPharmacy[] = (pharmacyRes.data ?? [])
    .map((p) => {
      const n = p.neighbourhoods as { name: string } | { name: string }[] | null;
      return { id: p.id, name: p.name, phone: p.phone, neighbourhood: Array.isArray(n) ? (n[0]?.name ?? null) : (n?.name ?? null) };
    })
    .sort((a, b) => trCompare(a.name, b.name));
  const known = new Set(pharmacies.map((p) => p.id));
  const dayRows = dayRes.data ?? [];
  const real = dayRows.filter((r) => r.source !== "demo");
  const sampleCount = dayRows.length - real.length;
  const sources = [...new Set(real.map((r) => r.source))];
  const imported = sources.some((s) => s !== "manual");
  let lastUpdate: string | null = null;
  for (const r of real) if (!lastUpdate || new Date(r.fetched_at).getTime() > new Date(lastUpdate).getTime()) lastUpdate = r.fetched_at;
  const runs = (runsRes.data ?? []) as Run[];
  const modeValue = modeRes.data?.value;
  const mode = DUTY_MODES[typeof modeValue === "string" ? modeValue : "demo"] ?? DUTY_MODES.demo;
  const quickDays = Array.from({ length: QUICK_DAYS }, (_, i) => addDaysToKey(today, i));
  // Calendar labels: before 08:30 the current duty day is yesterday's date, so it must not read "Bugün".
  const calToday = istanbulDateKey(new Date());
  const dayLabel = (k: string) => (k === calToday ? "Bugün" : k === addDaysToKey(calToday, 1) ? "Yarın" : formatDate(dayDate(k)));

  return (
    <>
      <AdminPageHeader
        title="Nöbet listesi"
        description="Günün nöbetçi eczanelerini seçip kaydet. Elle girdiğin gün otomatik aktarımla değişmez."
      />
      <div className="flex flex-col gap-3">
        <FilterTabs
          ariaLabel="Nöbet günü"
          items={quickDays.map((k, i) => ({
            label: dayLabel(k),
            href: routes.admin.duty(i === 0 ? undefined : { gun: k }),
            active: k === day,
          }))}
        />
        <Form action={routes.admin.duty()} className="flex flex-wrap items-center gap-2">
          <label htmlFor="duty-day" className="text-sm text-muted-foreground">
            Başka bir gün
          </label>
          <Input id="duty-day" type="date" name="gun" defaultValue={day} min={today} max={lastDay} className="h-10 w-auto" />
          <Button type="submit" variant="outline">
            <CalendarDays /> Göster
          </Button>
        </Form>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <AdminCard
          title={formatDate(dayDate(day), { month: "long", weekday: true })}
          description={`Nöbet ${formatDateTime(win.start, { month: "long" })} - ${formatDateTime(win.end, { month: "long" })} arası.`}
        >
          {pharmacyRes.error ? (
            <EmptyCard>
              <EmptyState icon={TriangleAlert} tone="warning" title="Eczaneler yüklenemedi" />
            </EmptyCard>
          ) : (
            <>
              {imported ? (
                <p className="mb-4 text-sm text-muted-foreground">
                  Bu günün listesi otomatik aktarımdan geldi. Kaydedersen elle girilmiş sayılır ve aktarım bu günü artık değiştirmez.
                </p>
              ) : null}
              <DutyEditor
                key={day}
                day={day}
                pharmacies={pharmacies}
                initialIds={real.map((r) => r.poi_id).filter((id) => known.has(id))}
                hasList={real.length > 0}
              />
            </>
          )}
        </AdminCard>

        <div className="grid content-start gap-4">
          <AdminCard title="Durum">
            <InfoList>
              <InfoRow label="Liste modu">
                <Badge variant={mode.tone}>{mode.label}</Badge>
              </InfoRow>
              <InfoRow label="Bu günün listesi">
                {real.length ? `${real.length} eczane · ${sources.map((s) => DUTY_SOURCES[s] ?? s).join(", ")}` : "Girilmedi"}
              </InfoRow>
              <InfoRow label="Son güncelleme">{lastUpdate ? formatDateTime(lastUpdate) : "-"}</InfoRow>
              {sampleCount ? <InfoRow label="Örnek kayıt">{`${sampleCount} (canlı modda görünmez)`}</InfoRow> : null}
            </InfoList>
            <p className="mt-3 text-sm text-muted-foreground">
              {mode.text}{" "}
              <Link href={routes.admin.settings()} className="font-semibold text-primary hover:underline">
                Ayarlar
              </Link>
            </p>
          </AdminCard>

          <AdminCard title="Son aktarımlar" description="Otomatik aktarım her gün 08:35, 09:10, 12:10 ve 18:10'da çalışır.">
            {runsRes.error ? (
              <p className="text-sm text-muted-foreground">Aktarım kaydı okunamadı.</p>
            ) : runs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Henüz aktarım yok.</p>
            ) : (
              <ul className="grid gap-3">
                {runs.map((r) => {
                  const unmatched = Array.isArray(r.unmatched) ? r.unmatched.filter((x): x is string => typeof x === "string") : [];
                  const counts = runCounts(r);
                  return (
                    <li key={r.id} className="text-sm">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge map={RUN_STATUS} value={r.status} />
                        <span className="text-xs text-muted-foreground">
                          {DUTY_SOURCES[r.source] ?? r.source} · {formatRelativeTime(r.created_at)}
                        </span>
                      </div>
                      {r.duty_day || counts ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {[r.duty_day ? `${formatDate(dayDate(r.duty_day))} nöbeti` : null, counts].filter(Boolean).join(" · ")}
                        </p>
                      ) : null}
                      {r.message ? <p className="mt-0.5 text-xs break-words">{r.message}</p> : null}
                      {unmatched.length ? (
                        <p className="mt-0.5 text-xs break-words text-amber-700">
                          Eşleşmeyen: {unmatched.slice(0, 8).join(", ")}
                          {unmatched.length > 8 ? ` ve ${unmatched.length - 8} eczane daha` : ""}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </AdminCard>
        </div>
      </div>
    </>
  );
}
