"use server";

import { getCurrentUser } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, type AdminSupabase } from "@/lib/supabase/admin";
import { revalidatePublic, type PublicPath } from "@/lib/revalidate-public";
import { deleteR2UserFolder } from "@/lib/media/server";
import { routes } from "@/core/routes";

/**
 * G9 - Hesabı sil. delete_my_account runs first with the user's own session; only after it succeeded are the files
 * under `<uid>/` in both buckets removed with the service-role client (the account is gone, so RLS no longer applies
 * to the user). A failed delete leaves every file in place.
 */

/** reauth: the SMS code is older than 10 minutes (or was never verified); the UI asks for a new code. */
export type DeleteAccountResult = { ok: true } | { ok: false; message: string; reauth?: boolean };

const BUCKETS = ["media", "private-docs"] as const;
const PAGE = 100;

async function listAllFiles(admin: AdminSupabase, bucket: (typeof BUCKETS)[number], root: string): Promise<string[]> {
  const storage = admin.storage.from(bucket);
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

/** Remove every object under `<uid>/` in both buckets. Returns the number of failures; never throws. */
async function removeUserFiles(uid: string): Promise<number> {
  let admin: AdminSupabase;
  try {
    admin = createAdminClient();
  } catch (e) {
    console.error("[deleteMyAccount] service-role client unavailable, files were not removed", e);
    return 1;
  }
  let failed = 0;
  for (const bucket of BUCKETS) {
    try {
      const paths = await listAllFiles(admin, bucket, uid);
      for (let i = 0; i < paths.length; i += PAGE) {
        const chunk = paths.slice(i, i + PAGE);
        const { error } = await admin.storage.from(bucket).remove(chunk);
        if (error) failed += chunk.length;
      }
    } catch {
      failed += 1;
    }
  }
  return failed;
}

/**
 * Delete the signed-in user's account, then their files. The browser verifies the SMS code right before this call;
 * delete_my_account itself refuses (hint reauth_required) unless the session JWT carries an amr "otp" entry from the
 * last 10 minutes, so a bare session cannot delete the account.
 */
export async function deleteMyAccount(): Promise<DeleteAccountResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Oturumun doğrulanamadı. Lütfen tekrar giriş yap." };

  const supabase = await createClient();
  // Read before the delete (the businesses cascade away) so their cached pages can be expired afterwards.
  const { data: owned } = await supabase.from("businesses").select("slug").eq("owner_id", user.id).limit(20);

  const { error } = await supabase.rpc("delete_my_account");
  if (error) {
    console.error("[deleteMyAccount] delete_my_account failed", error.code, error.hint);
    if (error.hint === "reauth_required") {
      return { ok: false, reauth: true, message: "Güvenliğin için kodu yeniden doğrulaman gerekiyor. Yeni bir kod iste ve hemen gir." };
    }
    return {
      ok: false,
      message: error.code === "42501" ? "Oturumun doğrulanamadı. Lütfen tekrar giriş yap." : "Hesabın silinemedi. Lütfen tekrar dene.",
    };
  }

  const failed = await removeUserFiles(user.id);
  if (failed) console.error(`[deleteMyAccount] ${failed} storage item(s) could not be removed after an account delete`);
  // Cloudflare R2 (media adapter): everything under <uid>/ (listing photos, videos, posters). 0 when R2 is not set.
  const r2Failed = await deleteR2UserFolder(user.id);
  if (r2Failed) console.error(`[deleteMyAccount] ${r2Failed} R2 object(s) could not be removed after an account delete`);

  const paths: PublicPath[] = [
    routes.events.root(),
    { path: "/etkinlik/[slug]", type: "page" },
    routes.businesses.root(),
    { path: "/kesfet/[tur]", type: "page" },
    routes.listings.root(),
    { path: "/ilan/[id]", type: "page" },
    { path: "/is-ilani/[id]", type: "page" },
  ];
  for (const b of owned ?? []) {
    if (!b.slug) continue;
    paths.push(routes.businesses.detail(b.slug), routes.businesses.menu(b.slug));
  }
  await revalidatePublic({ tags: ["businesses", "listings"], paths });
  return { ok: true };
}
