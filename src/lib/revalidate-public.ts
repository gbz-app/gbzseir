import "server-only";
import { revalidatePath, revalidateTag } from "next/cache";
import { IS_ADMIN_SITE } from "@/config/app-mode";
import { SITE_URL } from "@/config/site";

/** Data-cache tags of public pages that admin changes can make stale (also the allowlist of /api/revalidate). */
export const PUBLIC_CACHE_TAGS = [
  "app-settings",
  "content:news",
  "content:articles",
  "content:announcements",
  "businesses",
  "services",
  "listing-categories",
  "listings",
  "poi",
  "nearby",
  "duty",
  "vocabularies",
] as const;
export type PublicCacheTag = (typeof PUBLIC_CACHE_TAGS)[number];

export type PublicPath = string | { path: string; type: "page" | "layout" };

export const revalidateSecretHeader = "x-revalidate-secret";

/** Expire public caches in this deployment (route handler and single-deployment use). */
export function expirePublicLocally(tags: readonly string[], paths: ReadonlyArray<{ path: string; type?: "page" | "layout" }>): void {
  for (const t of tags) revalidateTag(t, { expire: 0 });
  for (const p of paths) {
    if (p.type) revalidatePath(p.path, p.type);
    else revalidatePath(p.path);
  }
}

/**
 * Make an admin change visible on the public app right away. The admin site is a separate Vercel project with its own
 * cache, so there it asks the public app's /api/revalidate (shared REVALIDATE_SECRET); on a single deployment it
 * expires locally. Never throws: a failed call only means the public pages refresh on their normal schedule.
 */
export async function revalidatePublic({ tags = [], paths = [] }: { tags?: PublicCacheTag[]; paths?: PublicPath[] }): Promise<void> {
  const list = paths.map((p) => (typeof p === "string" ? { path: p } : p));
  if (!IS_ADMIN_SITE) {
    expirePublicLocally(tags, list);
    return;
  }
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) {
    console.error("[revalidatePublic] REVALIDATE_SECRET is not set; public pages refresh on their normal schedule.");
    return;
  }
  try {
    const res = await fetch(`${SITE_URL}/api/revalidate`, {
      method: "POST",
      headers: { "content-type": "application/json", [revalidateSecretHeader]: secret },
      body: JSON.stringify({ tags, paths: list }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) console.error(`[revalidatePublic] public site answered ${res.status}`);
  } catch (e) {
    console.error("[revalidatePublic] request failed", e);
  }
}
