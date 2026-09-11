"use server";

import { revalidatePath } from "next/cache";
import { routes } from "@/core/routes";
import { getCurrentUser } from "@/lib/auth/server";

/**
 * Server Action: call after a signed-in user created, edited or deleted an event (normal users too; the business
 * variant refreshMyBusinessPages only works for owners). Expires the event list, the event page, the home rail and
 * the firm pages (their Etkinlikler tab).
 */
export async function refreshEventPages(slug?: string | null): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  revalidatePath(routes.events.root());
  if (typeof slug === "string" && /^[a-z0-9-]{1,90}$/.test(slug)) revalidatePath(routes.events.detail(slug));
  revalidatePath(routes.home());
  revalidatePath("/firma/[slug]", "page");
  return { ok: true };
}
