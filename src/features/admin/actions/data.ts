"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { routes } from "@/core/routes";
import { APP_SETTINGS_TAG } from "@/lib/app-settings";
import { revalidatePublic } from "@/lib/revalidate-public";
import { createAdminClient, type AdminSupabase } from "@/lib/supabase/admin";
import { dbFail, withAdmin } from "../server/guard";
import { fail, ok, type ActionResult } from "../lib/action-result";
import { DEMO_SCOPE_VALUES } from "../lib/labels";
import { firstIssue } from "../lib/zod";

const schema = z.object({ scopes: z.array(z.enum(DEMO_SCOPE_VALUES)).min(1, "Temizlenecek veri türü seç."), confirm: z.literal("SİL", { message: "Onay için SİL yaz." }) });

/** Demo photos (scripts/db/seed-verticals.mjs) live in the public media bucket under this folder. */
const DEMO_MEDIA_ROOT = "demo";
const PAGE = 100;

/** Every file under `root` in the media bucket (folders are walked, list results are paged). */
async function listMediaFiles(admin: AdminSupabase, root: string): Promise<string[]> {
  const storage = admin.storage.from("media");
  const files: string[] = [];
  const queue: string[] = [root];
  let guard = 0;
  while (queue.length && guard < 500) {
    guard += 1;
    const dir = queue.shift()!;
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await storage.list(dir, { limit: PAGE, offset, sortBy: { column: "name", order: "asc" } });
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) break;
      for (const item of data) {
        const path = `${dir}/${item.name}`;
        // Folders are returned without an id.
        if (item.id === null) queue.push(path);
        else files.push(path);
      }
      if (data.length < PAGE) break;
    }
  }
  return files;
}

/** Removes the demo photos (service role; admins have no storage delete right outside media/admin). Never throws. */
async function removeDemoMedia(): Promise<{ removed: number; failed: number }> {
  try {
    const admin = createAdminClient();
    const paths = await listMediaFiles(admin, DEMO_MEDIA_ROOT);
    let removed = 0;
    let failed = 0;
    for (let i = 0; i < paths.length; i += PAGE) {
      const chunk = paths.slice(i, i + PAGE);
      const { data, error } = await admin.storage.from("media").remove(chunk);
      if (error) failed += chunk.length;
      else removed += data?.length ?? 0;
    }
    return { removed, failed };
  } catch (e) {
    console.error("[demo cleanup] demo photos could not be removed", e);
    return { removed: 0, failed: 1 };
  }
}

/**
 * Removes rows marked as demo (never real data) in one RPC transaction. 'businesses' also takes the demo events and
 * finance rows; afterwards the demo photos under media/demo/ are removed (only demo businesses and events use them).
 */
export async function clearDemoDataAction(input: z.input<typeof schema>): Promise<ActionResult<Record<string, number>>> {
  return withAdmin(async ({ supabase }) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const scopes = new Set(parsed.data.scopes);
    if (scopes.has("businesses")) {
      scopes.add("events");
      scopes.add("finance");
    }
    const { data, error } = await supabase.rpc("admin_clear_demo_data", { p_scopes: [...scopes] });
    if (error) return dbFail(error);
    const out: Record<string, number> = { ...((data as { deleted?: Record<string, number> } | null)?.deleted ?? {}) };
    const total = Object.values(out).reduce((a, b) => a + b, 0);
    let message = `${total} örnek kayıt silindi.`;
    if (scopes.has("businesses")) {
      const media = await removeDemoMedia();
      out.media = media.removed;
      if (media.failed) message += " Örnek fotoğrafların bir kısmı silinemedi; 'Örnek işletmeler' seçeneğiyle tekrar deneyebilirsin.";
      else if (media.removed) message += ` ${media.removed} örnek fotoğraf silindi.`;
    }
    await revalidatePublic({
      tags: [
        "businesses",
        "content:announcements",
        "content:news",
        "content:articles",
        "poi",
        "nearby",
        "duty",
        "listings",
        "listing-categories",
        "services",
        // 'duty' can switch duty_data_mode to 'off'.
        APP_SETTINGS_TAG,
      ],
      paths: [{ path: "/", type: "layout" }],
    });
    revalidatePath(routes.admin.data());
    return ok(out, message);
  });
}
