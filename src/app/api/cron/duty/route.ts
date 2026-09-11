import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/server/cron-auth";
import { runDutyImport } from "@/features/nearby/server/duty-import";

/**
 * Real duty list import for the current duty day (src/features/nearby/server/duty-import.ts).
 *
 * Called by the pg_cron jobs `gebzem-duty-import` (08:35) and `gebzem-duty-import-recheck` (09:10, 12:10, 18:10)
 * through pg_net (header `x-cron-secret` = CRON_SECRET, from Supabase Vault 'gebzem_push_webhook_secret').
 * Without a source key (NOSYAPI_KEY) it only logs a 'no_source' run. Every run shows on /admin/nobet.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
  try {
    const r = await runDutyImport();
    const headers = { "Cache-Control": "no-store" };
    if (r.status === "no_source") return NextResponse.json({ ok: true, status: r.status, day: r.day, message: "No duty source configured" }, { headers });
    return NextResponse.json({ ok: r.status !== "error", ...r }, { status: r.status === "error" ? 502 : 200, headers });
  } catch (e) {
    console.error("[cron/duty]", e);
    return NextResponse.json({ ok: false, error: "Nöbet listesi aktarılamadı" }, { status: 500 });
  }
}

export const POST = handle;
export const GET = handle;
