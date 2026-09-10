"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { routes } from "@/core/routes";
import { dbFail, withAdmin } from "../server/guard";
import { fail, ok, type ActionResult } from "../lib/action-result";
import { firstIssue, zId } from "../lib/zod";

function revalidateEvents(slug?: string | null) {
  revalidatePath(routes.admin.events());
  revalidatePath(routes.events.root());
  if (slug) revalidatePath(routes.events.detail(slug));
  revalidatePath("/firma/[slug]", "page");
}

const statusSchema = z.object({ id: zId, status: z.enum(["published", "draft", "cancelled"]) });

/** Yayına al / taslağa çek / iptal et. */
export async function setEventStatusAction(input: z.input<typeof statusSchema>): Promise<ActionResult<null>> {
  return withAdmin(async ({ supabase }) => {
    const parsed = statusSchema.safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const { data, error } = await supabase.from("events").update({ status: parsed.data.status }).eq("id", parsed.data.id).select("slug").maybeSingle();
    if (error) return dbFail(error);
    if (!data) return fail("Etkinlik bulunamadı.", "not_found");
    revalidateEvents(data.slug);
    return ok(null, parsed.data.status === "published" ? "Etkinlik yayında." : parsed.data.status === "cancelled" ? "Etkinlik iptal edildi." : "Etkinlik taslağa alındı.");
  });
}

export async function deleteEventAction(input: { id: string }): Promise<ActionResult<null>> {
  return withAdmin(async ({ supabase }) => {
    const id = zId.safeParse(input.id);
    if (!id.success) return fail("Geçersiz etkinlik.");
    const { data, error } = await supabase.from("events").delete().eq("id", id.data).select("slug").maybeSingle();
    if (error) return dbFail(error);
    if (!data) return fail("Etkinlik bulunamadı.", "not_found");
    revalidateEvents(data.slug);
    return ok(null, "Etkinlik silindi.");
  });
}
