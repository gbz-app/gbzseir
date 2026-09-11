import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCronAuthorized } from "@/lib/server/cron-auth";

/**
 * Hard-deletes listings their owner deleted more than 30 days ago (status 'deleted', deleted_at set by the DB).
 *
 * Called daily by the pg_cron job `gebzem-purge-listings` through pg_net (header `x-cron-secret` = CRON_SECRET, from
 * Supabase Vault 'gebzem_push_webhook_secret'). Photos in the media bucket are removed first; a listing whose files
 * could not be removed keeps its row and is retried the next day. listing_media rows cascade, favorites go with a
 * DB trigger. Only the owner's own listing uploads (`<uid>/listings/...`) are removed (seed images, other folders and
 * foreign URLs are skipped) and never a file another listing of the same owner still uses.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RETENTION_DAYS = 30;
const BATCH = 50;
const MAX_BATCHES = 10;
const PAGE = 100;
const MEDIA_PREFIX = "/storage/v1/object/public/media/";

/** Path of a file in this project's public media bucket, else null. Never throws (URLs are client-supplied). */
function mediaPath(url: string | null, origin: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.origin !== origin || !parsed.pathname.startsWith(MEDIA_PREFIX)) return null;
    const path = decodeURIComponent(parsed.pathname.slice(MEDIA_PREFIX.length));
    return path && !path.includes("..") && !path.includes("\\") ? path : null;
  } catch {
    return null;
  }
}

async function handle(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

  const admin = createAdminClient();
  const origin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin;
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const totals = { purged: 0, files: 0, failed: 0 };

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
          const path = mediaPath(url, origin);
          if (path) inUse.add(path);
        }
      }
    }

    // Only the listing wizard's own uploads (`<ownerId>/listings/...`): never avatars, business photos or seed images.
    const pathOwner = new Map<string, string>();
    for (const r of rows) {
      for (const m of r.listing_media ?? []) {
        for (const url of [m.url, m.thumb_url]) {
          const path = mediaPath(url, origin);
          if (path && path.startsWith(`${r.owner_id}/listings/`) && !inUse.has(path)) pathOwner.set(path, r.id);
        }
      }
    }

    const failedIds = new Set<string>();
    const paths = [...pathOwner.keys()];
    for (let i = 0; i < paths.length; i += PAGE) {
      const chunk = paths.slice(i, i + PAGE);
      const { data: removed, error: removeError } = await admin.storage.from("media").remove(chunk);
      if (removeError) for (const p of chunk) failedIds.add(pathOwner.get(p)!);
      else totals.files += removed?.length ?? 0;
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

  if (totals.failed) console.error(`[purge-listings] ${totals.failed} listing(s) kept because their files could not be removed`);
  return NextResponse.json({ ok: true, ...totals }, { headers: { "Cache-Control": "no-store" } });
}

export const POST = handle;
export const GET = handle;
