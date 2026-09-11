"use server";

import { z } from "zod";
import { POI_SYNC_RUN_COLUMNS, poiSyncRunFromRow, type PoiSyncRun } from "@/features/nearby/server/poi-sync";
import { dbFail, withAdmin } from "../server/guard";
import { fail, ok, type ActionResult } from "../lib/action-result";
import { zId } from "../lib/zod";

const startSchema = z.object({ dryRun: z.boolean() });
const runSchema = z.object({ runId: zId });

type SyncStart = { started?: boolean; reason?: "pending" | "no_secret"; run_id?: string; dry_run?: boolean };

/**
 * "Şimdi eşitle" / "Önizle" on /admin/veri (dryRun: nothing is written). The admin site has no service role key, so
 * admin_poi_sync_now queues the public app's /api/cron/poi-sync (the same run as the monthly job: locked rows keep the
 * admin's edits) and returns the request's run id at once; the panel polls it with getPoiSyncRunAction.
 * alreadyRunning: an earlier request is still running, runId names that one.
 */
export async function startPoiSyncAction(
  input: z.input<typeof startSchema>,
): Promise<ActionResult<{ runId: string; dryRun: boolean; alreadyRunning: boolean }>> {
  return withAdmin(async ({ supabase }) => {
    const parsed = startSchema.safeParse(input);
    if (!parsed.success) return fail("Geçersiz istek.");
    const { data: raw, error } = await supabase.rpc("admin_poi_sync_now", { p_dry_run: parsed.data.dryRun });
    if (error) return dbFail(error, "Eşitleme başlatılamadı. Tekrar dene.");
    const data = raw as SyncStart | null;
    if (!data?.run_id || (!data.started && data.reason !== "pending")) return fail("Eşitleme başlatılamadı. Tekrar dene.");
    return ok({ runId: data.run_id, dryRun: data.dry_run === true, alreadyRunning: !data.started });
  });
}

/** One sync request / run (data_sync_runs, admin read). null: no such run. */
export async function getPoiSyncRunAction(input: z.input<typeof runSchema>): Promise<ActionResult<PoiSyncRun | null>> {
  return withAdmin(async ({ supabase }) => {
    const parsed = runSchema.safeParse(input);
    if (!parsed.success) return fail("Geçersiz istek.");
    const { data, error } = await supabase.from("data_sync_runs").select(POI_SYNC_RUN_COLUMNS).eq("id", parsed.data.runId).maybeSingle();
    if (error) return dbFail(error, "Eşitleme durumu okunamadı.");
    return ok(data ? poiSyncRunFromRow(data) : null);
  });
}
