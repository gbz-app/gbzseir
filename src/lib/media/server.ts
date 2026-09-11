import "server-only";
import type { AdminSupabase } from "@/lib/supabase/admin";
import type { createClient } from "@/lib/supabase/server";
import { MEDIA_KEY_RE, parseMediaUrl, type MediaProviderId } from "./kinds";
import { createR2Provider, r2Config, r2DeleteKey, r2ListKeys } from "./r2";
import { createSupabaseMediaProvider } from "./supabase";
import type { MediaProvider } from "./types";

/**
 * Server entry point of the media adapter. R2 is used when every R2 env var is set, otherwise Supabase Storage.
 * Both stay readable forever (the DB keeps absolute URLs), so deletion always goes by the URL's own provider.
 */

/** Env only (cleanup paths: can this deployment delete R2 files?). New uploads use resolveUploadProviderId. */
export function activeMediaProviderId(): MediaProviderId {
  return r2Config() ? "r2" : "supabase";
}

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Store for NEW uploads: R2 only when the env is complete AND app_settings 'media_public_base' (the base
 * set_listing_media / set_listing_video accept) is the same URL. Otherwise Supabase, so a half-done setup never
 * hands out files the DB then refuses after the listing was already saved. app_settings is public-readable.
 */
export async function resolveUploadProviderId(supabase: ServerSupabase): Promise<MediaProviderId> {
  const c = r2Config();
  if (!c) return "supabase";
  const { data, error } = await supabase.from("app_settings").select("value").eq("key", "media_public_base").maybeSingle();
  if (error) {
    console.error("[media] media_public_base read failed", error.code);
    return "supabase";
  }
  const dbBase = typeof data?.value === "string" ? data.value.trim().replace(/\/+$/, "") : null;
  if (dbBase !== c.publicBase) {
    console.warn("[media] R2 env is set but app_settings.media_public_base differs; uploads stay on Supabase");
    return "supabase";
  }
  return "r2";
}

export function getMediaProvider(): MediaProvider {
  const c = r2Config();
  return c ? createR2Provider(c) : createSupabaseMediaProvider();
}

/** Provider for a stored URL's store (null when that store is not configured here). */
export function providerFor(id: MediaProviderId): MediaProvider | null {
  if (id === "supabase") return createSupabaseMediaProvider();
  const c = r2Config();
  return c ? createR2Provider(c) : null;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/**
 * Deletes files by public URL in whichever store they live (Supabase `media` or R2). Unknown / foreign URLs are
 * skipped (counted in `skipped`). Never throws. Callers decide which URLs are safe to delete.
 */
export async function deleteMediaUrls(urls: string[]): Promise<{ deleted: string[]; failed: string[]; skipped: string[] }> {
  const deleted: string[] = [];
  const failed: string[] = [];
  const skipped: string[] = [];
  const supabase: Array<{ url: string; key: string }> = [];
  const r2: Array<{ url: string; key: string }> = [];
  for (const url of [...new Set(urls)]) {
    const p = parseMediaUrl(url);
    if (!p) skipped.push(url);
    else (p.provider === "r2" ? r2 : supabase).push({ url, key: p.key });
  }

  if (supabase.length) {
    const provider = createSupabaseMediaProvider();
    for (const item of supabase) {
      try {
        (await provider.deleteByUrl(item.url) ? deleted : failed).push(item.url);
      } catch {
        failed.push(item.url);
      }
    }
  }

  if (r2.length) {
    const c = r2Config();
    if (!c) failed.push(...r2.map((x) => x.url));
    else {
      const results = await mapLimit(r2, 6, (item) => r2DeleteKey(c, item.key));
      r2.forEach((item, i) => (results[i] ? deleted : failed).push(item.url));
    }
  }
  return { deleted, failed, skipped };
}

/** Account deletion: every R2 object under `<uid>/`. Returns the number of failures (0 when R2 is not configured). */
export async function deleteR2UserFolder(userId: string): Promise<number> {
  const c = r2Config();
  if (!c || !/^[0-9a-f-]{36}$/.test(userId)) return 0;
  let keys: string[];
  try {
    keys = await r2ListKeys(c, `${userId}/`);
  } catch (e) {
    console.error("[media] R2 list failed during account delete", e);
    return 1;
  }
  const results = await mapLimit(keys, 6, (key) => r2DeleteKey(c, key));
  return results.filter((ok) => !ok).length;
}

const TRASH_BATCH = 200;
const REF_CHUNK = 25;

/**
 * Drains public.media_trash (filled by the listing_videos delete/update trigger: replaced videos, admin removals,
 * hard-deleted listings and accounts). A URL still used by any listing video or photo is only dropped from the
 * trash; others are deleted from their store and then dropped. Failed deletions stay for the next run.
 * Runs with the service-role client from the purge cron (public app).
 */
export async function drainMediaTrash(admin: AdminSupabase): Promise<{ deleted: number; kept: number; failed: number }> {
  const { data, error } = await admin.from("media_trash").select("url").order("created_at", { ascending: true }).limit(TRASH_BATCH);
  if (error) throw new Error(`media_trash read failed: ${error.message}`);
  const urls = (data ?? []).map((r) => r.url);
  if (!urls.length) return { deleted: 0, kept: 0, failed: 0 };

  const inUse = new Set<string>();
  for (let i = 0; i < urls.length; i += REF_CHUNK) {
    const chunk = urls.slice(i, i + REF_CHUNK);
    const results = await Promise.all([
      admin.from("listing_videos").select("url, poster_url").in("url", chunk),
      admin.from("listing_videos").select("url, poster_url").in("poster_url", chunk),
      admin.from("listing_media").select("url, thumb_url").in("url", chunk),
      admin.from("listing_media").select("url, thumb_url").in("thumb_url", chunk),
    ]);
    for (const r of results) {
      if (r.error) throw new Error(`media reference check failed: ${r.error.message}`);
      for (const row of r.data ?? []) for (const v of Object.values(row)) if (typeof v === "string") inUse.add(v);
    }
  }

  const kept = urls.filter((u) => inUse.has(u));
  // Only files the upload route created (R2 `<uid>/listings/<yyyy>/<uuid>.<ext>`). Anything else that reached the
  // trash (e.g. a URL an admin wrote into listing_videos by hand) is dropped from the queue, never deleted.
  const isAdapterFile = (u: string) => {
    const p = parseMediaUrl(u);
    return p?.provider === "r2" && MEDIA_KEY_RE.test(p.key);
  };
  const free = urls.filter((u) => !inUse.has(u));
  const ignored = free.filter((u) => !isAdapterFile(u));
  const { deleted, failed, skipped } = await deleteMediaUrls(free.filter(isAdapterFile));
  // Foreign / unknown URLs cannot be deleted by us; drop them from the trash as well.
  const done = [...kept, ...deleted, ...skipped, ...ignored];
  for (let i = 0; i < done.length; i += 100) {
    const { error: delError } = await admin.from("media_trash").delete().in("url", done.slice(i, i + 100));
    if (delError) throw new Error(`media_trash cleanup failed: ${delError.message}`);
  }
  return { deleted: deleted.length, kept: kept.length, failed: failed.length };
}
