import { NextResponse, type NextRequest } from "next/server";
import { routes } from "@/core/routes";
import { getCurrentUser } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_BUSINESS_COOKIE, activeBusinessCookieOptions, isBusinessId } from "@/features/business/lib/active-business";

/**
 * GET /isletme/sec?b=<businessId>&next=/isletme/...  Switches the active business (only to one the user owns) and
 * redirects to `next` (business panel paths only). Used by links that must open a specific business: after an
 * application, from notifications and from the "switch to <other business>" hints.
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("b");
  const nextRaw = req.nextUrl.searchParams.get("next") ?? "";
  const next = /^\/isletme(\/[\w\-/]*)?(\?[\w=&%\-]*)?$/.test(nextRaw) ? nextRaw : routes.business.root();
  const res = NextResponse.redirect(new URL(next, req.nextUrl.origin));
  res.headers.set("Cache-Control", "private, no-store");
  if (!isBusinessId(id)) return res;
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL(routes.auth.login(`${req.nextUrl.pathname}${req.nextUrl.search}`), req.nextUrl.origin));
  const supabase = await createClient();
  const { data } = await supabase.from("businesses").select("id").eq("id", id).eq("owner_id", user.id).maybeSingle();
  if (data) res.cookies.set(ACTIVE_BUSINESS_COOKIE, data.id, activeBusinessCookieOptions);
  return res;
}
