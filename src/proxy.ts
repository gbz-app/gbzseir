import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_SITE_URL, IS_ADMIN_SITE } from "@/config/app-mode";
import { updateSession } from "@/lib/supabase/proxy";

const isAdminPath = (p: string) => p === "/admin" || p.startsWith("/admin/");
/** Phone + password form of the admin site; guests see it at the /admin address they opened (rewrite, not redirect). */
const ADMIN_LOGIN_PATH = "/giris/yonetim";
/** What the separate admin site serves besides /admin: only the login flow (admin pages call no /api route). */
const ADMIN_SITE_ALLOWED = (p: string) => isAdminPath(p) || p === "/giris" || p.startsWith("/giris/");

/**
 * Next 16 Proxy (formerly middleware). Lives in src/ because the app directory is src/app.
 * - Public app: the admin panel is a separate Vercel project, so /admin/* is forwarded there (same path and query).
 *   Nothing in the app links to it; this only helps someone who types the address.
 * - Admin site (NEXT_PUBLIC_APP_MODE=admin): only /admin, the login flow and APIs; everything else goes to /admin.
 * Then refreshes the Supabase session; authorization is enforced in layouts/pages/route handlers + RLS.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (IS_ADMIN_SITE) {
    if (!ADMIN_SITE_ALLOWED(pathname)) return NextResponse.redirect(new URL("/admin", request.url));
  } else if (isAdminPath(pathname)) {
    return NextResponse.redirect(`${ADMIN_SITE_URL}${pathname}${search}`, 307);
  }
  const { response, signedIn } = await updateSession(request);
  if (IS_ADMIN_SITE && !signedIn && isAdminPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = ADMIN_LOGIN_PATH;
    url.search = `?next=${encodeURIComponent(`${pathname}${search}`)}`;
    const rewrite = NextResponse.rewrite(url);
    // Keep any cookie changes (e.g. a cleared expired session) made while checking the session.
    for (const cookie of response.cookies.getAll()) rewrite.cookies.set(cookie);
    return rewrite;
  }
  return response;
}

export const config = {
  matcher: [
    // Skip Next's static output, the real static folders (public/icons, public/images), the service worker, manifest and
    // metadata files, and ROOT-level files with a static extension only. A nested path such as /firma/x.txt still runs
    // proxy(), so it cannot skip the admin-site allowlist.
    "/((?!_next/static|_next/image|icons/|images/|(?:favicon\\.ico|sw\\.js|manifest\\.webmanifest|robots\\.txt|sitemap\\.xml)$|[^/]+\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|woff2?)$).*)",
  ],
};
