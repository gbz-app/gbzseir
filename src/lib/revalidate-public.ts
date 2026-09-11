import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
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

/** Request-scoped: did a revalidatePublic() call inside trackPublicRefresh() fail? */
const refreshScope = new AsyncLocalStorage<{ failed: boolean }>();

/**
 * Run fn and report whether any revalidatePublic() call inside it failed to reach the public app (the admin action
 * wrapper turns that into a warning). A nested scope also marks the outer one.
 */
export async function trackPublicRefresh<T>(fn: () => Promise<T>): Promise<{ result: T; refreshFailed: boolean }> {
  const outer = refreshScope.getStore();
  const scope = { failed: false };
  const result = await refreshScope.run(scope, fn);
  if (scope.failed && outer) outer.failed = true;
  return { result, refreshFailed: scope.failed };
}

function refreshFailed(...log: unknown[]): false {
  console.error("[revalidatePublic]", ...log);
  const scope = refreshScope.getStore();
  if (scope) scope.failed = true;
  return false;
}

/**
 * Make an admin change visible on the public app right away. The admin site is a separate Vercel project with its own
 * cache, so there it asks the public app's /api/revalidate (shared REVALIDATE_SECRET); on a single deployment it
 * expires locally. Never throws. Returns false (and marks the trackPublicRefresh scope) when the public app could not
 * be told: no secret, a non-2xx answer or a failed request; its pages then refresh on their normal schedule.
 */
export async function revalidatePublic({ tags = [], paths = [] }: { tags?: PublicCacheTag[]; paths?: PublicPath[] }): Promise<boolean> {
  const list = paths.map((p) => (typeof p === "string" ? { path: p } : p));
  if (!IS_ADMIN_SITE) {
    expirePublicLocally(tags, list);
    return true;
  }
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) return refreshFailed("REVALIDATE_SECRET is not set; public pages refresh on their normal schedule.");
  try {
    const res = await fetch(`${SITE_URL}/api/revalidate`, {
      method: "POST",
      headers: { "content-type": "application/json", [revalidateSecretHeader]: secret },
      body: JSON.stringify({ tags, paths: list }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    return res.ok ? true : refreshFailed(`public site answered ${res.status}`);
  } catch (e) {
    return refreshFailed("request failed", e);
  }
}
