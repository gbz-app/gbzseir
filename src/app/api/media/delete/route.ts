import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOwnMediaUrl, parseMediaUrl } from "@/lib/media/kinds";
import { deleteMediaUrls } from "@/lib/media/server";

/**
 * POST /api/media/delete { urls } (public app): removes R2 files the signed-in user uploaded and then dropped before
 * saving (a replaced or removed video, a removed photo). Refuses anything that is not the caller's own R2 file and
 * skips files any listing still uses. Supabase files are removed by the browser itself (storage RLS).
 */
export const dynamic = "force-dynamic";

const MAX_URLS = 6;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (origin && (!host || (() => { try { return new URL(origin).host !== host; } catch { return true; } })())) {
    return json({ ok: false, error: "Geçersiz istek." }, 403);
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ ok: false, error: "Geçersiz istek." }, 415);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, error: "Giriş yapmalısın." }, 401);

  let urls: string[] = [];
  try {
    const body = (await request.json()) as { urls?: unknown };
    urls = Array.isArray(body?.urls) ? body.urls.filter((u): u is string => typeof u === "string") : [];
  } catch {
    return json({ ok: false, error: "Geçersiz istek." }, 400);
  }
  urls = [...new Set(urls)];
  if (!urls.length || urls.length > MAX_URLS) return json({ ok: false, error: "Geçersiz istek." }, 400);
  if (urls.some((u) => parseMediaUrl(u)?.provider !== "r2" || !isOwnMediaUrl(u, user.id))) {
    return json({ ok: false, error: "Bu dosyayı silemezsin." }, 403);
  }

  try {
    const admin = createAdminClient();
    const results = await Promise.all([
      admin.from("listing_videos").select("url, poster_url").in("url", urls),
      admin.from("listing_videos").select("url, poster_url").in("poster_url", urls),
      admin.from("listing_media").select("url, thumb_url").in("url", urls),
      admin.from("listing_media").select("url, thumb_url").in("thumb_url", urls),
    ]);
    const inUse = new Set<string>();
    for (const r of results) {
      if (r.error) throw new Error(r.error.message);
      for (const row of r.data ?? []) for (const v of Object.values(row)) if (typeof v === "string") inUse.add(v);
    }
    const { deleted, failed } = await deleteMediaUrls(urls.filter((u) => !inUse.has(u)));
    return json({ ok: failed.length === 0, deleted: deleted.length, kept: urls.length - deleted.length - failed.length });
  } catch (e) {
    console.error("[media/delete] failed", (e as Error).message);
    return json({ ok: false, error: "Dosya silinemedi." }, 500);
  }
}
