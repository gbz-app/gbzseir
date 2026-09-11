"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Eye, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatNumber } from "@/core/format";
import type { PoiKind } from "@/features/nearby/types";
import type { PoiSyncRun, PoiSyncSummary } from "@/features/nearby/server/poi-sync";
import { getPoiSyncRunAction, startPoiSyncAction } from "../actions/poi-sync";
import { POI_SOURCES, type LabelMap } from "../lib/labels";
import { POI_KIND_META } from "../lib/poi-kinds";
import { InfoList, InfoRow, StatusBadge } from "./admin-ui";
import { ConfirmDialog } from "./confirm-dialog";
import { useAdminAction } from "./use-admin-action";

const STATUS: LabelMap = {
  ok: { label: "Tamamlandı", tone: "success" },
  partial: { label: "Kısmen tamamlandı", tone: "warning" },
  error: { label: "Başarısız", tone: "destructive" },
};

const TRIGGERS: Record<string, string> = { cron: "Otomatik (aylık)", admin: "Yönetici", script: "Betik" };

const ERROR_SOURCES: Record<string, string> = {
  "kbb:pharmacy": "KBB eczaneler",
  "kbb:mosque": "KBB camiler",
  osm: "OpenStreetMap",
  db: "Veritabanı",
};

/** The public app answers within 1-2 minutes (its route allows 5); the panel stops asking after 6. */
const POLL_MS = 5_000;
const MAX_POLLS = 72;

function groupLabel(kind: string, source: string): string {
  const k = POI_KIND_META[kind as PoiKind]?.plural ?? kind;
  return `${k} · ${POI_SOURCES[source] ?? source}`;
}

/** Group table + notes (guard, locked, restored rows and failed sources). */
function SyncSummary({ summary, message }: { summary: PoiSyncSummary; message?: string | null }) {
  const t = summary.totals;
  const notes: string[] = [];
  for (const g of summary.groups) {
    const label = groupLabel(g.kind, g.source);
    if (g.guarded) notes.push(`${label}: kaynak eksik göründü, ${g.missing} kayıt listede olmadığı halde gizlenmedi. Bir sonraki eşitlemede tekrar denenir.`);
    if (g.locked) notes.push(`${label}: kaynakta olmayan ${g.locked} kayıt kilitli olduğu için görünür kaldı.`);
    if (g.restored) notes.push(`${label}: kaynakta yeniden görünen ${g.restored} kayıt tekrar açıldı.`);
  }
  // The run's message repeats the source errors; alone it explains a run without a summary (e.g. no answer).
  const lone = !summary.errors.length && message ? message : null;
  return (
    <div className="grid gap-3">
      <p className="text-sm">
        <strong className="tabular-nums">{formatNumber(t.added)}</strong> yeni ·{" "}
        <strong className="tabular-nums">{formatNumber(t.updated)}</strong> güncellendi ·{" "}
        <strong className="tabular-nums">{formatNumber(t.hidden)}</strong> gizlendi ·{" "}
        <span className="text-muted-foreground tabular-nums">{formatNumber(t.unchanged)} değişmedi</span>
      </p>
      {summary.groups.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[30rem] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1.5 font-medium">Veri</th>
                <th className="py-1.5 text-right font-medium">Gelen</th>
                <th className="py-1.5 text-right font-medium">Yeni</th>
                <th className="py-1.5 text-right font-medium">Güncellenen</th>
                <th className="py-1.5 text-right font-medium">Gizlenen</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {summary.groups.map((g) => (
                <tr key={`${g.source}-${g.kind}`}>
                  <td className="py-1.5">{groupLabel(g.kind, g.source)}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatNumber(g.fetched)}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatNumber(g.added)}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatNumber(g.updated + g.restored)}</td>
                  <td className="py-1.5 text-right tabular-nums">{g.complete ? formatNumber(g.hidden) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {notes.length || summary.errors.length || lone ? (
        <ul className="grid gap-1 text-xs">
          {lone ? <li className="break-words text-destructive">{lone}</li> : null}
          {summary.errors.map((e, i) => (
            <li key={`e${i}`} className="break-words text-destructive">
              {ERROR_SOURCES[e.source] ?? e.source}: {e.message}
            </li>
          ))}
          {notes.map((n, i) => (
            <li key={`n${i}`} className="break-words text-amber-700">
              {n}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function announce(r: PoiSyncRun) {
  if (r.status === "error") toast.error(r.summary.errors[0]?.message ?? r.message ?? "Yer verisi eşitlenemedi.");
  else if (r.status === "partial") toast.warning(r.dryRun ? "Önizleme hazır; bazı kaynaklar okunamadı." : "Eşitleme kısmen tamamlandı.");
  else toast.success(r.dryRun ? "Önizleme hazır; hiçbir şey değişmedi." : "Yer verisi eşitlendi.");
}

type Waiting = { runId: string; dryRun: boolean };

/**
 * Yer verisi eşitleme (/admin/veri): last logged run, "Önizle" (dry run: nothing written) and "Şimdi eşitle". Both queue
 * a run on the public app; the panel polls the request until its result arrives and shows it. `activeRun`: a request
 * still running when the page was opened (e.g. after a reload) is followed too.
 */
export function PoiSyncPanel({ lastRun, activeRun }: { lastRun: PoiSyncRun | null; activeRun: PoiSyncRun | null }) {
  const router = useRouter();
  const { pending, run } = useAdminAction();
  const [waiting, setWaiting] = React.useState<Waiting | null>(
    activeRun?.status === "running" ? { runId: activeRun.id, dryRun: activeRun.dryRun } : null,
  );
  const [result, setResult] = React.useState<PoiSyncRun | null>(null);
  const [lost, setLost] = React.useState(false);
  const busy = pending || waiting !== null;

  React.useEffect(() => {
    if (!waiting) return;
    let polls = 0;
    let timer = 0;
    let cancelled = false;
    const tick = async () => {
      polls += 1;
      const res = await getPoiSyncRunAction({ runId: waiting.runId }).catch(() => null);
      if (cancelled) return;
      const r = res?.ok ? res.data : null;
      if (r && r.status !== "running") {
        setWaiting(null);
        setResult(r);
        announce(r);
        if (!r.dryRun) router.refresh();
        return;
      }
      // Gone (no such request) or no answer in time.
      if ((res?.ok && !res.data) || polls >= MAX_POLLS) {
        setWaiting(null);
        setLost(true);
        return;
      }
      timer = window.setTimeout(() => void tick(), POLL_MS);
    };
    timer = window.setTimeout(() => void tick(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [waiting, router]);

  const start = async (dryRun: boolean) => {
    setResult(null);
    setLost(false);
    const res = await run(() => startPoiSyncAction({ dryRun }), { success: false });
    if (!res?.ok) return;
    if (res.data.alreadyRunning) toast.info("Bir eşitleme zaten sürüyor; bitince sonucu burada görünecek.");
    setWaiting({ runId: res.data.runId, dryRun: res.data.dryRun });
  };

  return (
    <div className="grid gap-4">
      {lastRun ? (
        <div className="grid gap-3">
          <InfoList>
            <InfoRow label="Son eşitleme">{formatDateTime(lastRun.finishedAt ?? lastRun.createdAt)}</InfoRow>
            <InfoRow label="Durum">
              <StatusBadge map={STATUS} value={lastRun.status} />
            </InfoRow>
            <InfoRow label="Başlatan">{TRIGGERS[lastRun.triggeredBy] ?? lastRun.triggeredBy}</InfoRow>
          </InfoList>
          <SyncSummary summary={lastRun.summary} message={lastRun.message} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Henüz eşitleme yapılmadı. Aşağıdan önizleyebilir ya da hemen eşitleyebilirsin.</p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={busy} onClick={() => void start(true)}>
          <Eye /> Önizle
        </Button>
        <ConfirmDialog
          title="Yer verisi şimdi eşitlensin mi?"
          description="KBB ve OpenStreetMap'ten güncel liste çekilir. Yeni yerler eklenir, değişenler güncellenir; kaynakta artık olmayanlar silinmez, gizlenir. Kilitli yerlerdeki düzenlemelerin korunur."
          confirmLabel="Eşitle"
          trigger={
            <Button disabled={busy}>
              <RefreshCw /> Şimdi eşitle
            </Button>
          }
          onConfirm={() => {
            void start(false);
          }}
        />
      </div>

      {busy ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
          {waiting?.dryRun ? "Önizleme hazırlanıyor; kaynaklar okunuyor, 1-2 dakika sürebilir." : "Kaynaklar okunuyor; bu işlem 1-2 dakika sürebilir. Sayfadan ayrılsan da eşitleme sürer."}
        </p>
      ) : null}

      {lost ? (
        <p className="text-sm text-muted-foreground" role="status">
          Sonuç henüz gelmedi. Birkaç dakika sonra sayfayı yenileyip son eşitlemeye bakabilirsin.
        </p>
      ) : null}

      {result ? (
        <div className="grid gap-3 rounded-xl bg-muted/40 p-3">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            {result.dryRun ? "Önizleme: hiçbir şey değişmedi" : "Eşitleme sonucu"}
            <StatusBadge map={STATUS} value={result.status} />
          </p>
          <SyncSummary summary={result.summary} message={result.message} />
        </div>
      ) : null}
    </div>
  );
}
