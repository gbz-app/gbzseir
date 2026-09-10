"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { routes } from "@/core/routes";
import { dbFail, withAdmin } from "../server/guard";
import { fail, ok, type ActionResult } from "../lib/action-result";
import { firstIssue, zId } from "../lib/zod";

const schema = z.object({
  id: zId,
  status: z.enum(["new", "in_progress", "resolved", "spam"]),
  note: z.string().trim().max(2000, "Not en fazla 2000 karakter olabilir.").optional(),
});

/** Destek mesajı: durum (kullanıcı görür) + iç not (support_notes, yalnızca yöneticiler). */
export async function setSupportStatusAction(input: z.input<typeof schema>): Promise<ActionResult<null>> {
  return withAdmin(async ({ supabase, userId }) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const { id, status, note } = parsed.data;
    const { data, error } = await supabase.from("contact_messages").update({ status }).eq("id", id).select("id").maybeSingle();
    if (error) return dbFail(error);
    if (!data) return fail("Mesaj bulunamadı.", "not_found");
    if (note !== undefined) {
      const res = note
        ? await supabase.from("support_notes").upsert({ message_id: id, note, updated_by: userId }, { onConflict: "message_id" })
        : await supabase.from("support_notes").delete().eq("message_id", id);
      if (res.error) return dbFail(res.error, "Durum kaydedildi ama not kaydedilemedi.");
    }
    revalidatePath(routes.admin.support());
    revalidatePath(routes.admin.root());
    return ok(
      null,
      status === "resolved" ? "Çözüldü olarak işaretlendi." : status === "in_progress" ? "İnceleniyor olarak işaretlendi." : status === "spam" ? "Spam olarak kapatıldı." : "Kaydedildi.",
    );
  });
}
