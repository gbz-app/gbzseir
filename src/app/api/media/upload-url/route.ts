import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isMediaKind, mediaUploadError } from "@/lib/media/kinds";
import { providerFor, resolveUploadProviderId } from "@/lib/media/server";
import type { CreatedUpload } from "@/lib/media/types";

/**
 * Media adapter endpoint (public app; the admin site has no /api).
 * - GET  -> { provider: 'r2' | 'supabase', video }: where new uploads go (video needs R2).
 * - POST { kind, contentType, size } -> { ok, upload: { uploadUrl, method: 'PUT', headers, publicUrl, key } }
 *   Signed-in users only. kind: listing-photo (jpeg/png/webp <= 5 MB), listing-video (mp4/mov/webm <= 100 MB, R2
 *   only), listing-poster (jpeg <= 1 MB). Key: <uid>/listings/<yyyy>/<uuid>.<ext>. The upload is recorded with
 *   reserve_media_upload (daily quota, ban check) before the presigned URL is returned; R2 URLs expire in 10 minutes
 *   and are signed for the exact content type and size.
 * R2 is used only when the R2 env is complete and app_settings 'media_public_base' matches NEXT_PUBLIC_MEDIA_BASE_URL
 * (resolveUploadProviderId), otherwise photos stay on Supabase and video is off.
 */
export const dynamic = "force-dynamic";

type Fail = { status: number; error: string };

const HINTS: Record<string, Fail> = {
  rate_limited: { status: 429, error: "Bugün çok fazla dosya yükledin. Yarın tekrar dene." },
  banned: { status: 403, error: "Hesabın engellendiği için dosya yükleyemezsin." },
  login_required: { status: 401, error: "Dosya yüklemek için giriş yap." },
  invalid_file: { status: 400, error: "Bu dosya türü ya da boyutu desteklenmiyor." },
  invalid_kind: { status: 400, error: "Bu dosya türü desteklenmiyor." },
  invalid_key: { status: 400, error: "Dosya yüklenemedi. Tekrar dene." },
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function fail(status: number, error: string, code: string) {
  return json({ ok: false, error, code }, status);
}

/** Cross-site POSTs are refused (browsers always send Origin on POST). */
function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    return !!host && new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function GET() {
  const provider = await resolveUploadProviderId(await createClient());
  return json({ provider, video: provider === "r2" });
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return fail(403, "Geçersiz istek.", "origin");
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return fail(415, "Geçersiz istek.", "content_type");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail(401, "Dosya yüklemek için giriş yap.", "login_required");

  let body: Record<string, unknown>;
  try {
    const raw: unknown = await request.json();
    body = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  } catch {
    return fail(400, "Geçersiz istek.", "bad_json");
  }
  const { kind, contentType, size } = body;
  if (!isMediaKind(kind) || typeof contentType !== "string" || typeof size !== "number") return fail(400, "Geçersiz istek.", "bad_request");
  const invalid = mediaUploadError(kind, contentType, size);
  if (invalid) return fail(400, invalid, "invalid_file");
  const providerId = await resolveUploadProviderId(supabase);
  if (kind === "listing-video" && providerId !== "r2") return fail(503, "Video yükleme yakında açılacak.", "video_unavailable");
  const provider = providerFor(providerId);
  if (!provider) return fail(503, "Yükleme şu an kapalı. Biraz sonra tekrar dene.", "provider");

  let upload: CreatedUpload;
  try {
    upload = await provider.createUpload({ kind, contentType, size, userId: user.id });
  } catch (e) {
    console.error("[media/upload-url] createUpload failed", (e as Error).message);
    return fail(500, "Yükleme başlatılamadı. Tekrar dene.", "provider");
  }

  const { error } = await supabase.rpc("reserve_media_upload", {
    p_kind: kind,
    p_key: upload.key,
    p_content_type: contentType,
    p_size: size,
  });
  if (error) {
    const mapped = error.hint ? HINTS[error.hint] : undefined;
    if (mapped) return fail(mapped.status, mapped.error, error.hint ?? "error");
    console.error("[media/upload-url] reserve_media_upload failed", error.code, error.hint);
    return fail(500, "Yükleme başlatılamadı. Tekrar dene.", "reserve");
  }
  return json({ ok: true, upload });
}
