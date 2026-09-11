import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Signed URL lifetime; the redirect itself is cached a little shorter. */
const SIGNED_SECONDS = 300;
const MAX_PHOTOS = 10;

function fail(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * GET /api/talep-foto?r=<request id>&i=<photo index>: service-request photos live in the private bucket
 * (private-docs/<customer uid>/requests/). Only the customer, firms with a lead on the request and admins may see them
 * (get_request_photo_paths); they are redirected to a short-lived signed URL made with the service-role client.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const requestId = params.get("r") ?? "";
  const rawIndex = params.get("i") ?? "";
  const index = Number(rawIndex);
  if (!UUID_RE.test(requestId) || !/^\d{1,2}$/.test(rawIndex) || index >= MAX_PHOTOS) return fail(400, "Geçersiz bağlantı.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail(401, "Bu fotoğrafı görmek için giriş yapmalısın.");

  // null = not allowed; an entry is null when it is not a valid request photo path.
  const { data: paths, error } = await supabase.rpc("get_request_photo_paths", { p_request_id: requestId });
  if (error) {
    console.error("[talep-foto] get_request_photo_paths failed", error.message);
    return fail(500, "Fotoğraf yüklenemedi.");
  }
  if (!paths) return fail(403, "Bu fotoğrafı görme iznin yok.");
  const path = paths[index];
  if (!path) return fail(404, "Fotoğraf bulunamadı.");

  try {
    const { data, error: signError } = await createAdminClient().storage.from("private-docs").createSignedUrl(path, SIGNED_SECONDS);
    if (signError || !data?.signedUrl) return fail(404, "Fotoğraf bulunamadı.");
    return NextResponse.redirect(data.signedUrl, { status: 302, headers: { "Cache-Control": "private, max-age=240" } });
  } catch (e) {
    console.error("[talep-foto] signing failed", e);
    return fail(500, "Fotoğraf yüklenemedi.");
  }
}
