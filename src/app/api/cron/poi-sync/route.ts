import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/server/cron-auth";
import { runPoiSync } from "@/features/nearby/server/poi-sync";

/**
 * POI re-sync: KBB pharmacies / mosques and OSM stops, places, taxi stands, ATMs (src/features/nearby/server/poi-sync.ts).
 * Rows the source no longer lists are hidden, never deleted; locked rows keep the admin's edits. Every real run is
 * logged in data_sync_runs (/admin/veri). `?dry=1` only reports what would change.
 *
 * Called through pg_net (header `x-cron-secret` = CRON_SECRET, from Supabase Vault 'gebzem_push_webhook_secret'):
 *  - on the 2nd of each month by the pg_cron job `gebzem-poi-sync` (body {source: 'pg_cron'});
 *  - for "Şimdi eşitle" / "Önizle" on /admin/veri by admin_poi_sync_now (body {source: 'admin', run_id, dry_run}): the
 *    result is written into that request's data_sync_runs row, which the admin page polls.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function readRequest(req: Request): Promise<{ runId: string | null; dryRun: boolean }> {
  const body: unknown = req.method === "POST" ? await req.json().catch(() => null) : null;
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const runId = typeof b.run_id === "string" && UUID.test(b.run_id) ? b.run_id : null;
  return { runId, dryRun: b.dry_run === true || new URL(req.url).searchParams.get("dry") === "1" };
}

async function handle(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
  const { runId, dryRun } = await readRequest(req);
  try {
    const r = await runPoiSync({ trigger: runId ? "admin" : "cron", dryRun, runId });
    if (r.errors.length) console.warn(`[cron/poi-sync] ${r.status}: ${r.errors.map((e) => `${e.source} (${e.message})`).join(", ")}`);
    return NextResponse.json({ ok: r.status !== "error", ...r }, { status: r.status === "error" ? 502 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[cron/poi-sync]", e);
    return NextResponse.json({ ok: false, error: "Yer verisi eşitlenemedi" }, { status: 500 });
  }
}

export const POST = handle;
export const GET = handle;
