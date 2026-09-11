import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCronAuthorized } from "@/lib/server/cron-auth";
import { parseMediaUrl } from "@/lib/media/kinds";
import { deleteMediaUrls, drainMediaTrash } from "@/lib/media/server";

/**
 * Hard-deletes listings their owner deleted more than 30 days ago (status 'deleted', deleted_at set by the DB).
 *
 * Called daily by the pg_cron job `gebzem-purge-listings` through pg_net (header `x-cron-secret` = CRON_SECRET, from
 * Supabase Vault 'gebzem_push_webhook_secret'). Photos are removed first from whichever store holds them (Supabase
 * `media` bucket or Cloudflare R2); a listing whose files could not be removed keeps its row and is retried the next
 * day. listing_media rows cascade, favorites go with a DB trigger, and the listing's video row cascades into
 * public.media_trash (trigger), which is drained at the end of every run together with replaced / admin-removed
 * videos. Only the owner's own listing uploads (`<uid>/listings/...`) are removed (seed images, other folders and
 * foreign URLs are skipped) and never a file another listing of the same owner still uses.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RETENTION_DAYS = 30;
const BATCH = 50;
const MAX_BATCHES = 10;
const PAGE = 100;

/** "<provider>:<key>" of a file in one of our stores, else null. Never throws (URLs are client-supplied). */
function mediaRef(url: string | null): { id: string; provider: "r2" | "supabase"; key: string; url: string } | null {
  if (!url) return null;
  const parsed = parseMediaUrl(url);
  return parsed ? { id: `${parsed.provider}:${parsed.key}`, provider: parsed.provider, key: parsed.key, url } : null;
}

async function handle(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const totals = { purged: 0, files: 0, failed: 0, trashDeleted: 0, trashFailed: 0 };

  for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
    const { data, error } = await admin
      .from("listings")
      .select("id, owner_id, listing_media(url, thumb_url)")
      .eq("status", "deleted")
      .lt("deleted_at", cutoff)
      .order("deleted_at", { ascending: true })
      .limit(BATCH);
    if (error) return NextResponse.json({ ok: false, error: "İlanlar okunamadı", ...totals }, { status: 500 });
    const rows = data ?? [];
    if (!rows.length) break;
    const ids = new Set(rows.map((r) => r.id));

    // Files still used by another listing of the same owners stay.
    const owners = [...new Set(rows.map((r) => r.owner_id))];
    const { data: others, error: othersError } = await admin
      .from("listings")
      .select("id, listing_media(url, thumb_url)")
      .in("owner_id", owners)
      .limit(1000);
    if (othersError) return NextResponse.json({ ok: false, error: "İlan fotoğrafları okunamadı", ...totals }, { status: 500 });
    const inUse = new Set<string>();
    for (const o of others ?? []) {
      if (ids.has(o.id)) continue;
      for (const m of o.listing_media ?? []) {
        for (const url of [m.url, m.thumb_url]) {
          const ref = mediaRef(url);
          if (ref) inUse.add(ref.id);
        }
      }
    }

    // Only the listing wizard's own uploads (`<ownerId>/listings/...`): never avatars, business photos or seed images.
    const supabaseOwner = new Map<string, string>(); // storage path -> listing id
    const r2Owner = new Map<string, string>(); // public URL -> listing id
    for (const r of rows) {
      for (const m of r.listing_media ?? []) {
        for (const url of [m.url, m.thumb_url]) {
          const ref = mediaRef(url);
          if (!ref || !ref.key.startsWith(`${r.owner_id}/listings/`) || inUse.has(ref.id)) continue;
          if (ref.provider === "supabase") supabaseOwner.set(ref.key, r.id);
          else r2Owner.set(ref.url, r.id);
        }
      }
    }

    const failedIds = new Set<string>();
    const paths = [...supabaseOwner.keys()];
    for (let i = 0; i < paths.length; i += PAGE) {
      const chunk = paths.slice(i, i + PAGE);
      const { data: removed, error: removeError } = await admin.storage.from("media").remove(chunk);
      if (removeError) for (const p of chunk) failedIds.add(supabaseOwner.get(p)!);
      else totals.files += removed?.length ?? 0;
    }
    if (r2Owner.size) {
      // Not configured here -> reported as failed, so those listings wait instead of orphaning their files.
      const { deleted, failed } = await deleteMediaUrls([...r2Owner.keys()]);
      totals.files += deleted.length;
      for (const url of failed) failedIds.add(r2Owner.get(url)!);
    }

    const purgeIds = [...ids].filter((id) => !failedIds.has(id));
    if (purgeIds.length) {
      const { data: deleted, error: deleteError } = await admin
        .from("listings")
        .delete()
        .in("id", purgeIds)
        .eq("status", "deleted")
        .lt("deleted_at", cutoff)
        .select("id");
      if (deleteError) return NextResponse.json({ ok: false, error: "İlanlar silinemedi", ...totals }, { status: 500 });
      totals.purged += deleted?.length ?? 0;
    }
    totals.failed += failedIds.size;

    // Failed listings would come back in the next batch; they are retried tomorrow.
    if (failedIds.size || rows.length < BATCH) break;
  }

  // Videos of purged listings, replaced videos and admin removals (public.media_trash).
  try {
    const trash = await drainMediaTrash(admin);
    totals.trashDeleted = trash.deleted;
    totals.trashFailed = trash.failed;
  } catch (e) {
    console.error("[purge-listings] media trash drain failed", (e as Error).message);
  }

  if (totals.failed) console.error(`[purge-listings] ${totals.failed} listing(s) kept because their files could not be removed`);
  if (totals.trashFailed) console.error(`[purge-listings] ${totals.trashFailed} trashed media file(s) could not be removed`);
  return NextResponse.json({ ok: true, ...totals }, { headers: { "Cache-Control": "no-store" } });
}

export const POST = handle;
export const GET = handle;
