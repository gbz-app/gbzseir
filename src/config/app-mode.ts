/**
 * The same code is deployed twice:
 * - the public app (gbzsehir.vercel.app): NEXT_PUBLIC_APP_MODE unset. /admin does not exist there.
 * - the admin site (separate Vercel project): NEXT_PUBLIC_APP_MODE=admin. Only /admin, the login flow and APIs are
 *   served; SITE_URL (NEXT_PUBLIC_SITE_URL) still points at the public app so links to public pages stay absolute.
 * Inlined at build time, so it is safe to read on the server and in client components.
 */
import { SITE_URL } from "./site";

export const IS_ADMIN_SITE = process.env.NEXT_PUBLIC_APP_MODE === "admin";

/** Origin of the separate admin site. The public app forwards /admin there. */
export const ADMIN_SITE_URL = (process.env.NEXT_PUBLIC_ADMIN_SITE_URL || "https://gbzsehir-admin.vercel.app").replace(/\/+$/, "");

/** URL of a public app page, usable from both deployments (absolute on the admin site). */
export function publicUrl(path: string): string {
  return IS_ADMIN_SITE ? `${SITE_URL}${path}` : path;
}
