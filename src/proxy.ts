import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_SITE_URL, IS_ADMIN_SITE } from "@/config/app-mode";
import { updateSession } from "@/lib/supabase/proxy";

const isAdminPath = (p: string) => p === "/admin" || p.startsWith("/admin/");
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
  return updateSession(request);
}

export const config = {
  matcher: [
    // Skip static assets, the service worker, manifest and metadata files.
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|robots.txt|sitemap.xml|icons/|onboarding/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|woff2?)$).*)",
  ],
};
